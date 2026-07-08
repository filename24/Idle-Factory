import type { FactoryType, ShortageMode } from '@idle/database'
import {
  BASE_MAX_GRADE,
  FACTORY_CATALOG,
  buildCost,
  canPlace,
  creditXpBonusBps,
  effectiveMaxGrade,
  getCreditTier,
  getOccupiedCells,
  upgradeMaterialCost,
  upgradeMoneyCost,
  xpForEvent,
  type SlotState
} from '@idle/game-core'
import { PrismaClient } from '@idle/database'
import { ServiceError, Tx, runInTx } from './base'
import { QuestService } from './quest'

/** XP 보너스 배율의 분모(1만분율 bps 기준). 근거: 이슈 #17 확정 결정 6 (`xp × (10000 + bps) / 10000`). */
const XP_BONUS_DENOMINATOR_BPS = 10000n

export const DEFAULT_LAND_INDEX = 1

/**
 * 길드(서버)의 현재 신뢰도를 조회한다.
 *
 * `guildId`가 `null`/`undefined`(예: DM 컨텍스트)이거나 해당 Guild 행이 아직
 * 없으면 `null`을 반환한다. 신뢰도 관련 계산은 이 `null`을 "신뢰도 미상 →
 * 기본 상한·보너스 없음" 폴백으로 처리한다.
 *
 * 근거: `docs/design/07-global-system.md` §신뢰도 시스템, 이슈 #17 확정 결정 1·6·7.
 *
 * @param db 트랜잭션 클라이언트 또는 PrismaClient (읽기 전용 조회)
 * @param guildId 커맨드 실행 서버 ID (없으면 `null`)
 * @returns 신뢰도(0~2000) 또는 `null`
 */
async function fetchGuildCredit(
  db: Tx | PrismaClient,
  guildId: string | null | undefined
): Promise<number | null> {
  if (!guildId) return null
  const guild = await db.guild.findUnique({
    where: { id: guildId },
    select: { credit: true }
  })
  return guild?.credit ?? null
}

/**
 * 신뢰도(또는 `null`)로부터 공장 유효 최대 등급을 계산한다.
 *
 * 신뢰도 미상(`null`)이면 기본 상한(`BASE_MAX_GRADE` = 8)로 폴백한다.
 * 근거: 이슈 #17 확정 결정 1, `docs/design/03-factories.md` §등급 시스템.
 */
function resolveMaxGrade(credit: number | null): number {
  return credit === null ? BASE_MAX_GRADE : effectiveMaxGrade(credit)
}

/**
 * 신뢰도(또는 `null`)로부터 BUILD/UPGRADE XP 보너스(bps)를 계산한다.
 *
 * 신뢰도 미상(`null`)이면 보너스 없음(0)으로 폴백한다.
 * 근거: 이슈 #17 확정 결정 6, `docs/design/07-global-system.md` §신뢰도 효과.
 */
function resolveXpBonusBps(credit: number | null): number {
  return credit === null ? 0 : creditXpBonusBps(credit)
}

/**
 * 신뢰도가 RESTRICTED(0~299) 구간이라 기능이 차단되어야 하는지 판정한다.
 *
 * 신뢰도 미상(`null`)이면 차단하지 않는다(폴백 허용).
 * 근거: 이슈 #17 확정 결정 7, `docs/design/07-global-system.md` §신뢰도 효과.
 */
function isCreditRestricted(credit: number | null): boolean {
  return credit !== null && getCreditTier(credit) === 'RESTRICTED'
}

/**
 * BUILD/UPGRADE 기본 XP에 신뢰도 보너스(bps)를 적용한 최종 XP를 반환한다.
 *
 * BigInt 정수 연산: `baseXp × (10000 + bps) / 10000`.
 * 근거: 이슈 #17 확정 결정 6.
 */
function applyXpBonus(baseXp: bigint, bonusBps: number): bigint {
  return (
    (baseXp * (XP_BONUS_DENOMINATOR_BPS + BigInt(bonusBps))) /
    XP_BONUS_DENOMINATOR_BPS
  )
}

