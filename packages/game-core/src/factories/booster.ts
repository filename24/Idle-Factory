/**
 * 업그레이드 부스터(SAVING/RARE/SPEED/PROFIT) 효과 정의.
 *
 * 3·5·7·10등급 업그레이드 시점에 유저가 하나를 선택해 공장에 영구 적용한다.
 * 수치 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템,
 *            §🧪 원자재 부스터 (Lv.50 해금).
 *
 * 배수는 부동소수점 오차를 피하기 위해 분자/분모(bigint) 분수로 관리한다.
 */

import type { FactoryTier, FactoryType, UpgradeBooster } from '../types'
import { getFactoryEntry } from './catalog'

/**
 * 부스터 배수(분수 표현). `production.ts`의 `GradeMultiplier`와 동일 형태.
 */
export interface BoosterMultiplier {
  /** 분자 */
  readonly numerator: bigint
  /** 분모 (>0) */
  readonly denominator: bigint
}

/**
 * 부스터 선택이 발생하는 등급 목록.
 * 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템 — 3·5·7·10등급.
 */
export const BOOSTER_CHOICE_GRADES: readonly number[] = [3, 5, 7, 10]

/**
 * 주어진 등급이 부스터 분기 선택 등급(3/5/7/10)인지 판별한다.
 *
 * @param grade 공장 등급
 * @returns 분기 등급이면 true
 */
export function isBoosterChoiceGrade(grade: number): boolean {
  return BOOSTER_CHOICE_GRADES.includes(grade)
}

/** 배수 없음(×1). 부스터 미선택/해당 없음일 때 사용. */
const IDENTITY: BoosterMultiplier = { numerator: 1n, denominator: 1n }

/**
 * SAVING 부스터의 재료 소비 배수 — 소비 자재 -20% (×0.8).
 * 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템.
 */
export const BOOSTER_SAVING_CONSUMPTION: BoosterMultiplier = {
  numerator: 8n,
  denominator: 10n,
}

/**
 * SPEED 부스터의 생산량 배수 — tick당 생산량 +15% (×1.15).
 * 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템.
 */
export const BOOSTER_SPEED_PRODUCTION: BoosterMultiplier = {
  numerator: 115n,
  denominator: 100n,
}

/**
 * PROFIT 부스터의 최종 생산량 배수 — +10% (×1.1).
 * 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템 (공장 수익 +10%).
 * Phase 1 에서는 판매 계층이 별도 배수를 갖지 않으므로 최종 생산량 배수로 구현한다 (#19).
 */
export const BOOSTER_PROFIT_PRODUCTION: BoosterMultiplier = {
  numerator: 11n,
  denominator: 10n,
}

/**
 * 부스터에 따른 **생산량** 배수를 반환한다.
 *
 * - `SPEED`: ×1.15
 * - `PROFIT`: ×1.1
 * - 그 외(`SAVING`/`RARE`/null): ×1
 *
 * @param booster 적용 중인 업그레이드 부스터 (없으면 null)
 * @returns 생산량에 곱할 분수 배수
 */
export function boosterProductionMultiplier(booster: UpgradeBooster | null): BoosterMultiplier {
  switch (booster) {
    case 'SPEED':
      return BOOSTER_SPEED_PRODUCTION
    case 'PROFIT':
      return BOOSTER_PROFIT_PRODUCTION
    default:
      return IDENTITY
  }
}

/**
 * 부스터에 따른 **재료 소비** 배수를 반환한다.
 *
 * - `SAVING`: ×0.8
 * - 그 외: ×1
 *
 * @param booster 적용 중인 업그레이드 부스터 (없으면 null)
 * @returns 재료 소비량에 곱할 분수 배수
 */
export function boosterConsumptionMultiplier(booster: UpgradeBooster | null): BoosterMultiplier {
  return booster === 'SAVING' ? BOOSTER_SAVING_CONSUMPTION : IDENTITY
}

/**
 * RARE 부스터 적용 공장의 tick당 `RAW_BOOSTER` 드롭 확률 (Tier별).
 *
 * 근거: 이슈 #19 — RARE 부스터가 적용된 T1/T2 공장이 tick당 0.5~1% 확률로 드롭.
 * T1 하한(0.5%)·T2 상한(1%)으로 고정한다. T3 은 RARE 부스터 드롭 대상이 아니다
 * (`docs/design/03-factories.md` §선택지 표 — 희귀 자재 증산형 적합 대상: T1/T2).
 */
export const RARE_BOOSTER_DROP_RATE: Readonly<Record<FactoryTier, number>> = {
  T1: 0.005,
  T2: 0.01,
  T3: 0,
}

/**
 * 원자재 부스터(`RAW_BOOSTER`) 투입이 해금되는 유저 레벨.
 * 근거: `docs/design/03-factories.md` §🧪 원자재 부스터 (Lv.50 해금).
 */
export const RAW_BOOSTER_UNLOCK_LEVEL = 50

/**
 * 드롭 판정용 RNG 시그니처. `Math.random` 호환 — [0, 1) 실수를 반환해야 한다.
 * 테스트 결정성을 위해 주입 가능하게 분리한다 (`land/specialSlots.ts` 패턴).
 */
export type BoosterDropRng = () => number

/** `computeRareBoosterDrop` 입력 파라미터. */
export interface ComputeRareBoosterDropParams {
  /** 공장 종류 (Tier 판정용) */
  readonly type: FactoryType
  /** 적용 중인 업그레이드 부스터 (없으면 null) */
  readonly upgradeBooster: UpgradeBooster | null
  /** 이번 수확에서 실제 반영된 tick 수 (`FactoryYield.ticksRealized`) */
  readonly ticks: number
  /** 드롭 판정 RNG (기본 `Math.random`) */
  readonly rng?: BoosterDropRng
}

/**
 * RARE 부스터에 의한 `RAW_BOOSTER` 드롭 수량을 계산한다.
 *
 * `upgradeBooster === 'RARE'` 인 T1/T2 공장만 대상이며, tick마다
 * `RARE_BOOSTER_DROP_RATE[tier]` 확률로 독립 판정한다.
 *
 * 순수 함수 — RNG를 주입하면 결정적으로 동작한다.
 *
 * @param params 입력 파라미터
 * @returns 드롭된 `RAW_BOOSTER` 수량 (0 이상)
 */
export function computeRareBoosterDrop(params: ComputeRareBoosterDropParams): bigint {
  const { type, upgradeBooster, ticks } = params
  if (upgradeBooster !== 'RARE' || ticks <= 0) return 0n

  const { tier } = getFactoryEntry(type)
  const rate = RARE_BOOSTER_DROP_RATE[tier]
  if (rate <= 0) return 0n

  const rng = params.rng ?? Math.random
  let drops = 0n
  for (let i = 0; i < ticks; i += 1) {
    if (rng() < rate) drops += 1n
  }
  return drops
}
