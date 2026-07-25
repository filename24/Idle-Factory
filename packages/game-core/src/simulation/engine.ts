/**
 * 경제 밸런스 시뮬레이터 tick 루프 (#31 §구현 흐름 3).
 *
 * 한 tick = 10분(`TICK_MS`). 각 tick 에서:
 *   1. 접속 tick 인 유저만 수확 → 창고 클램프 (`computeFactoryYield`)
 *   2. 판매 — 글로벌(발행) / 유저 상점(이전 + 세금 소각)
 *   3. 원료 부족분 직구매 (소각)
 *   4. 재투자 — 창고/공장 (소각)
 *   5. 30분마다 가격 재계산 (`computeNextPrice`)
 *   6. 하루마다 직구매 한도 리셋 + 일간 스냅샷
 *   7. 주마다 자산 누진세 정산 (`calcWeeklyTax`)
 *
 * 전 과정이 결정론적이다 — 난수는 시드 RNG 하나에서만 나오므로 같은
 * 시나리오는 항상 같은 결과를 만든다. CI 회귀 게이트가 성립하는 근거다.
 */

import { evaluateTotalAssets } from '../economy/assets'
import { calcWeeklyTax, effectiveTaxRateBps, surchargeToBps } from '../economy/tax'
import { computeNextAvgSales, computeNextPrice } from '../market/price'
import type { MaterialType } from '../types'
import { applyXp, xpForEvent } from '../xp/level'
import { replenishMaterials } from './directBuySim'
import { harvestUser } from './harvest'
import { reinvest } from './invest'
import { PRICE_TICK_INTERVAL, TICKS_PER_DAY, TICKS_PER_WEEK } from './profiles'
import { createRng, symmetricNoise, type Rng } from './rng'
import { sellInventory } from './sell'
import {
  createMarket,
  createUsers,
  priceMap,
  snapshotMarket,
  snapshotUser,
  type MutableMarketEntry,
  type MutableUser,
} from './state'
import type {
  BurnBreakdown,
  DailySnapshot,
  PriceSample,
  SimResult,
  SimScenario,
  TickFlow,
  TierMilestone,
} from './types'

/**
 * 티어 해금 레벨 문턱.
 * 근거: docs/design/09-level-xp.md §레벨별 해금 (균일안, 2026-07-03 확정) —
 * T1 Lv.1 / T2 Lv.5 / T3 Lv.10. 카탈로그의 `unlockLevel` 과 같은 값이다.
 */
const TIER_LEVELS: readonly number[] = [5, 10]

/** 소각 원인별 누적기 (내부 가변). */
interface BurnAccumulator {
  weeklyTax: bigint
  listingTax: bigint
  directBuy: bigint
  construction: bigint
  warehouse: bigint
}

/** 티어 도달 추적기. */
interface MilestoneTracker {
  readonly level: number
  firstReachedTick: number | null
  readonly reached: Set<string>
}

/** 이 tick 이 해당 유저의 접속 tick 인지 판정한다. */
function isSessionTick(user: MutableUser, tick: number): boolean {
  if (tick < user.phaseOffset) return false
  return (tick - user.phaseOffset) % user.profile.sessionIntervalTicks === 0
}

/** 전 유저 현금 합계. */
function totalMoney(users: readonly MutableUser[]): bigint {
  let sum = 0n
  for (const user of users) sum += user.money
  return sum
}

/** 전 유저 총자산 합계 (현금 + 재고 평가 + 공장 누적 투자비). */
function totalAssetsOf(
  users: readonly MutableUser[],
  prices: ReadonlyMap<MaterialType, bigint>,
): bigint {
  let sum = 0n
  for (const user of users) sum += assetsOfUser(user, prices)
  return sum
}

/** 유저 한 명의 총자산 (`evaluateTotalAssets` 조립). */
function assetsOfUser(user: MutableUser, prices: ReadonlyMap<MaterialType, bigint>): bigint {
  return evaluateTotalAssets({
    money: user.money,
    stacks: Object.entries(user.stacks).map(([material, count]) => ({
      material: material as MaterialType,
      count: count ?? 0n,
    })),
    prices,
    factories: user.factories.map((f) => ({ type: f.type, grade: f.grade })),
  })
}