export interface BuildParams {
  readonly userId: string
  readonly type: FactoryType
  readonly anchorX: number
  readonly anchorY: number
  readonly landIndex?: number
  /**
   * 커맨드가 실행된 서버 ID. 신뢰도 기반 기능 제한(건설 차단)·XP 보너스 산정에
   * 사용한다. DM 등 서버 컨텍스트가 없으면 `null`(제한·보너스 없음).
   * 근거: 이슈 #17 확정 결정 6·7.
   */
  readonly guildId?: string | null
}

export interface DestroyParams {
  readonly userId: string
  readonly factoryId: string
}

export interface DestroyResult {
  readonly landIndex: number
  readonly type: FactoryType
  readonly refund: bigint
  readonly remainingMoney: bigint
}

export interface UpgradeParams {
  readonly userId: string
  readonly factoryId: string
  /**
   * 커맨드가 실행된 서버 ID. 신뢰도 기반 유효 최대 등급·기능 제한(업그레이드
   * 차단)·XP 보너스 산정에 사용한다. 서버 컨텍스트가 없으면 `null`(기본 상한 8·
   * 제한·보너스 없음). 근거: 이슈 #17 확정 결정 1·6·7.
   */
  readonly guildId?: string | null
}

export interface SetModeParams {
  readonly userId: string
  readonly factoryId: string
  readonly mode: ShortageMode
}

export interface FactoryInfoDTO {
  readonly id: string
  readonly type: FactoryType
  readonly grade: number
  readonly anchorX: number
  readonly anchorY: number
  readonly width: number
  readonly height: number
  readonly shortageMode: ShortageMode
  readonly nextUpgradeCost: {
    readonly money: bigint | null
    readonly material: { material: string; amount: bigint } | null
  }
  readonly unlockLevel: number
  /**
   * 이 서버의 신뢰도 기준 유효 최대 등급(8 | 9 | 10). 신뢰도 미상이면 기본 상한 8.
   * 근거: 이슈 #17 확정 결정 1, `docs/design/03-factories.md` §등급 시스템.
   */
  readonly effectiveMaxGrade: number
}

async function ensureLandWithSlots(tx: Tx, userId: string, landIndex: number) {
  const land = await tx.land.findUnique({
    where: { userId_index: { userId, index: landIndex } },
    include: { slots: true }
  })
  if (!land) throw new ServiceError('LAND_NOT_FOUND')
  return land
}

