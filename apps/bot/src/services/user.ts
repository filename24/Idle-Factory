import type { PrismaClient, User } from '@idle/database'
import {
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  generateSlotTypes,
  isInitiallyActive
} from '@idle/game-core'
import { LANG_AUTO, isSupportedLanguage } from '../utils/language'
import { ServiceError, runInTx, type Tx } from './base'

export interface EnsureUserInput {
  readonly discordId: string
  readonly nickname?: string
}

/** `updateLang` 반환 타입 — Prisma 의 User row 그대로. */
export type UserLangRow = User

/** 유저의 첫 토지 index (docs/11-land.md — 1-based). */
const STARTER_LAND_INDEX = 1
const DEFAULT_WAREHOUSE_GRADE = 1
/** 신규 유저 초기 자금 (docs/design/00-onboarding.md) */
const STARTER_MONEY = 1_000n

/**
 * 신규 토지 한 장을 4×4 구조 + 좌상단 3×3 만 활성(나머지 7칸 locked) 상태로 생성한다.
 *
 * - `Land.width/height` 는 **구조적 그리드 크기** — 항상 4×4. 활성 영역은 `Slot.locked` 가 결정한다.
 *   (이전 모델은 width 를 활성 bounding box 로 사용했지만, 단순성과 가독성을 위해 구조 크기로 통일.)
 * - Slot 레코드는 4×4 = 16개 생성. 좌상단 3×3 영역 밖의 7칸은 `locked=true`.
 * - 특수 슬롯 추첨은 잠금 포함 16칸 전부에 적용 (구매 전까지는 보너스 미적용).
 *
 * @param tx Prisma 트랜잭션
 * @param userId 대상 유저 id
 * @param targetIndex 생성할 토지 index (1..5)
 */
export async function createLandWithSlots(
  tx: Tx,
  userId: string,
  targetIndex: number = STARTER_LAND_INDEX
): Promise<void> {
  const land = await tx.land.create({
    data: {
      userId,
      index: targetIndex,
      width: LAND_MAX_WIDTH,
      height: LAND_MAX_HEIGHT
    }
  })

  // 잠긴 슬롯에도 특수 타입을 배치 (docs/11 §특수 슬롯 생성 규칙).
  const grid = generateSlotTypes({
    width: LAND_MAX_WIDTH,
    height: LAND_MAX_HEIGHT
  })

  const slotsData = grid.flatMap((row, y) =>
    row.map((type, x) => ({
      landId: land.id,
      x,
      y,
      type,
      locked: !isInitiallyActive(x, y)
    }))
  )

  await tx.slot.createMany({ data: slotsData })
}

async function createWarehouse(tx: Tx, userId: string): Promise<void> {
  await tx.warehouse.create({
    data: {
      userId,
      grade: DEFAULT_WAREHOUSE_GRADE
    }
  })
}

async function findHydratedUser(tx: Tx, discordId: string) {
  return tx.user.findUniqueOrThrow({
    where: { id: discordId },
    include: {
      lands: { include: { slots: true }, orderBy: { index: 'asc' } },
      warehouse: true
    }
  })
}

export type HydratedUser = Awaited<ReturnType<typeof findHydratedUser>>

export const UserService = {
  /**
   * 트랜잭션 내부에서 호출되는 멱등 ensure. 동의 버튼 핸들러처럼 자기 트랜잭션
   * 안에서 다른 작업과 함께 묶고 싶을 때 사용한다.
   *
   * `ensure` 와 동일한 시드 효과(User · Land · Warehouse + STARTER_MONEY)를 제공.
   * 이미 존재하는 행은 건드리지 않는다.
   */
  async ensureWithinTx(tx: Tx, input: EnsureUserInput): Promise<HydratedUser> {
    const { discordId, nickname } = input

    const existing = await tx.user.findUnique({
      where: { id: discordId },
      select: { id: true }
    })

    if (!existing) {
      // lang 은 스키마 기본값 'auto'(서버 설정 따름)로 둔다. 가입 시점의
      // 클라이언트 로케일을 개인 설정으로 박아두면 서버 언어 설정이 아무에게도
      // 적용되지 않는다 — 클라이언트 로케일은 리졸버가 3순위로 이미 참조한다.
      await tx.user.create({
        data: {
          id: discordId,
          money: STARTER_MONEY,
          ...(nickname !== undefined ? { nickname } : {})
        }
      })
    }

    const hasLand = await tx.land.findUnique({
      where: {
        userId_index: { userId: discordId, index: STARTER_LAND_INDEX }
      },
      select: { id: true }
    })
    if (!hasLand) {
      await createLandWithSlots(tx, discordId, STARTER_LAND_INDEX)
    }

    const hasWarehouse = await tx.warehouse.findUnique({
      where: { userId: discordId },
      select: { id: true }
    })
    if (!hasWarehouse) {
      await createWarehouse(tx, discordId)
    }

    return findHydratedUser(tx, discordId)
  },

  /**
   * Idempotently ensure a User, their starter Land (index=1, 3×3 active + 7 locked slots
   * with generated special types), and Warehouse (grade 1) exist. Safe to call repeatedly —
   * returns the hydrated User on every call.
   */
  async ensure(
    prisma: PrismaClient,
    input: EnsureUserInput
  ): Promise<HydratedUser> {
    return runInTx(prisma, (tx) => UserService.ensureWithinTx(tx, input))
  },

  /**
   * 유저 개인 언어 설정을 변경한다.
   *
   * 허용값은 `'auto'`(서버 설정 따름) 또는 번역 리소스가 존재하는 로케일뿐이다.
   * 그 밖의 값은 `utils/language` 리졸버가 조용히 건너뛰기 때문에, 저장까지
   * 허용하면 "설정은 바뀌었는데 언어는 안 바뀌는" 상태가 된다 — 쓰기 경계에서
   * 막는 이유다. 검증은 존재 확인보다 먼저 수행한다.
   *
   * @param prisma Prisma 클라이언트
   * @param discordId 대상 유저 snowflake
   * @param lang `'auto'` 또는 지원 로케일
   * @throws {ServiceError} `UNSUPPORTED_LANGUAGE` — 허용되지 않는 값
   * @throws {ServiceError} `USER_NOT_FOUND` — 유저 row 없음
   */
  async updateLang(
    prisma: PrismaClient,
    discordId: string,
    lang: string
  ): Promise<UserLangRow> {
    if (lang !== LANG_AUTO && !isSupportedLanguage(lang)) {
      throw new ServiceError(
        'UNSUPPORTED_LANGUAGE',
        `unsupported language: ${lang}`
      )
    }

    const exists = await prisma.user.findUnique({
      where: { id: discordId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError('USER_NOT_FOUND', `user ${discordId} not found`)
    }

    return prisma.user.update({
      where: { id: discordId },
      data: { lang }
    })
  }
} as const
