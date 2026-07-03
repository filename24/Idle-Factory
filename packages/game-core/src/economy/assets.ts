/**
 * 총자산 평가 v1 — 순수 계산 모듈.
 *
 * 근거: docs/design/07-global-system.md §총자산 평가 (U-2, 2026-07-03 확정)
 *
 * ```
 * 총자산 = 현금(User.money)
 *        + Σ(창고 자재 수량 × 글로벌 현재가)
 *        + Σ(공장 누적 투자비: 신축비 + 지금까지의 업그레이드 비용 합)
 * ```
 *
 * 세율 누진 구간·주식 상장 자격·IPO 기본가가 모두 이 값에 의존한다.
 * v1 은 화폐 투입 원가만 계산한다 — 공장 건설·업그레이드에 소모된 **자재**는
 * 평가에 포함하지 않는다(U-2 의 "누적 투자비"는 화폐 비용 표를 인용).
 */

import { buildCost, cumulativeUpgradeCost } from '../factories/cost'
import type { FactoryType, MaterialType } from '../types'

/** 총자산 평가 입력 — 창고 자재 한 줄. */
export interface AssetStack {
  /** 자재 종류. */
  readonly material: MaterialType
  /** 보유 수량 (>= 0). */
  readonly count: bigint
}

/** 총자산 평가 입력 — 공장 한 채. */
export interface AssetFactory {
  /** 공장 종류. */
  readonly type: FactoryType
  /** 현재 등급 (1..10). */
  readonly grade: number
}

/** `evaluateTotalAssets` 입력. */
export interface TotalAssetsInput {
  /** 현금 (`User.money`, >= 0). */
  readonly money: bigint
  /** 창고 자재 보유 목록. */
  readonly stacks: readonly AssetStack[]
  /**
   * 자재별 글로벌 현재가 (`GlobalMarketPrice.currentPrice`).
   * 시세가 없는 자재는 평가액 0 으로 계산한다 — 시드가 전 자재를 보장하므로
   * (packages/database/prisma/seed.ts) 운영에서는 발생하지 않는 방어 경로.
   */
  readonly prices: ReadonlyMap<MaterialType, bigint>
  /** 보유 공장 목록. */
  readonly factories: readonly AssetFactory[]
}

/**
 * 공장 한 채의 누적 투자비(화폐)를 계산한다.
 *
 * `투자비 = 신축비 + Σ(1→grade 각 단계 업그레이드 비용)`
 * (docs/design/07-global-system.md §총자산 평가 U-2 — "공장 평가액 = 누적
 * 투자비(v1). 시세 재평가 대신 투입 원가로 산정").
 *
 * 업그레이드 비용 공식은 `factories/cost.ts` 의
 * `upgradeMoneyCost = buildCost × 3^N` 누적합(`cumulativeUpgradeCost`)을
 * 그대로 재사용한다 (docs/design/03-factories.md §업그레이드 비용).
 *
 * @param type 공장 종류
 * @param grade 현재 등급 (1..10)
 * @returns 누적 투자비 (bigint)
 * @throws {RangeError} grade 가 1..10 범위 밖 정수가 아닌 경우
 */
export function factoryInvestment(type: FactoryType, grade: number): bigint {
  if (!Number.isInteger(grade) || grade < 1 || grade > 10) {
    throw new RangeError(`grade must be an integer in 1..10, got ${grade}`)
  }
  const base = buildCost(type)
  if (grade === 1) return base
  return base + cumulativeUpgradeCost(type, 1, grade)
}

/**
 * 유저 글로벌 총자산을 평가한다 (U-2 v1).
 *
 * `현금 + Σ(창고 자재 × 글로벌 현재가) + Σ(공장 누적 투자비)` — 전부 BigInt
 * 정수 산술. 창고 자재는 `currentPrice` 기준의 **미실현 평가액**이며, 시세가
 * 없는 자재(방어 경로)는 0 으로 평가한다.
 *
 * 유저 자산은 서버와 무관한 글로벌 단일 계정 기준이다
 * (docs/design/07-global-system.md §유저 귀속 모델 D-1).
 *
 * @param input 현금·창고·시세·공장 스냅샷
 * @returns 총자산 (bigint, >= 0)
 * @throws {RangeError} money 또는 stack.count 가 음수인 경우
 */
export function evaluateTotalAssets(input: TotalAssetsInput): bigint {
  if (input.money < 0n) {
    throw new RangeError(`money must be >= 0, got ${input.money}`)
  }

  let total = input.money

  for (const stack of input.stacks) {
    if (stack.count < 0n) {
      throw new RangeError(`stack count must be >= 0, got ${stack.count} (${stack.material})`)
    }
    const price = input.prices.get(stack.material) ?? 0n
    total += stack.count * price
  }

  for (const factory of input.factories) {
    total += factoryInvestment(factory.type, factory.grade)
  }

  return total
}
