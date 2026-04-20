import type { PrismaClient } from '@idle/database'
import {
  applyXp,
  computeElapsedTicks,
  computeFactoryYield,
  computeFree,
  getSpecialSlotBonus,
  TICK_MS,
  xpForEvent,
  type FactoryState,
  type MaterialBag,
  type MaterialType,
  type SlotType
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
        where: { userId },
        include: { slots: true }
      })

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
        let slotBonus = 1.0
        for (const slot of factory.slots) {
          const b = getSpecialSlotBonus(
            slot.type as SlotType,
            factory.type as FactoryState['type']
          )
          if (b > slotBonus) slotBonus = b
        }

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
          slotBonus
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
}