/**
 * 30분 가격 tick 을 수행한다.
 *
 * 순서가 중요하다: 가격을 먼저 계산하고(현재 윈도의 `recentSales` 사용),
 * 그 다음 EMA 를 갱신한 뒤, 마지막에 `recentSales` 를 0 으로 되돌린다.
 * 순서를 바꾸면 같은 거래량이 두 번 반영되거나 한 번도 반영되지 않는다.
 */
function runPriceTick(
  market: Map<MaterialType, MutableMarketEntry>,
  rng: Rng,
  noiseLimit: number,
  demandCoefficient: number,
): void {
  for (const entry of market.values()) {
    entry.currentPrice = computeNextPrice({
      basePrice: entry.basePrice,
      recentSales: entry.recentSales,
      avgSales: entry.avgSales,
      noise: symmetricNoise(rng, noiseLimit),
      demandCoefficient,
    })
    entry.avgSales = computeNextAvgSales(entry.avgSales, entry.recentSales)
    entry.recentSales = 0
  }
}

/**
 * 주간 자산 누진세를 정산한다.
 *
 * 과세 베이스는 **gross 판매액 누계**다 — 런타임(`weeklySettlement.ts`)이
 * `TradeLog.price`(gross) 합으로 과세하는 것과 맞췄다. 현금이 세액보다 적으면
 * 가능한 만큼만 걷는 미납 가드도 동일하게 재현한다.
 *
 * @returns 실제로 징수(소각)된 총액
 */
function settleWeeklyTax(
  users: readonly MutableUser[],
  prices: ReadonlyMap<MaterialType, bigint>,
  surchargeBps: number,
): bigint {
  let collected = 0n
  for (const user of users) {
    if (user.weeklyRevenue <= 0n) continue
    const assets = assetsOfUser(user, prices)
    const tax = calcWeeklyTax(user.weeklyRevenue, effectiveTaxRateBps(assets, surchargeBps))
    const paid = tax <= user.money ? tax : user.money
    user.money -= paid
    collected += paid
    user.weeklyRevenue = 0n
  }
  return collected
}

/** 유저 레벨을 보고 티어 도달을 기록한다. */
function trackMilestones(
  trackers: readonly MilestoneTracker[],
  user: MutableUser,
  tick: number,
): void {
  for (const tracker of trackers) {
    if (user.level < tracker.level) continue
    if (!tracker.reached.has(user.id)) {
      tracker.reached.add(user.id)
      if (tracker.firstReachedTick === null) tracker.firstReachedTick = tick
    }
  }
}

/** 한 tick 의 세션 처리에 필요한 컨텍스트. */
interface SessionContext {
  /** 전체 유저 — 유저 상점 구매자 매칭용. */
  readonly users: readonly MutableUser[]
  /** 가변 마켓 상태. */
  readonly market: Map<MaterialType, MutableMarketEntry>
  /** 결정론적 난수원. */
  readonly rng: Rng
  /** 현재 tick 인덱스. */
  readonly tick: number
  /** 직구매 단가 배율. */
  readonly directBuyMultiplier: number
  /** 소각 누적기 (갱신된다). */
  readonly burns: BurnAccumulator
}

/** 한 유저의 접속 세션(수확→판매→직구매→재투자)을 처리한다. */
function runUserSession(
  user: MutableUser,
  ctx: SessionContext,
): { minted: bigint; burned: bigint; productionTicks: number } {
  let minted = 0n
  let burned = 0n

  const harvest = harvestUser(user, ctx.tick)
  let xp = 0n
  if (harvest.ticksRealized > 0) {
    xp += xpForEvent({ kind: 'TICK_PRODUCTION', ticks: harvest.ticksRealized })
  }

  const sale = sellInventory(user, ctx.users, ctx.market, ctx.rng)
  minted += sale.minted
  burned += sale.listingTax
  ctx.burns.listingTax += sale.listingTax
  if (sale.tradeCount > 0) {
    xp += xpForEvent({ kind: 'MARKET_SELL', count: sale.tradeCount })
  }

  // 재투자 전에 XP 를 반영해야 이번 세션의 레벨업이 신축 해금에 반영된다.
  if (xp > 0n) {
    const result = applyXp({ level: user.level, xpInLevel: user.xpInLevel }, xp)
    user.level = result.progress.level
    user.xpInLevel = result.progress.xpInLevel
  }

  const bought = replenishMaterials(user, ctx.market, ctx.directBuyMultiplier)
  burned += bought.spent
  ctx.burns.directBuy += bought.spent

  const invested = reinvest(user, ctx.tick)
  burned += invested.spent
  ctx.burns.construction += invested.spentOnFactories
  ctx.burns.warehouse += invested.spentOnWarehouse

  return { minted, burned, productionTicks: harvest.ticksRealized }
}