export const FactoryService = {
  async build(prisma: PrismaClient, params: BuildParams) {
    const {
      userId,
      type,
      anchorX,
      anchorY,
      landIndex = DEFAULT_LAND_INDEX,
      guildId
    } = params
    const entry = FACTORY_CATALOG[type]
    const cost = buildCost(type)

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new ServiceError('USER_NOT_FOUND')

      // 신뢰도 RESTRICTED(0~299) 서버에서는 공장 건설 차단 (확정 결정 7).
      // 버튼/셀렉트 핸들러 우회를 막기 위해 서비스 레이어에서 가드한다.
      const credit = await fetchGuildCredit(tx, guildId)
      if (isCreditRestricted(credit)) {
        throw new ServiceError('CREDIT_RESTRICTED', undefined, { credit })
      }

      if (user.level < entry.unlockLevel) {
        throw new ServiceError('LEVEL_LOCKED')
      }
      if (user.money < cost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: cost.toString(),
          have: user.money.toString()
        })
      }

      const land = await ensureLandWithSlots(tx, userId, landIndex)
      const slotStates: SlotState[] = land.slots.map((s) => ({
        x: s.x,
        y: s.y,
        type: s.type,
        factoryId: s.factoryId,
        locked: s.locked
      }))

      const placement = canPlace({
        landWidth: land.width,
        landHeight: land.height,
        slots: slotStates,
        type,
        anchorX,
        anchorY
      })
      if (!placement.ok) {
        switch (placement.reason) {
          case 'OUT_OF_BOUNDS':
            throw new ServiceError('OUT_OF_BOUNDS')
          case 'LOCKED':
            throw new ServiceError('SLOT_LOCKED')
          case 'OCCUPIED':
          case 'OVERLAP':
          default:
            throw new ServiceError('SLOT_OCCUPIED')
        }
      }

      if (entry.buildMaterialCost) {
        const { material, amount } = entry.buildMaterialCost
        const warehouse = await tx.warehouse.findUnique({
          where: { userId }
        })
        if (!warehouse) {
          throw new ServiceError('INSUFFICIENT_MATERIAL', undefined, {
            material,
            amount
          })
        }
        const stack = await tx.warehouseStack.findUnique({
          where: {
            warehouseId_material: {
              warehouseId: warehouse.id,
              material
            }
          }
        })
        if (!stack || stack.count < amount) {
          throw new ServiceError('INSUFFICIENT_MATERIAL', undefined, {
            material,
            amount
          })
        }
        await tx.warehouseStack.update({
          where: { id: stack.id },
          data: { count: { decrement: amount } }
        })
      }

      // 건설(BUILD) XP 지급 + 신뢰도 XP 보너스 적용 (확정 결정 6).
      // 보너스는 커맨드 실행 서버(guildId)의 신뢰도 기준.
      const buildXp = applyXpBonus(
        xpForEvent({ kind: 'BUILD', cost }),
        resolveXpBonusBps(credit)
      )

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost }, xp: { increment: buildXp } }
      })

      const cells = getOccupiedCells(
        anchorX,
        anchorY,
        entry.size.width,
        entry.size.height
      )

      const factory = await tx.factory.create({
        data: {
          userId,
          landId: land.id,
          type,
          tier: entry.tier,
          grade: 1,
          anchorX,
          anchorY,
          width: entry.size.width,
          height: entry.size.height
        }
      })

      await tx.slot.updateMany({
        where: {
          landId: land.id,
          OR: cells.map((c) => ({ x: c.x, y: c.y }))
        },
        data: { factoryId: factory.id }
      })

      // 빌드 완료 직후 같은 트랜잭션 안에서 퀘스트 진행도 갱신.
      // ownedAfter 는 같은 tier 누적 보유 수 (Q5 minTotal 매칭에 사용).
      const ownedAfter = await tx.factory.count({
        where: { userId, tier: entry.tier }
      })
      const quest = await QuestService.progress(tx, userId, {
        kind: 'FACTORY_BUILT',
        tier: entry.tier,
        type,
        ownedAfter
      })

      return { factory, quest }
    })
  },

  /**
   * 공장을 철거하고 빌드 비용의 50%를 환불한다.
   *
   * 상장된 공장은 철거를 차단한다(`FACTORY_LISTED`) — Factory 삭제 시
   * Stock/StockHolding 이 Cascade 로 함께 삭제되어 주주 지분이 무보상으로
   * 증발하기 때문. 상장폐지 플로우는 Phase 5+ (#18).
   *
   * @throws {ServiceError} `FACTORY_NOT_FOUND` / `FACTORY_LISTED`
   */
  async destroy(
    prisma: PrismaClient,
    params: DestroyParams
  ): Promise<DestroyResult> {
    const { userId, factoryId } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId)
        throw new ServiceError('FACTORY_NOT_FOUND')

      // 상장 공장 철거 차단 — Stock/StockHolding Cascade 삭제로 주주 지분이
      // 무보상 증발하는 것을 막는다 (#18 리뷰 확정, 상장폐지는 Phase 5+).
      const listed = await tx.stock.findUnique({
        where: { factoryId },
        select: { id: true }
      })
      if (listed) {
        throw new ServiceError('FACTORY_LISTED', undefined, {
          stockId: listed.id
        })
      }

      const slot = await tx.slot.findFirst({
        where: { factoryId },
        select: { land: { select: { index: true } } }
      })
      const landIndex = slot?.land?.index ?? DEFAULT_LAND_INDEX

      await tx.slot.updateMany({
        where: { factoryId },
        data: { factoryId: null }
      })
      await tx.factory.delete({ where: { id: factoryId } })

      const refund = buildCost(factory.type) / 2n
      const updated = await tx.user.update({
        where: { id: userId },
        data: { money: { increment: refund } }
      })

      return {
        landIndex,
        type: factory.type,
        refund,
        remainingMoney: updated.money
      }
    })
  },

  async upgrade(prisma: PrismaClient, params: UpgradeParams) {
    const { userId, factoryId, guildId } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }

      // 신뢰도 RESTRICTED(0~299) 서버에서는 업그레이드 차단 (확정 결정 7).
      const credit = await fetchGuildCredit(tx, guildId)
      if (isCreditRestricted(credit)) {
        throw new ServiceError('CREDIT_RESTRICTED', undefined, { credit })
      }

      // 유효 최대 등급은 신뢰도에 따라 8/9/10 (확정 결정 1). 기존 하드코딩(10) 대체.
      // 이미 유효 상한을 초과한 등급은 강제 다운그레이드하지 않고 추가 업그레이드만 차단.
      const maxGrade = resolveMaxGrade(credit)
      if (factory.grade >= maxGrade) {
        throw new ServiceError('MAX_GRADE', undefined, { maxGrade })
      }

      const money = upgradeMoneyCost(factory.type, factory.grade)
      const mat = upgradeMaterialCost(factory.type, factory.grade)

      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      if (user.money < money) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: money.toString(),
          have: user.money.toString()
        })
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { userId }
      })
      if (!warehouse) throw new ServiceError('INSUFFICIENT_MATERIAL')
      const stack = await tx.warehouseStack.findUnique({
        where: {
          warehouseId_material: {
            warehouseId: warehouse.id,
            material: mat.material
          }
        }
      })
      if (!stack || stack.count < mat.amount) {
        throw new ServiceError('INSUFFICIENT_MATERIAL')
      }

      await tx.warehouseStack.update({
        where: { id: stack.id },
        data: { count: { decrement: mat.amount } }
      })

      // 업그레이드 XP + 신뢰도 XP 보너스 적용 (확정 결정 6).
      const xp = applyXpBonus(
        xpForEvent({ kind: 'UPGRADE', cost: money }),
        resolveXpBonusBps(credit)
      )

      await tx.user.update({
        where: { id: userId },
        data: {
          money: { decrement: money },
          xp: { increment: xp }
        }
      })

      const updated = await tx.factory.update({
        where: { id: factoryId },
        data: { grade: { increment: 1 } }
      })
      const quest = await QuestService.progress(tx, userId, {
        kind: 'FACTORY_UPGRADED',
        fromGrade: factory.grade,
        toGrade: updated.grade,
        type: factory.type
      })
      return { factory: updated, quest }
    })
  },

  async info(
    prisma: PrismaClient,
    factoryId: string,
    guildId?: string | null
  ): Promise<FactoryInfoDTO> {
    const factory = await prisma.factory.findUnique({
      where: { id: factoryId }
    })
    if (!factory) throw new ServiceError('FACTORY_NOT_FOUND')
    const entry = FACTORY_CATALOG[factory.type]
    // 유효 최대 등급은 서버 신뢰도 기준 (확정 결정 1). 신뢰도 미상이면 기본 상한 8.
    const credit = await fetchGuildCredit(prisma, guildId)
    const maxGrade = resolveMaxGrade(credit)
    const canUpgrade = factory.grade < maxGrade
    return {
      id: factory.id,
      type: factory.type,
      grade: factory.grade,
      anchorX: factory.anchorX,
      anchorY: factory.anchorY,
      width: factory.width,
      height: factory.height,
      shortageMode: factory.shortageMode,
      unlockLevel: entry.unlockLevel,
      effectiveMaxGrade: maxGrade,
      nextUpgradeCost: canUpgrade
        ? {
            money: upgradeMoneyCost(factory.type, factory.grade),
            material: upgradeMaterialCost(factory.type, factory.grade)
          }
        : { money: null, material: null }
    }
  },

  async setMode(prisma: PrismaClient, params: SetModeParams) {
    const { userId, factoryId, mode } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }
      return tx.factory.update({
        where: { id: factoryId },
        data: { shortageMode: mode }
      })
    })
  }
}
