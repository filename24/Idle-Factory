/**
 * 공장 생산(수확) 계산.
 *
 * 핵심 공식·규칙은 `docs/design/02-core-loop.md`,
 *                 `docs/design/03-factories.md`,
 *                 `docs/design/05-warehouse.md` 참조.
 *
 * 본 모듈은 부작용 없이 순수 함수로 수확 결과를 산출한다.
 */

import type { FactoryState, MaterialBag, MaterialType, UpgradeBooster } from '../types'
import { volumeOf } from '../warehouse/capacity'
import { boosterConsumptionMultiplier, boosterProductionMultiplier } from './booster'
import { getFactoryEntry } from './catalog'

/** 1 tick 길이 (밀리초). 10분. `docs/design/02-core-loop.md`. */
export const TICK_MS = 10 * 60 * 1000
/**
 * 한 번의 수확에서 적용할 수 있는 최대 tick 수 (오프라인 상한).
 * 장기간 방치로 수치 폭주/정수 오버플로를 막기 위한 안전장치.
 */
export const MAX_TICKS_PER_HARVEST = 10_000

/**
 * `computeFactoryYield` 입력 파라미터.
 */
export interface ComputeFactoryYieldParams {
  /** 대상 공장 상태 */
  factory: FactoryState
  /** 현재 보유 중인 원료(재료 클램프 계산용) */
  availableMaterials: MaterialBag
  /** 창고 여유 용량 (슬롯 기준, bigint) */
  warehouseFree: bigint
  /** 정산할 누적 tick 수 (`computeElapsedTicks`의 결과 권장) */
  elapsedTicks: number
  /** 토지/슬롯 보너스 배수 (기본 1.0). 예: 특수 슬롯 1.2. */
  slotBonus?: number
  /** 시너지 보너스 배수 (기본 1.0). */
  synergyBonus?: number
}

/**
 * `computeFactoryYield` 결과.
 */
export interface FactoryYield {
  /** 실제로 반영된 tick 수 (원료/창고 클램프 이후) */
  ticksRealized: number
  /** 생산된 자원 묶음 */
  produced: MaterialBag
  /** 소비된 원료 묶음 (T1은 빈 bag) */
  consumed: MaterialBag
}

/**
 * 등급 배수(분수 표현).
 *
 * 부동소수점 오차를 피하기 위해 `(numerator / denominator)` 형태로 bigint에 적용한다.
 */
export interface GradeMultiplier {
  /** 분자 */
  numerator: bigint
  /** 분모 (>0) */
  denominator: bigint
}

/**
 * 두 시각 간 경과 tick 수를 계산한다.
 *
 * 음수 구간은 0으로 클램프되고, 결과는 `MAX_TICKS_PER_HARVEST`로 상한이 적용된다.
 *
 * @param lastHarvestAt 마지막 수확 시각
 * @param now 현재 시각
 * @returns 경과 tick 수 (0 이상)
 */
export function computeElapsedTicks(lastHarvestAt: Date, now: Date): number {
  const diff = now.getTime() - lastHarvestAt.getTime()
  if (diff < 0) return 0
  const ticks = Math.floor(diff / TICK_MS)
  return Math.min(ticks, MAX_TICKS_PER_HARVEST)
}

/**
 * 등급 배수 계산.
 *
 * 공식: `multiplier = (3/2)^(grade-1)`.
 * 원료 부스터가 켜져 있으면 추가로 `× 1.2`.
 * 업그레이드 부스터가 생산량형(`SPEED` ×1.15 / `PROFIT` ×1.1)이면 추가로 곱한다 —
 * 생산 배수에 함께 접어야 창고 클램프(수용 가능 tick 계산)가 부스터 반영 후
 * 실제 생산량 기준으로 정확해진다. 근거: `docs/design/03-factories.md` §업그레이드 부스터.
 * 부동소수점 오차를 피하려고 분자/분모를 분리해 bigint로 유지한다.
 *
 * @param grade 공장 등급 (1..10). 1 미만은 1로 간주.
 * @param hasRawBooster 원료 부스터 적용 여부
 * @param upgradeBooster 업그레이드 부스터 (생산량형만 반영, 기본 null)
 * @returns 적용할 배수의 분자·분모
 */
export function computeGradeMultiplier(
  grade: number,
  hasRawBooster: boolean,
  upgradeBooster: UpgradeBooster | null = null,
): GradeMultiplier {
  const exponent = Math.max(0, grade - 1)
  let numerator = 1n
  let denominator = 1n
  for (let i = 0; i < exponent; i += 1) {
    numerator *= 3n
    denominator *= 2n
  }
  if (hasRawBooster) {
    numerator *= 12n
    denominator *= 10n
  }
  const booster = boosterProductionMultiplier(upgradeBooster)
  numerator *= booster.numerator
  denominator *= booster.denominator
  return { numerator, denominator }
}

/** bag[material] += amount (양수일 때만). 불변 bag을 원하면 호출측에서 복제할 것. */
function addToBag(bag: MaterialBag, material: MaterialType, amount: bigint): void {
  if (amount <= 0n) return
  const existing = bag[material] ?? 0n
  bag[material] = existing + amount
}

/**
 * 실수 배수를 bigint에 곱한다.
 * 정밀도 2자리(×100) 유지. 이 이상 정밀도가 필요하면 공식을 재설계할 것.
 */
function scaleBigint(value: bigint, bonus: number): bigint {
  const scaled = BigInt(Math.round(bonus * 100))
  return (value * scaled) / 100n
}

