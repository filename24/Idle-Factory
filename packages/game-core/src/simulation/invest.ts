/**
 * 시뮬레이션 재투자 단계 — 창고/공장 신축·업그레이드 지출.
 *
 * 여기서 나가는 돈은 전부 **소각(burn)** 이다. 건설·업그레이드 비용은 어떤
 * 유저에게도 이전되지 않고 시스템으로 사라지므로, 글로벌 판매(발행)와 함께
 * 통화량 곡선을 만드는 양대 축이다.
 *
 * 행동 모델(합리적 플레이어 근사):
 *  1. 창고가 병목이면 창고부터 올린다 — 생산이 잘려 나가는 손실이 가장 크다.
 *  2. 토지에 빈 칸이 있으면 신축한다 — 신축 1,000원에 300원/tick 대비
 *     1→2 업그레이드는 3,000원에 +150원/tick 이라 초반 신축이 명백히 유리하다
 *     (docs/design/03-factories.md §업그레이드 비용 = 신축비 × 3^N).
 *  3. 빈 칸이 없으면 가장 싼 업그레이드를 집는다.
 *
 * 토지 확장(`land/expansion.ts`)은 v1 범위 밖이다 — 초기 3×3 고정
 * (리포트 §모델 한계에 명시).
 */

import { FACTORY_CATALOG, getFactoryEntry } from '../factories/catalog'
import { buildCost, destroyRefund, upgradeMaterialCost, upgradeMoneyCost } from '../factories/cost'
import { LAND_INITIAL_HEIGHT, LAND_INITIAL_WIDTH } from '../land/expansion'
import { MARKET_BASE_PRICES } from '../market/basePrices'
import type { FactoryType, MaterialType } from '../types'
import { capacityOf, upgradeCostOf } from '../warehouse/capacity'
import { applyXp, xpForEvent } from '../xp/level'
import type { MutableUser } from './state'

/** 창고가 점유하는 토지 칸 수. 근거: plans/idle-factory-master-plan.md §창고 "유저당 공용 1개(토지 1슬롯)". */
const WAREHOUSE_CELLS = 1

/** 초기 토지에서 공장이 쓸 수 있는 칸 수 — 3×3 에서 창고 1칸을 뺀 값. */
export const USABLE_CELLS = LAND_INITIAL_WIDTH * LAND_INITIAL_HEIGHT - WAREHOUSE_CELLS

/** 한 번의 재투자에서 시도할 최대 행동 수 — 무한 루프 방어. */
const MAX_ACTIONS_PER_SESSION = 16

/** 공장 최대 등급. */
const MAX_GRADE = 10

/** 재투자 단계 결과. */
export interface InvestOutcome {
  /** 소각된 화폐 총액 (= 공장 + 창고). */
  readonly spent: bigint
  /** 공장 신축·업그레이드에 쓴 금액. */
  readonly spentOnFactories: bigint
  /** 창고 업그레이드에 쓴 금액. */
  readonly spentOnWarehouse: bigint
  /** 지급된 XP 총량. */
  readonly xp: bigint
  /** 신축한 공장 수. */
  readonly built: number
  /** 업그레이드한 공장 수. */
  readonly upgraded: number
  /** 창고 업그레이드 횟수. */
  readonly warehouseUpgrades: number
}

/**
 * 신축 판단에 필요한 파생 상태 — 재투자 루프 동안 캐시한다.
 *
 * 이 세 값은 전부 `user.factories` 를 순회해야 나온다. 재투자 루프는 한 세션에
 * 최대 {@link MAX_ACTIONS_PER_SESSION} 회 도는데, 매 반복마다 다시 만들면
 * 공장 수 × 카탈로그 크기만큼의 순회가 반복된다. 하드코어 프로파일은 10분마다
 * 재투자를 시도하므로 이 재계산이 시뮬레이션 시간을 지배한다.
 */
interface BuildContext {
  /** 보유 공장이 산출하는 자재 집합 — T2/T3 원료 자급 판정용. */
  readonly producible: Set<MaterialType>
  /** 공장 종류별 보유 수 — 같은 종류 반복 건설을 감쇠하는 데 쓴다. */
  readonly owned: Map<FactoryType, number>
  /** 현재 점유 중인 토지 칸 수. */
  usedCells: number
}

/** 유저의 현재 공장 목록에서 {@link BuildContext} 를 만든다. */
function createBuildContext(user: MutableUser): BuildContext {
  const producible = new Set<MaterialType>()
  const owned = new Map<FactoryType, number>()
  let cells = 0

  for (const factory of user.factories) {
    const entry = getFactoryEntry(factory.type)
    producible.add(entry.output)
    for (const secondary of entry.secondaryOutputs) producible.add(secondary.material)
    owned.set(factory.type, (owned.get(factory.type) ?? 0) + 1)
    cells += entry.size.width * entry.size.height
  }
  return { producible, owned, usedCells: cells }
}

