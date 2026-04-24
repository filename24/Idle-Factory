import type { PrismaClient } from '@idle/database'
import {
  applyXp,
  computeElapsedTicks,
  computeFactoryYield,
  computeFree,
  computeLandSynergies,
  getSpecialSlotBonus,
  getSynergyMultiplier,
  TICK_MS,
  xpForEvent,
  type FactoryState,
  type MaterialBag,
  type MaterialType,
  type SlotType,
  type SynergyBonusMap,
  type SynergyFactoryInput,
  type SynergySlotInput
} from '@idle/game-core'
import { runInTx, ServiceError, type Tx } from './base'

export interface FactoryHarvestSummary {
  readonly factoryId: string
  readonly type: string
  readonly ticks: number
  readonly produced: MaterialBag
  readonly consumed: MaterialBag
}

export interface HarvestAllResult {
  readonly factories: FactoryHarvestSummary[]
  readonly xpGained: bigint
  readonly newLevel: number
  readonly leveledUp: boolean
}

async function applyMaterialDelta(
  tx: Tx,
  warehouseId: string,
  material: MaterialType,
  delta: bigint
): Promise<void> {
  if (delta === 0n) return
  const existing = await tx.warehouseStack.findUnique({
    where: { warehouseId_material: { warehouseId, material } }
  })
  const current = existing?.count ?? 0n
  const next = current + delta
  if (next < 0n) {
    throw new ServiceError(
      'INSUFFICIENT_MATERIAL',
      `WarehouseStack ${warehouseId}/${material} would underflow`
    )
  }
  if (existing) {
    await tx.warehouseStack.update({
      where: { warehouseId_material: { warehouseId, material } },
      data: { count: next }
    })
  } else {
    await tx.warehouseStack.create({
      data: { warehouseId, material, count: next }
    })
  }
}

/**
 * 수확 대상 공장들이 속한 모든 토지의 시너지 맵을 미리 계산한다.
 *
 * 같은 토지에 있는 다른 공장(수확 대상이 아니어도 provider 가 될 수 있음) + 슬롯 상태까지
 * 전부 모아 `computeLandSynergies` 를 호출한다. 결과는 `landId → SynergyBonusMap`.
 */
async function buildSynergyMapsForFactories(
  tx: Tx,
  harvestTargets: ReadonlyArray<{ landId: string }>
): Promise<Map<string, SynergyBonusMap>> {
  const result = new Map<string, SynergyBonusMap>()
  const landIds = [...new Set(harvestTargets.map((f) => f.landId))]
  if (landIds.length === 0) return result

  const lands = await tx.land.findMany({
    where: { id: { in: landIds } },
    include: {
      factories: {
        select: {
          id: true,
          type: true,
          anchorX: true,
          anchorY: true,
          width: true,
          height: true
        }
      },
      slots: {
        select: { x: true, y: true, type: true, locked: true }
      }
    }
  })

  for (const land of lands) {
    const factoriesInput: SynergyFactoryInput[] = land.factories.map((f) => ({
      id: f.id,
      type: f.type as SynergyFactoryInput['type'],
      anchorX: f.anchorX,
      anchorY: f.anchorY,
      width: f.width,
      height: f.height
    }))
    const slotsInput: SynergySlotInput[] = land.slots.map((s) => ({
      x: s.x,
      y: s.y,
      type: s.type as SynergySlotInput['type'],
      locked: s.locked
    }))
    result.set(
      land.id,
      computeLandSynergies({ factories: factoriesInput, slots: slotsInput })
    )
  }

  return result
}

export class HarvestService {
  /**
   * Harvest every factory owned by the user. Advances `lastHarvestAt` by the
   * realized tick count (NOT real time), decrements consumed recipe materials,
   * increments primary+secondary outputs (clamped by warehouse free space),
   * and awards XP for produced ticks.
   */
  public static async harvestAll(
    prisma: PrismaClient,
    userId: string,
    nowInput?: Date
  ): Promise<HarvestAllResult> {
    return harvestWhere(prisma, userId, { userId }, nowInput)
  }

  /**
   * Harvest a single factory identified by `factoryId`. Same semantics as
   * `harvestAll` but restricted to one factory row owned by `userId`.
   *
   * Throws `FACTORY_NOT_FOUND` if the factory doesn't exist or isn't owned
   * by the caller.
   */
  public static async harvestOne(
    prisma: PrismaClient,
    params: { userId: string; factoryId: string },
    nowInput?: Date
  ): Promise<HarvestAllResult> {
    const { userId, factoryId } = params
    const factory = await prisma.factory.findUnique({
      where: { id: factoryId },
      select: { id: true, userId: true }
    })
    if (!factory || factory.userId !== userId) {
      throw new ServiceError('FACTORY_NOT_FOUND')
    }
    return harvestWhere(prisma, userId, { userId, id: factoryId }, nowInput)
  }
}

