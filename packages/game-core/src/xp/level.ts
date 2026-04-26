/**
 * 플레이어 경험치·레벨 계산.
 *
 * 공식 근거: `docs/design/09-level-xp.md` §XP 공식, §이벤트별 XP.
 */

/**
 * XP를 부여하는 게임 이벤트.
 *
 * 각 이벤트는 고유한 XP 산식을 가진다. `xpForEvent` 참조.
 */
export type XpEvent =
  | { kind: 'TICK_PRODUCTION'; ticks: number }
  | { kind: 'MARKET_SELL'; count?: number }
  | { kind: 'USER_TRADE'; count?: number }
  | { kind: 'STOCK_REALIZE'; count?: number }
  | { kind: 'BUILD'; cost: bigint }
  | { kind: 'UPGRADE'; cost: bigint }

/**
 * 현재 플레이어의 레벨·레벨 내 누적 XP.
 */
export interface XpProgress {
  /** 현재 레벨 (>=1) */
  readonly level: number
  /** 현재 레벨에서 획득한 XP (다음 레벨 요구 XP 미만) */
  readonly xpInLevel: bigint
}

/**
 * `applyXp` 결과.
 */
export interface ApplyXpResult {
  /** 업데이트된 진행 상태 */
  readonly progress: XpProgress
  /** 이번 호출로 오른 레벨 수 (0 이상) */
  readonly levelsGained: number
  /** 레벨 업 발생 여부 */
  readonly leveledUp: boolean
}

/** BUILD/UPGRADE 이벤트로 받을 수 있는 XP 상한. */
const BUILD_XP_CAP = 1000n
/** BUILD/UPGRADE 이벤트에서 비용 → XP 환산 분모 (1000원당 1 XP). */
const BUILD_XP_DIVISOR = 1000n

/**
 * 주어진 레벨에서 다음 레벨로 가기 위한 요구 XP.
 *
 * 공식: `requiredXp = floor(100 × level^2.2)`.
 * 근거: `docs/design/09-level-xp.md` §XP 공식.
 *
 * @param level 현재 레벨 (>=1, 정수)
 * @returns 요구 XP (bigint)
 * @throws {RangeError} level이 1 미만이거나 정수/유한수가 아닌 경우
 */
export function xpRequiredForLevel(level: number): bigint {
  if (!Number.isFinite(level) || !Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${level}`)
  }
  const raw = Math.floor(100 * Math.pow(level, 2.2))
  return BigInt(raw)
}

/**
 * 한 이벤트가 지급하는 XP 양.
 *
 * 수치 근거: `docs/design/09-level-xp.md` §이벤트별 XP.
 *
 * - `TICK_PRODUCTION`: tick당 5 XP
 * - `MARKET_SELL`: 거래당 20 XP
 * - `USER_TRADE`: 거래당 15 XP
 * - `STOCK_REALIZE`: 거래당 10 XP
 * - `BUILD` / `UPGRADE`: `floor(cost / 1000)`, 단 최대 1000 XP
 *
 * @param event XP 이벤트
 * @returns 지급 XP (bigint)
 */
export function xpForEvent(event: XpEvent): bigint {
  switch (event.kind) {
    case 'TICK_PRODUCTION':
      return 5n * BigInt(event.ticks)
    case 'MARKET_SELL':
      return 20n * BigInt(event.count ?? 1)
    case 'USER_TRADE':
      return 15n * BigInt(event.count ?? 1)
    case 'STOCK_REALIZE':
      return 10n * BigInt(event.count ?? 1)
    case 'BUILD':
    case 'UPGRADE': {
      const scaled = event.cost / BUILD_XP_DIVISOR
      return scaled < BUILD_XP_CAP ? scaled : BUILD_XP_CAP
    }
  }
}

/**
 * 진행 상태에 XP delta를 누적하고 필요 시 레벨 업을 반영한다.
 *
 * 한 호출에서 여러 레벨이 오를 수 있다(충분한 delta가 주어진 경우).
 * 입력 `current`는 변형되지 않는다(불변).
 *
 * @param current 현재 진행 상태
 * @param delta 추가 XP (0 이상 권장)
 * @returns 업데이트된 진행 상태 + 레벨업 정보
 */
export function applyXp(current: XpProgress, delta: bigint): ApplyXpResult {
  let level = current.level
  let xpInLevel = current.xpInLevel + delta
  let gained = 0
  while (true) {
    const req = xpRequiredForLevel(level)
    if (xpInLevel < req) break
    xpInLevel -= req
    level += 1
    gained += 1
  }
  return {
    progress: { level, xpInLevel },
    levelsGained: gained,
    leveledUp: gained > 0,
  }
}