/** 신축 반영 — 컨텍스트를 증분 갱신한다(전체 재계산 회피). */
function applyBuildToContext(ctx: BuildContext, type: FactoryType): void {
  const entry = getFactoryEntry(type)
  ctx.producible.add(entry.output)
  for (const secondary of entry.secondaryOutputs) ctx.producible.add(secondary.material)
  ctx.owned.set(type, (ctx.owned.get(type) ?? 0) + 1)
  ctx.usedCells += entry.size.width * entry.size.height
}

/**
 * 공장 종류의 tick 당 기대 순수익(기준가 환산)을 계산한다.
 *
 * `산출 × 기준가 − 원료 × 기준가`. 현재가가 아니라 기준가를 쓰는 이유는
 * 건설 판단이 30분 단위 시세 진동에 흔들리지 않게 하기 위함이다 — 실제
 * 플레이어도 순간 시세가 아니라 대략적 기대값으로 짓는다.
 */
function expectedTickProfit(type: FactoryType): bigint {
  const entry = getFactoryEntry(type)
  let profit = entry.baseProduction * MARKET_BASE_PRICES[entry.output]
  for (const secondary of entry.secondaryOutputs) {
    profit += secondary.amount * MARKET_BASE_PRICES[secondary.material]
  }
  for (const req of entry.recipe) {
    profit -= req.amount * MARKET_BASE_PRICES[req.material]
  }
  return profit
}

/** 자재 보유량이 요구치 이상인지. */
function hasMaterial(user: MutableUser, material: MaterialType, amount: bigint): boolean {
  return (user.stacks[material] ?? 0n) >= amount
}

/** 자재를 차감한다(보유 확인은 호출자 책임). */
function spendMaterial(user: MutableUser, material: MaterialType, amount: bigint): void {
  const next = (user.stacks[material] ?? 0n) - amount
  if (next > 0n) user.stacks[material] = next
  else delete user.stacks[material]
}

/**
 * 지금 지을 수 있는 공장 중 점수가 가장 높은 종류를 고른다.
 *
 * 조건: 레벨 해금(`unlockLevel`) + 예산 + 건설 원료 보유 + 레시피 원료를
 * 자급할 수 있을 것. 마지막 조건이 없으면 원료 공급원 없는 T2/T3 를 지어
 * 즉시 멈추는 비합리적 플레이가 된다.
 *
 * 점수 = `기대수익 ÷ 점유 칸수 ÷ (이미 보유한 같은 종류 수 + 1)`.
 *  - **칸으로 나누는 이유**: T3 는 2×2(4칸)를 먹으므로 공장 단위 수익만 보면
 *    토지 기회비용이 감춰진다 (docs/design/11-land.md §배치).
 *  - **보유 수로 나누는 이유**: 한 종류만 반복해서 짓는 것은 비합리적이다.
 *    인접 시너지는 서로 다른 공장 쌍에서만 발생하고
 *    (docs/design/11-land.md §인접 시너지), T2/T3 를 해금해도 원료를 자급할
 *    T1 이 없으면 지을 수 없기 때문이다. 이 감쇠가 없으면 전 유저가 단일
 *    최고수익 T1 만 채워 티어 진행이 영구히 막힌다.
 */
function pickBuildTarget(user: MutableUser, budget: bigint, ctx: BuildContext): FactoryType | null {
  let best: FactoryType | null = null
  let bestScore = 0n

  for (const type of Object.keys(FACTORY_CATALOG) as FactoryType[]) {
    const entry = FACTORY_CATALOG[type]
    if (user.level < entry.unlockLevel) continue
    if (entry.buildCost > budget) continue
    if (entry.buildMaterialCost) {
      const { material, amount } = entry.buildMaterialCost
      if (!hasMaterial(user, material, amount)) continue
    }
    if (entry.recipe.some((req) => !ctx.producible.has(req.material))) continue

    const profit = expectedTickProfit(type)
    if (profit <= 0n) continue

    const cells = BigInt(entry.size.width * entry.size.height)
    const score = profit / cells / BigInt((ctx.owned.get(type) ?? 0) + 1)
    if (score > bestScore) {
      bestScore = score
      best = type
    }
  }
  return best
}

/** 예산·원료로 감당 가능한 업그레이드 중 가장 싼 공장을 고른다. */
function pickUpgradeTarget(
  user: MutableUser,
  budget: bigint,
): MutableUser['factories'][number] | null {
  let best: MutableUser['factories'][number] | null = null
  let bestCost = 0n

  for (const factory of user.factories) {
    if (factory.grade >= MAX_GRADE) continue
    const money = upgradeMoneyCost(factory.type, factory.grade)
    if (money > budget) continue
    const material = upgradeMaterialCost(factory.type, factory.grade)
    if (!hasMaterial(user, material.material, material.amount)) continue
    if (best === null || money < bestCost) {
      best = factory
      bestCost = money
    }
  }
  return best
}