type FactoryWhere = {
  readonly userId: string
  readonly id?: string
}

/** `HarvestService.harvestAll` / `harvestOne` 공용 구현. `factoryWhere`로 대상 범위 제한. */
async function harvestWhere(
  prisma: PrismaClient,
  userId: string,
  factoryWhere: FactoryWhere,
  nowInput?: Date
): Promise<HarvestAllResult> {
  const now = nowInput ?? new Date()

  return runInTx(prisma, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user) throw new ServiceError('USER_NOT_FOUND')

    const warehouse = await tx.warehouse.findUnique({
      where: { userId },
      include: { stacks: true }
    })
    if (!warehouse) {
      throw new ServiceError('USER_NOT_FOUND', 'Warehouse missing for user')
    }

    const factories = await tx.factory.findMany({
      where: factoryWhere,
      include: { slots: true }
    })

    // 같은 토지에 있는 공장끼리의 인접 시너지(docs/11 §인접 시너지) 선계산.
    // 수확 대상 공장이 걸쳐 있는 모든 landId 를 모아, 각 토지의 **전체** 공장/슬롯
    // (수확 대상 밖 공장도 provider 가 될 수 있어 전부 포함) 으로 시너지 맵을 만든다.
    const synergyByLand = await buildSynergyMapsForFactories(tx, factories)

    // Running warehouse balance (working copy; DB mutations happen inline).
    const balance: MaterialBag = {}
    for (const s of warehouse.stacks) {
      balance[s.material] = s.count
    }

    const summaries: FactoryHarvestSummary[] = []
    let totalTicks = 0

    for (const factory of factories) {
      const elapsedTicks = computeElapsedTicks(factory.lastHarvestAt, now)
      if (elapsedTicks <= 0) continue

      // Pick best special-slot bonus across occupied slots.
      // docs/11-land.md: 잠긴 슬롯의 특수 타입은 구매 전까지 보너스 미적용.
      // canPlace 가 LOCKED 를 차단하므로 실제로 도달할 일은 없지만, 데이터 드리프트 방어용으로 skip.
      let slotBonus = 1.0
      for (const slot of factory.slots) {
        if (slot.locked) continue
        const b = getSpecialSlotBonus(
          slot.type as SlotType,
          factory.type as FactoryState['type']
        )
        if (b > slotBonus) slotBonus = b
      }

      const synergyMap = synergyByLand.get(factory.landId)
      const synergyBonus = synergyMap
        ? getSynergyMultiplier(synergyMap, factory.id)
        : 1.0

      const state: FactoryState = {
        type: factory.type as FactoryState['type'],
        grade: factory.grade,
        lastHarvestAt: factory.lastHarvestAt,
        shortageMode: factory.shortageMode as FactoryState['shortageMode'],
        upgradeBooster:
          factory.upgradeBooster as FactoryState['upgradeBooster'],
        hasRawBooster: factory.hasRawBooster
      }

      const warehouseFree = computeFree(warehouse.grade, balance)

      const result = computeFactoryYield({
        factory: state,
        availableMaterials: { ...balance },
        warehouseFree,
        elapsedTicks,
        slotBonus,
        synergyBonus
      })

      if (result.ticksRealized <= 0) continue

      for (const [mat, amt] of Object.entries(result.consumed) as Array<
        [MaterialType, bigint]
      >) {
        if (!amt || amt <= 0n) continue
        await applyMaterialDelta(tx, warehouse.id, mat, -amt)
        balance[mat] = (balance[mat] ?? 0n) - amt
      }

      for (const [mat, amt] of Object.entries(result.produced) as Array<
        [MaterialType, bigint]
      >) {
        if (!amt || amt <= 0n) continue
        await applyMaterialDelta(tx, warehouse.id, mat, amt)
        balance[mat] = (balance[mat] ?? 0n) + amt
      }

      const advancedAt = new Date(
        factory.lastHarvestAt.getTime() + result.ticksRealized * TICK_MS
      )
      await tx.factory.update({
        where: { id: factory.id },
        data: { lastHarvestAt: advancedAt }
      })

      totalTicks += result.ticksRealized
      summaries.push({
        factoryId: factory.id,
        type: factory.type,
        ticks: result.ticksRealized,
        produced: result.produced,
        consumed: result.consumed
      })
    }

    let xpGained = 0n
    let newLevel = user.level
    let leveledUp = false
    if (totalTicks > 0) {
      xpGained = xpForEvent({ kind: 'TICK_PRODUCTION', ticks: totalTicks })
      const applied = applyXp(
        { level: user.level, xpInLevel: user.xp },
        xpGained
      )
      newLevel = applied.progress.level
      leveledUp = applied.leveledUp
      await tx.user.update({
        where: { id: userId },
        data: {
          level: applied.progress.level,
          xp: applied.progress.xpInLevel
        }
      })
    }

    return { factories: summaries, xpGained, newLevel, leveledUp }
  })
}