/** 등급/슬롯/시너지 배수를 순차 적용. 내부 헬퍼. */
function applyMultipliers(
  base: bigint,
  ticks: bigint,
  mult: GradeMultiplier,
  slotBonus: number,
  synergyBonus: number,
): bigint {
  const baseTotal = base * ticks
  const withGrade = (baseTotal * mult.numerator) / mult.denominator
  const withSlot = scaleBigint(withGrade, slotBonus)
  return scaleBigint(withSlot, synergyBonus)
}

/**
 * 주어진 tick 수로 카탈로그 산출(주+부산물)을 계산. 내부 헬퍼.
 *
 * `totalVolume` 은 개수 합이 아니라 **부피 합**(개수 × `volumeOf`)이다 — 창고
 * 여유가 슬롯 단위이므로 클램프 비교 대상도 부피여야 한다 (#21 결정 4).
 */
function computeOutputsForTicks(
  catalog: ReturnType<typeof getFactoryEntry>,
  ticks: number,
  mult: GradeMultiplier,
  slotBonus: number,
  synergyBonus: number,
): { produced: MaterialBag; totalVolume: bigint } {
  const produced: MaterialBag = {}
  let totalVolume = 0n
  if (ticks <= 0) return { produced, totalVolume }
  const ticksBig = BigInt(ticks)

  const primary = applyMultipliers(catalog.baseProduction, ticksBig, mult, slotBonus, synergyBonus)
  addToBag(produced, catalog.output, primary)
  totalVolume += primary * volumeOf(catalog.output)

  for (const sec of catalog.secondaryOutputs) {
    const amount = applyMultipliers(sec.amount, ticksBig, mult, slotBonus, synergyBonus)
    addToBag(produced, sec.material, amount)
    totalVolume += amount * volumeOf(sec.material)
  }

  return { produced, totalVolume }
}

/**
 * 한 공장의 수확 결과를 계산한다.
 *
 * 처리 순서:
 *  1. `elapsedTicks ≤ 0` 이면 즉시 빈 결과 반환.
 *  2. T2/T3 레시피가 있으면 **원료 클램프**: 보유 원료로 가능한 tick까지만 진행.
 *     (Phase 1에서는 `shortageMode`가 PAUSE/AUTO_BUY/PARTIAL 어느 것이든 PAUSE처럼 동작.)
 *  3. 1차 계산 후 창고 여유가 부족하면 **창고 클램프**: 담을 수 있는 tick 수로 하향.
 *  4. 최종 tick 수로 생산·소비를 산출.
 *
 * 순수 함수. 입력 객체를 변형하지 않는다.
 *
 * @param params 입력 파라미터
 * @returns 실제 반영된 tick 수·생산·소비
 */
export function computeFactoryYield(params: ComputeFactoryYieldParams): FactoryYield {
  const { factory, availableMaterials, warehouseFree, slotBonus = 1.0, synergyBonus = 1.0 } = params
  let { elapsedTicks } = params

  const catalog = getFactoryEntry(factory.type)

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  // SAVING 부스터는 재료 소비를 ×0.8 로 줄인다 (docs/design/03-factories.md §업그레이드 부스터).
  const consumption = boosterConsumptionMultiplier(factory.upgradeBooster)

  // Material clamp (T2/T3 recipes).
  if (catalog.recipe.length > 0) {
    let maxByMaterial = Number.POSITIVE_INFINITY
    for (const req of catalog.recipe) {
      const available = availableMaterials[req.material] ?? 0n
      // 소비 배수(분수) 반영: ticks × req × (num/den) ≤ available 을 만족하는 최대 ticks.
      const possible = Math.floor(
        Number(available * consumption.denominator) / Number(req.amount * consumption.numerator),
      )
      if (possible < maxByMaterial) maxByMaterial = possible
    }
    // Phase 1: PAUSE | AUTO_BUY | PARTIAL all treated as PAUSE.
    // TODO(phase-2): implement AUTO_BUY (market purchase) and PARTIAL.
    elapsedTicks = Math.min(elapsedTicks, maxByMaterial)
  }

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  const mult = computeGradeMultiplier(factory.grade, factory.hasRawBooster, factory.upgradeBooster)

  // First pass to inspect whether warehouse can hold the output.
  const firstPass = computeOutputsForTicks(catalog, elapsedTicks, mult, slotBonus, synergyBonus)

  if (firstPass.totalVolume > warehouseFree) {
    const perTick = computeOutputsForTicks(catalog, 1, mult, slotBonus, synergyBonus).totalVolume
    if (perTick <= 0n) {
      return { ticksRealized: 0, produced: {}, consumed: {} }
    }
    const ticksToFit = Number(warehouseFree / perTick)
    elapsedTicks = Math.min(elapsedTicks, ticksToFit)
  }

  if (elapsedTicks <= 0) {
    return { ticksRealized: 0, produced: {}, consumed: {} }
  }

  const finalOutputs = computeOutputsForTicks(catalog, elapsedTicks, mult, slotBonus, synergyBonus)

  const consumed: MaterialBag = {}
  for (const req of catalog.recipe) {
    // 총소비 = ⌊req × ticks × (num/den)⌋ — tick별이 아니라 총량에 분수를 적용해 절사 손실 최소화.
    const total =
      (req.amount * BigInt(elapsedTicks) * consumption.numerator) / consumption.denominator
    addToBag(consumed, req.material, total)
  }

  return {
    ticksRealized: elapsedTicks,
    produced: finalOutputs.produced,
    consumed,
  }
}
