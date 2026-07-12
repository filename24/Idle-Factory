import type { PrismaClient } from '@idle/database'
import {
  applyXp,
  computeElapsedTicks,
  computeFactoryYield,
  computeFree,
  computeRareBoosterDrop,
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
import { QuestService, type QuestProgressResult } from './quest'

export interface FactoryHarvestSummary {
  readonly factoryId: string
  readonly type: string
  readonly ticks: number
  readonly produced: MaterialBag
  readonly consumed: MaterialBag
}

/**
 * 상장 공장 수확 수익 적립 한 건 (D8, #18).
 *
 * 상장된 공장이 수확되면 `수확 수량 × 글로벌 현재가` 평가액을
 * `Stock.weeklyProfit` 에 누적하고 `StockProfitLog` 행을 남긴 결과 스냅샷.
 */
export interface StockProfitAccrual {
  readonly stockId: string
  readonly factoryId: string
  /** 적립된 평가액 (Σ 수확 수량 × 글로벌 현재가). */
  readonly amount: bigint
}

export interface HarvestAllResult {
  readonly factories: FactoryHarvestSummary[]
  readonly xpGained: bigint
  readonly newLevel: number
  readonly leveledUp: boolean
  readonly quest: QuestProgressResult
  /** 상장 공장의 주간 수익 적립 내역 (D8) — 상장 공장이 없으면 빈 배열. */
  readonly stockProfits: readonly StockProfitAccrual[]
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

      // RARE 부스터 드롭 — T1/T2 공장이 tick당 저확률로 RAW_BOOSTER 생산 (#19).
      // 일반 산출과 달리 확률 이벤트라 computeFactoryYield 의 창고 클램프에
      // 포함되지 않으므로, 산출 반영 후 남은 여유 공간으로 별도 클램프한다.
      const producedForSummary = { ...result.produced }
      const rareDrop = computeRareBoosterDrop({
        type: state.type,
        upgradeBooster: state.upgradeBooster,
        ticks: result.ticksRealized
      })
      if (rareDrop > 0n) {
        const freeAfterProduce = computeFree(warehouse.grade, balance)
        const credited =
          rareDrop < freeAfterProduce ? rareDrop : freeAfterProduce
        if (credited > 0n) {
          await applyMaterialDelta(tx, warehouse.id, 'RAW_BOOSTER', credited)
          balance.RAW_BOOSTER = (balance.RAW_BOOSTER ?? 0n) + credited
          producedForSummary.RAW_BOOSTER =
            (producedForSummary.RAW_BOOSTER ?? 0n) + credited
        }
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
        produced: producedForSummary,
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

    // 수확이 실제로 일어난 경우에만 퀘스트 이벤트 발화 (Q2 트리거).
    let quest: QuestProgressResult = { newlyCompleted: [] }
    if (totalTicks > 0 && summaries.length > 0) {
      quest = await QuestService.progress(tx, userId, {
        kind: 'FACTORY_HARVESTED',
        factoryIds: summaries.map((s) => s.factoryId),
        tickTotal: totalTicks
      })
    }

    // 상장 공장 주간 수익 적립 (D8, #18) — 동일 트랜잭션.
    const stockProfits = await accrueStockProfits(tx, summaries)

    return {
      factories: summaries,
      xpGained,
      newLevel,
      leveledUp,
      quest,
      stockProfits
    }
  })
}

/**
 * 상장된 공장의 수확 수익을 적립한다 (D8, docs/design/08-stock.md §배당 시스템
 * 재원 — 마스터플랜 "수확·판매 시 수익 적립 경로": 판매 귀속은 창고에서 자재가
 * 섞여 불가하므로 **수확 시점 평가액**으로 적립한다).
 *
 * 수확된 공장 중 상장(Stock 존재) 공장만 대상으로,
 * `Δ = Σ(수확 수량 × 글로벌 현재가)` 를 `Stock.weeklyProfit += Δ` 에 누적하고
 * `StockProfitLog` 행을 삽입한다 — 주가 tick 의 last24hProfit/avg7dProfit
 * 집계(D9)와 배당 재원이 이 로그·컬럼을 읽는다.
 *
 * 시세가 없는 자재(방어 경로)는 0 으로 평가한다 (evaluateTotalAssets 관례).
 * 평가액이 0 이면 로그를 남기지 않는다.
 */
async function accrueStockProfits(
  tx: Tx,
  summaries: readonly FactoryHarvestSummary[]
): Promise<readonly StockProfitAccrual[]> {
  if (summaries.length === 0) return []

  const stocks = await tx.stock.findMany({
    where: { factoryId: { in: summaries.map((s) => s.factoryId) } },
    select: { id: true, factoryId: true }
  })
  if (stocks.length === 0) return []

  // 상장 공장의 생산 자재만 모아 시세를 1회 배치 조회 (N+1 방지).
  const stockByFactory = new Map(stocks.map((s) => [s.factoryId, s.id]))
  const listedSummaries = summaries.filter((s) =>
    stockByFactory.has(s.factoryId)
  )
  const materials = [
    ...new Set(
      listedSummaries.flatMap((s) => Object.keys(s.produced) as MaterialType[])
    )
  ]
  const priceRows = await tx.globalMarketPrice.findMany({
    where: { material: { in: materials } },
    select: { material: true, currentPrice: true }
  })
  const prices = new Map<MaterialType, bigint>(
    priceRows.map((r) => [r.material as MaterialType, r.currentPrice])
  )

  const accruals: StockProfitAccrual[] = []
  for (const summary of listedSummaries) {
    const stockId = stockByFactory.get(summary.factoryId)
    if (!stockId) continue

    let amount = 0n
    for (const [mat, qty] of Object.entries(summary.produced) as Array<
      [MaterialType, bigint]
    >) {
      if (!qty || qty <= 0n) continue
      amount += qty * (prices.get(mat) ?? 0n)
    }
    if (amount <= 0n) continue

    await tx.stock.update({
      where: { id: stockId },
      data: { weeklyProfit: { increment: amount } }
    })
    await tx.stockProfitLog.create({
      data: { stockId, amount }
    })
    accruals.push({ stockId, factoryId: summary.factoryId, amount })
  }

  return accruals
}