/**
 * 칸이 꽉 찼을 때 **철거 후 교체**가 이득인 조합을 찾는다.
 *
 * 이 경로가 없으면 초기 3×3 을 T1 으로 채운 순간 티어 전환이 영구히 막혀,
 * T2/T3 해금(Lv.5/10)이 시뮬레이션에서 아무 의미가 없어진다. 실제 플레이어는
 * 더 나은 공장이 열리면 갈아 끼운다.
 *
 * 보수적으로 **등급 1 공장만** 철거 대상으로 삼는다 — 업그레이드에 들어간
 * 누적 투자비는 철거 환급(건설비의 50%, `destroyRefund`)으로 회수되지 않아
 * 등급이 오른 공장을 미는 것은 명백한 손해이기 때문이다.
 *
 * 교체 판정은 **칸당 기대수익**으로 한다. 후보가 지금 것보다 확실히 나을 때만
 * (마진 없이 동률이면 유지) 갈아 끼운다.
 */
function pickReplacement(
  user: MutableUser,
  budget: bigint,
  ctx: BuildContext,
): { victim: MutableUser['factories'][number]; target: FactoryType } | null {
  const candidates = user.factories.filter((f) => f.grade === 1)
  if (candidates.length === 0) return null

  // 철거 환급을 예산에 미리 더해 보고 후보를 찾는다.
  for (const victim of candidates) {
    const victimEntry = getFactoryEntry(victim.type)
    const victimCells = BigInt(victimEntry.size.width * victimEntry.size.height)
    const victimScore = expectedTickProfit(victim.type) / victimCells
    const refund = destroyRefund(victim.type)
    const target = pickBuildTarget(user, budget + refund, ctx)
    if (!target || target === victim.type) continue

    const entry = getFactoryEntry(target)
    const targetCells = BigInt(entry.size.width * entry.size.height)
    // 교체로 확보되는 칸(철거분 + 기존 여유)이 후보를 수용해야 한다.
    const freeAfter = BigInt(USABLE_CELLS - ctx.usedCells) + victimCells
    if (targetCells > freeAfter) continue

    const targetScore = expectedTickProfit(target) / targetCells
    if (targetScore > victimScore) return { victim, target }
  }
  return null
}

/** 창고 업그레이드를 시도한다. 성공 시 지출액, 실패 시 0n. */
function tryUpgradeWarehouse(user: MutableUser, budget: bigint): bigint {
  if (user.warehouseGrade >= MAX_GRADE) return 0n
  const next = user.warehouseGrade + 1
  const cost = upgradeCostOf(next)
  if (cost.money > budget) return 0n
  if (!hasMaterial(user, cost.material, cost.amount)) return 0n

  user.money -= cost.money
  spendMaterial(user, cost.material, cost.amount)
  user.warehouseGrade = next
  user.warehouseChoked = false
  return cost.money
}

/**
 * 유저의 재투자 판단을 수행한다.
 *
 * 예산은 `money × reinvestRatio`(floor). 남은 현금은 그대로 쌓여 총자산
 * 누진세 구간을 밀어 올린다 — 세율이 자산 기준이라
 * (docs/design/07-global-system.md §세율) 현금 보유 자체가 비용이 되는 구조가
 * 시뮬레이션에 반영된다.
 *
 * @param user 대상 유저 (상태가 갱신된다)
 * @param tick 현재 tick — 신축 공장의 `lastHarvestTick` 기준점
 * @returns 재투자 결과 (소각액·XP·행동 수)
 */
