import { Prisma, PrismaClient } from '@idle/database'

/**
 * 서비스 계층 에러 코드.
 *
 * - `MAX_LANDS`: 유저가 이미 최대 5개 토지를 보유 (docs/design/11-land.md).
 * - `LAND_ALREADY_EXISTS`: 구매하려는 index의 토지가 이미 존재.
 * - `INVALID_LAND_INDEX`: 구매 대상 index가 유효 범위(2..5)를 벗어났거나 연속성 조건 위반.
 * - `MOVE_SAME_POSITION`: 공장 이동 목적지가 현재 위치와 동일 (docs/design/11-land.md §공장 이동).
 */
export type ServiceErrorCode =
  | 'USER_NOT_FOUND'
  | 'INSUFFICIENT_MONEY'
  | 'INSUFFICIENT_MATERIAL'
  | 'SLOT_OCCUPIED'
  | 'SLOT_LOCKED'
  | 'SLOT_ALREADY_UNLOCKED'
  | 'OUT_OF_BOUNDS'
  | 'FACTORY_NOT_FOUND'
  | 'LEVEL_LOCKED'
  | 'MAX_GRADE'
  | 'WAREHOUSE_FULL'
  | 'MAX_LANDS'
  | 'LAND_ALREADY_EXISTS'
  | 'INVALID_LAND_INDEX'
  | 'LAND_NOT_FOUND'
  | 'MOVE_SAME_POSITION'
  // 퀘스트
  | 'QUEST_NOT_FOUND'
  | 'QUEST_NOT_COMPLETED'
  | 'QUEST_ALREADY_CLAIMED'
  // 마켓
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'INVALID_DURATION'
  | 'LISTING_NOT_FOUND'
  | 'LISTING_NOT_ACTIVE'
  | 'NOT_LISTING_OWNER'
  | 'SELF_PURCHASE'
  // 글로벌 마켓 (docs/design/06-market.md)
  // - PRICE_NOT_FOUND: GlobalMarketPrice 행 없음 — 시드 누락(글로벌 판매 불가).
  // - PRICE_OUT_OF_RANGE: 유저 상점 단가가 글로벌 현재가 ±50% 밴드 밖
  //   (등록 시 + 구매 시 재검증 — #15 확정).
  | 'PRICE_NOT_FOUND'
  | 'PRICE_OUT_OF_RANGE'
  // 자재 직구매 (docs/design/04-economy.md §자재 직구매, #16)
  // - MATERIAL_NOT_DIRECT_BUYABLE: T3 완제품·RAW_BOOSTER 는 직구매 불가.
  // - DAILY_LIMIT_EXCEEDED: 레벨 구간별 일일 총 한도 초과 (KST 자정 리셋).
  | 'MATERIAL_NOT_DIRECT_BUYABLE'
  | 'DAILY_LIMIT_EXCEEDED'
  // 공장 부스터 (docs/design/03-factories.md §업그레이드 부스터, #19)
  // - BOOSTER_NOT_AVAILABLE: 현재 등급이 분기 등급(3/5/7/10)이 아니어서 부스터 선택 불가.
  // - RAW_BOOSTER_ALREADY_APPLIED: 이 공장에는 이미 원자재 부스터가 투입됨 (공장당 1회).
  | 'BOOSTER_NOT_AVAILABLE'
  | 'RAW_BOOSTER_ALREADY_APPLIED'

export class ServiceError extends Error {
  public readonly code: ServiceErrorCode
  public readonly details?: unknown

  constructor(code: ServiceErrorCode, message?: string, details?: unknown) {
    super(message ?? code)
    this.name = 'ServiceError'
    this.code = code
    this.details = details
  }
}

export type Tx = Prisma.TransactionClient

/**
 * 재시도 대상 Prisma 에러 코드 — P2034 = write conflict / deadlock.
 * Prisma 7 은 Postgres 40001(serialization_failure)·40P01(deadlock_detected)
 * 을 모두 단일 P2034 로 매핑하므로 이 한 코드로 둘 다 커버한다.
 */
const RETRIABLE_TX_CODE = 'P2034'

/** 트랜잭션 총 시도 횟수(초기 1회 + 재시도 4회). Prisma 공식 예제의 MAX_RETRIES=5 준용. */
const MAX_TX_ATTEMPTS = 5

/** Full-jitter 지수 백오프 파라미터(ms). 핫로우 thundering herd 완화용. */
const BACKOFF_BASE_MS = 25
const BACKOFF_CAP_MS = 500

/**
 * 인터랙티브 트랜잭션 옵션.
 * 기본값(maxWait 2000ms / timeout 5000ms)은 온보딩 다중 op 트랜잭션
 * (ensureWithinTx + user.update + seedTutorial)이 재시도·경합 하에서 빠듯하므로
 * 명시적으로 여유를 준다.
 */
const TX_OPTIONS = {
  isolationLevel: 'Serializable',
  maxWait: 5000,
  timeout: 10000
} as const

/**
 * 주어진 에러가 P2034(직렬화 충돌/데드락)인지 판별한다.
 *
 * `PrismaClientKnownRequestError` 의 `instanceof` 대신 `code` 기반 덕타이핑을
 * 쓴다: instanceof 는 tsup 번들링·모노레포 중복 설치로 클래스 신원(realm)이
 * 깨지면 오탐(false)이 날 수 있고, `@idle/database` 빌드 타입이 해당 클래스를
 * 노출하지 않기 때문. `code` 판정은 번들링에 무관하게 견고하다.
 */
function isRetriableWriteConflict(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === RETRIABLE_TX_CODE
  )
}

/** Full-jitter 백오프 지연(ms): random(0, min(cap, base * 2^attempt)). */
function backoffDelayMs(attempt: number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return Math.floor(Math.random() * ceiling)
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Serializable 격리로 트랜잭션을 실행하고, P2034(write conflict/deadlock)만
 * full-jitter 백오프로 재시도한다.
 *
 * - 매 시도마다 새 `$transaction`(BEGIN..COMMIT)을 연다. tx 핸들 재사용 금지 —
 *   40001/40P01 로 abort 된 트랜잭션은 이미 롤백되어 재사용 시 P2028 을 던진다.
 * - P2034 이외의 에러(`ServiceError`, P2002 unique, P2025, P2028 timeout 등)는
 *   전이(transient)가 아니므로 즉시 rethrow — 재시도하지 않는다.
 * - `fn` 은 1..N 회 재실행될 수 있으므로 DB 작업만 담고 부수효과는 밖에서 처리해야
 *   한다(현 호출부는 Discord 응답을 runInTx 바깥에서 수행하므로 안전).
 */
export async function runInTx<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
    try {
      // 매 시도 새 트랜잭션을 연다(핸들 재사용 아님).
      return await prisma.$transaction(fn, TX_OPTIONS)
    } catch (err) {
      lastError = err
      const isLastAttempt = attempt === MAX_TX_ATTEMPTS - 1
      if (!isRetriableWriteConflict(err) || isLastAttempt) {
        throw err
      }
      await sleep(backoffDelayMs(attempt))
    }
  }
  // 도달 불가(루프는 return 또는 throw 로만 종료). 타입 안전용 방어.
  throw lastError
}
