/**
 * 시뮬레이션 직구매 단계 — 원료 부족 보충.
 *
 * 직구매는 글로벌 현재가의 **2배**를 시스템에 지불하는 경로라
 * (docs/design/04-economy.md §가격 결정) 통화 소각의 한 축이다. 이 경로를
 * 빼놓으면 T2/T3 경제의 싱크가 통째로 사라져 인플레율이 과대 추정된다.
 *
 * 행동 모델: 레시피 원료가 예비량(`computeReserves`)에 못 미치면, 레벨별
 * 일일 한도(`directBuyDailyLimit`)와 현금 한도 안에서 부족분을 산다.
 * T3 완제품과 `RAW_BOOSTER` 는 애초에 직구매 대상이 아니다
 * (`isDirectBuyMaterial`).
 */

import { directBuyDailyLimit, isDirectBuyMaterial } from '../economy/directBuy'
import type { MaterialType } from '../types'
import { computeFree, unitsThatFit } from '../warehouse/capacity'
import { computeRecipeReserves } from './harvest'
import type { MutableMarketEntry, MutableUser } from './state'

/**
 * 직구매에 쓸 수 있는 현금 비율 — 보유 현금의 50%.
 *
 * 생산 유지는 재투자보다 우선순위가 높지만, 전 재산을 원료에 쓰는 것은
 * 비합리적이라 절반으로 제한한다. 시뮬레이션 가정치이며 설계 문서 근거는 없다.
 */
const DIRECT_BUY_CASH_RATIO = 50n

/** 직구매 단계 결과. */
export interface DirectBuyOutcome {
  /** 지출(소각)한 화폐. */
  readonly spent: bigint
  /** 구매한 총 수량. */
  readonly quantity: number
}

/** 아무것도 사지 않은 결과. */
const EMPTY: DirectBuyOutcome = { spent: 0n, quantity: 0 }

/**
 * 원료 부족분을 직구매로 보충한다.
 *
 * 직구매 단가는 `params.directBuyMultiplier` 배(기본 2)로 계산한다 —
 * `directBuyUnitPrice` 대신 파라미터를 쓰는 이유는 스윕에서 배율 축을 흔들기
 * 위함이다. 배율이 기본값이면 두 경로의 결과는 동일하다.
 *
 * @param user 대상 유저 (현금·재고·일일 한도가 갱신된다)
 * @param market 현재 마켓 상태 (읽기만 한다 — 직구매는 `recentSales` 에 영향 없음)
 * @param multiplier 직구매 단가 배율 (>= 1)
 * @returns 지출액과 구매 수량
 */
export function replenishMaterials(
  user: MutableUser,
  market: ReadonlyMap<MaterialType, MutableMarketEntry>,
  multiplier: number,
): DirectBuyOutcome {
  // 레시피 원료만 대상 — 업그레이드/창고 자재까지 사면 초기 자금이 첫 공장
  // 대신 부자재에 소진된다 (`computeReserves` 주석 참조).
  const reserves = computeRecipeReserves(user)
  if (reserves.size === 0) return EMPTY

  const dailyRemaining = directBuyDailyLimit(user.level) - user.directBuyToday
  if (dailyRemaining <= 0) return EMPTY

  let budget = (user.money * DIRECT_BUY_CASH_RATIO) / 100n
  let remaining = dailyRemaining
  let spent = 0n
  let quantity = 0

  for (const [material, reserve] of reserves) {
    if (remaining <= 0 || budget <= 0n) break
    if (!isDirectBuyMaterial(material)) continue

    const held = user.stacks[material] ?? 0n
    if (held >= reserve) continue

    const entry = market.get(material)
    if (!entry) continue

    const unitPrice = entry.currentPrice * BigInt(Math.max(1, Math.round(multiplier)))
    if (unitPrice <= 0n) continue

    const shortage = reserve - held
    const affordable = budget / unitPrice
    // 창고 여유는 슬롯(부피) 단위 — 담을 수 있는 **개수** 로 환산해야 다른
    // 상한(부족분·예산·일일 한도)과 같은 단위로 비교된다 (#21 결정 4).
    const warehouseRoom = unitsThatFit(material, computeFree(user.warehouseGrade, user.stacks))
    const cap = [shortage, affordable, BigInt(remaining), warehouseRoom].reduce((a, b) =>
      a < b ? a : b,
    )
    if (cap <= 0n) continue

    const cost = unitPrice * cap
    user.money -= cost
    user.stacks[material] = held + cap
    budget -= cost
    spent += cost
    remaining -= Number(cap)
    quantity += Number(cap)
  }

  if (quantity === 0) return EMPTY
  user.directBuyToday += quantity
  return { spent, quantity }
}