export function reinvest(user: MutableUser, tick: number): InvestOutcome {
  // 공장이 한 채도 없으면 전액을 투입한다. 초기 자금 1,000원은 애초에 첫 T1
  // 공장(건설비 1,000원) 건설 용도로 지급되는 씨드머니라, 비율을 적용하면
  // 영원히 첫 삽을 뜨지 못한다 (docs/design/00-onboarding.md §초기 지급
  // "초기 자금 없이는 퀘스트를 시작조차 못하는 모순").
  const ratioPercent =
    user.factories.length === 0 ? 100n : BigInt(Math.round(user.profile.reinvestRatio * 100))
  let budget = (user.money * ratioPercent) / 100n
  let spentOnFactories = 0n
  let spentOnWarehouse = 0n
  let xp = 0n
  let built = 0
  let upgraded = 0
  let warehouseUpgrades = 0

  const ctx = createBuildContext(user)

  for (let action = 0; action < MAX_ACTIONS_PER_SESSION; action += 1) {
    if (budget <= 0n) break

    // 1. 창고 병목 해소 우선.
    if (user.warehouseChoked) {
      const cost = tryUpgradeWarehouse(user, budget)
      if (cost > 0n) {
        budget -= cost
        spentOnWarehouse += cost
        warehouseUpgrades += 1
        continue
      }
    }

    // 2. 빈 칸이 있으면 신축.
    const freeCells = USABLE_CELLS - ctx.usedCells
    const buildTarget = freeCells > 0 ? pickBuildTarget(user, budget, ctx) : null
    if (buildTarget) {
      const entry = getFactoryEntry(buildTarget)
      if (entry.size.width * entry.size.height <= freeCells) {
        const cost = buildCost(buildTarget)
        user.money -= cost
        if (entry.buildMaterialCost) {
          spendMaterial(user, entry.buildMaterialCost.material, entry.buildMaterialCost.amount)
        }
        user.factorySeq += 1
        user.factories.push({
          id: `${user.id}-f${user.factorySeq}`,
          type: buildTarget,
          grade: 1,
          lastHarvestTick: tick,
        })
        applyBuildToContext(ctx, buildTarget)
        budget -= cost
        spentOnFactories += cost
        built += 1
        xp += xpForEvent({ kind: 'BUILD', cost })
        continue
      }
    }

    // 3. 칸이 꽉 찼고 더 나은 공장이 열렸으면 등급1 공장을 갈아 끼운다.
    if (freeCells <= 0) {
      const swap = pickReplacement(user, budget, ctx)
      if (swap) {
        const refund = destroyRefund(swap.victim.type)
        user.money += refund
        budget += refund
        user.factories = user.factories.filter((f) => f.id !== swap.victim.id)

        const entry = getFactoryEntry(swap.target)
        const cost = buildCost(swap.target)
        user.money -= cost
        if (entry.buildMaterialCost) {
          spendMaterial(user, entry.buildMaterialCost.material, entry.buildMaterialCost.amount)
        }
        user.factorySeq += 1
        user.factories.push({
          id: `${user.id}-f${user.factorySeq}`,
          type: swap.target,
          grade: 1,
          lastHarvestTick: tick,
        })
        budget -= cost
        // 환급은 통화 발행이 아니라 이미 소각된 건설비의 부분 회수다.
        // 순 소각액만 계상해야 화폐 회계 항등식이 유지된다.
        spentOnFactories += cost - refund
        built += 1
        xp += xpForEvent({ kind: 'BUILD', cost })
        // 철거로 자급 가능 자재가 줄어들 수 있어 컨텍스트를 통째로 다시 만든다.
        // 교체는 드물게 일어나므로 재계산 비용이 문제되지 않는다.
        const fresh = createBuildContext(user)
        ctx.producible.clear()
        for (const material of fresh.producible) ctx.producible.add(material)
        ctx.owned.clear()
        for (const [type, count] of fresh.owned) ctx.owned.set(type, count)
        ctx.usedCells = fresh.usedCells
        continue
      }
    }

    // 4. 그 외에는 가장 싼 업그레이드.
    const upgradeTarget = pickUpgradeTarget(user, budget)
    if (upgradeTarget) {
      const money = upgradeMoneyCost(upgradeTarget.type, upgradeTarget.grade)
      const material = upgradeMaterialCost(upgradeTarget.type, upgradeTarget.grade)
      user.money -= money
      spendMaterial(user, material.material, material.amount)
      upgradeTarget.grade += 1
      budget -= money
      spentOnFactories += money
      upgraded += 1
      xp += xpForEvent({ kind: 'UPGRADE', cost: money })
      continue
    }

    break
  }

  if (xp > 0n) {
    const result = applyXp({ level: user.level, xpInLevel: user.xpInLevel }, xp)
    user.level = result.progress.level
    user.xpInLevel = result.progress.xpInLevel
  }

  return {
    spent: spentOnFactories + spentOnWarehouse,
    spentOnFactories,
    spentOnWarehouse,
    xp,
    built,
    upgraded,
    warehouseUpgrades,
  }
}

/**
 * 창고가 가득 차기까지 남은 여유를 tick 으로 환산한다 — 병목 진단용.
 *
 * 목표치 "창고 1등급 ≈ 16시간"(docs/design/05-warehouse.md §설계 의도) 검증에
 * 쓴다. 생산량이 0 이면 병목이 성립하지 않으므로 `null`.
 *
 * @param user 대상 유저
 * @param unitsPerTick tick 당 총 생산 단위 수
 * @returns 가득 차기까지의 tick 수 (없으면 null)
 */
export function ticksUntilWarehouseFull(user: MutableUser, unitsPerTick: bigint): number | null {
  if (unitsPerTick <= 0n) return null
  return Number(capacityOf(user.warehouseGrade) / unitsPerTick)
}