/**
 * 시나리오를 실행해 경제 지표를 산출한다.
 *
 * @param scenario 시뮬레이션 시나리오 (읽기만 하며 변형하지 않는다)
 * @returns tick 흐름·일간 스냅샷·가격 궤적·소각 분해·티어 도달·최종 상태
 * @throws {RangeError} 유저 수·일수가 1 미만인 경우
 */
export function runSimulation(scenario: SimScenario): SimResult {
  if (!Number.isInteger(scenario.userCount) || scenario.userCount < 1) {
    throw new RangeError(`userCount must be an integer >= 1, got ${scenario.userCount}`)
  }
  if (!Number.isInteger(scenario.days) || scenario.days < 1) {
    throw new RangeError(`days must be an integer >= 1, got ${scenario.days}`)
  }

  const rng = createRng(scenario.seed)
  const users = createUsers(scenario)
  const market = createMarket()
  const surchargeBps = surchargeToBps(scenario.params.taxSurcharge)
  const totalTicks = scenario.days * TICKS_PER_DAY

  const flows: TickFlow[] = []
  const daily: DailySnapshot[] = []
  const priceTrail: PriceSample[] = []
  const burns: BurnAccumulator = {
    weeklyTax: 0n,
    listingTax: 0n,
    directBuy: 0n,
    construction: 0n,
    warehouse: 0n,
  }
  const trackers: MilestoneTracker[] = TIER_LEVELS.map((level) => ({
    level,
    firstReachedTick: null,
    reached: new Set<string>(),
  }))

  let dayMinted = 0n
  let dayBurned = 0n
  let previousSupply = 0n
  let productionTicks = 0

  for (let tick = 0; tick < totalTicks; tick += 1) {
    let minted = 0n
    let burned = 0n
    const ctx: SessionContext = {
      users,
      market,
      rng,
      tick,
      directBuyMultiplier: scenario.params.directBuyMultiplier,
      burns,
    }

    for (const user of users) {
      if (!isSessionTick(user, tick)) continue
      const result = runUserSession(user, ctx)
      minted += result.minted
      burned += result.burned
      productionTicks += result.productionTicks
      trackMilestones(trackers, user, tick)
    }

    if ((tick + 1) % PRICE_TICK_INTERVAL === 0) {
      runPriceTick(market, rng, scenario.params.noiseLimit, scenario.params.demandCoefficient)
      priceTrail.push({
        tick,
        prices: Object.fromEntries(
          [...market].map(([material, entry]) => [material, entry.currentPrice]),
        ),
      })
    }

    if ((tick + 1) % TICKS_PER_WEEK === 0) {
      const collected = settleWeeklyTax(users, priceMap(market), surchargeBps)
      burned += collected
      burns.weeklyTax += collected
    }

    dayMinted += minted
    dayBurned += burned
    const moneySupply = totalMoney(users)
    flows.push({ tick, minted, burned, moneySupply })

    if ((tick + 1) % TICKS_PER_DAY === 0) {
      const day = (tick + 1) / TICKS_PER_DAY
      const inflationRate =
        previousSupply > 0n ? Number(moneySupply - previousSupply) / Number(previousSupply) : 0
      daily.push({
        day,
        minted: dayMinted,
        burned: dayBurned,
        moneySupply,
        totalAssets: totalAssetsOf(users, priceMap(market)),
        inflationRate,
        averageLevel: users.reduce((sum, u) => sum + u.level, 0) / users.length,
      })
      previousSupply = moneySupply
      dayMinted = 0n
      dayBurned = 0n
      for (const user of users) user.directBuyToday = 0
    }
  }

  const milestones: TierMilestone[] = trackers.map((tracker) => ({
    level: tracker.level,
    firstReachedTick: tracker.firstReachedTick,
    usersReached: tracker.reached.size,
  }))

  const burnBreakdown: BurnBreakdown = {
    weeklyTax: burns.weeklyTax,
    listingTax: burns.listingTax,
    directBuy: burns.directBuy,
    construction: burns.construction,
    warehouse: burns.warehouse,
  }

  return {
    scenario,
    flows,
    daily,
    priceTrail,
    burns: burnBreakdown,
    productionTicks,
    milestones,
    users: users.map(snapshotUser),
    market: snapshotMarket(market),
  }
}
