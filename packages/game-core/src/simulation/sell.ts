/**
 * 시뮬레이션 판매 단계 — 글로벌 즉시판매와 유저 상점 거래.
 *
 * **통화 회계의 핵심**이 여기 있다:
 *  - 글로벌 마켓 판매(`apps/bot/src/services/marketSell.ts`)는 시스템이 대금을
 *    지급하므로 화폐가 **발행(mint)** 된다. 수수료 0 (#15 U-3 확정).
 *  - 유저 상점 거래는 구매자 → 판매자 **이전(transfer)** 이라 총량이 늘지 않고,
 *    기간별 세율(3~18%)만큼만 **소각(burn)** 된다
 *    (docs/design/06-market.md §기간별 세율 테이블).
 *
 * 이 구분을 뭉개면 인플레율이 통째로 틀린다 — 유저 상점 비중이 높은 경제는
 * 거래가 아무리 활발해도 통화량이 늘지 않기 때문이다.
 */

import { calcListingTax, listingTaxRateBps } from '../economy/tax'
import type { MaterialType } from '../types'
import { computeFree, volumeOf } from '../warehouse/capacity'
import { computeReserves } from './harvest'
import type { Rng } from './rng'
import type { MutableMarketEntry, MutableUser } from './state'

/** 판매 단계 결과. */
export interface SellOutcome {
  /** 글로벌 판매로 시스템이 발행한 화폐. */
  readonly minted: bigint
  /** 유저 상점 세율로 소각된 화폐. */
  readonly listingTax: bigint
  /** 유저 간 이전된 총액 (총량 불변 — 진단용). */
  readonly transferred: bigint
  /** 과세 베이스에 더할 gross 판매액 (글로벌 + 유저 상점). */
  readonly grossRevenue: bigint
  /** 체결 건수 — `MARKET_SELL` XP 지급 단위. */
  readonly tradeCount: number
}

/** 판매 대상에서 제외할 자재 — 부스터는 소비 아이템이지 판매 재고가 아니다. */
const NON_SELLABLE: ReadonlySet<MaterialType> = new Set<MaterialType>(['RAW_BOOSTER'])

/** 빈 결과 — 팔 것이 없을 때. */
const EMPTY_OUTCOME: SellOutcome = {
  minted: 0n,
  listingTax: 0n,
  transferred: 0n,
  grossRevenue: 0n,
  tradeCount: 0,
}

/**
 * 구매자 탐색 시도 횟수.
 *
 * 전체 유저를 훑는 대신 무작위로 이만큼만 찔러 본다. 자격을 갖춘 유저가 전체의
 * 10% 만 되어도 8회 안에 한 명이 걸릴 확률은 약 57%, 30% 면 94% 다.
 */
const MAX_BUYER_PROBES = 8

/**
 * 유저 상점 거래의 구매자를 고른다.
 *
 * 조건: 판매자 본인 제외 + 대금 지불 능력 + 자재를 받을 창고 여유.
 * 못 찾으면 `null` — 호출자는 그 물량을 재고로 되돌린다(등록 만료 회수의
 * 근사, `MarketService` 의 만료 경로에 대응).
 *
 * **전수 탐색을 하지 않는다.** 이전 구현은 거래마다 `users.filter(...)` 로 전체
 * 유저를 훑고 후보마다 `computeFree` 로 재고를 다시 합산했다. 거래 건수 자체가
 * 유저 수에 비례하므로 총비용이 O(N²) 이 되어, 유저가 2배 늘 때 실행 시간이
 * 4배로 뛰었다(200→400명 실측 2.7초→11.3초).
 *
 * 무작위 표본 추출은 성능만을 위한 근사가 아니다 — 실제 상점도 "자격 있는 전체
 * 구매자 중 균등 추첨"이 아니라 "먼저 매물을 본 사람이 산다". 표본이 모두
 * 실패하면 미체결로 남는데, 이는 구매력이 마른 시장에서 매물이 실제로 만료
 * 회수되는 것과 같은 결과다.
 *
 * @param seller 판매자
 * @param users 전체 유저
 * @param price 총 대금
 * @param material 자재 종류 (창고 여유를 부피로 환산할 때 필요)
 * @param quantity 자재 수량
 * @param rng 결정론적 난수원
 * @returns 구매자 또는 null
 */
function pickBuyer(
  seller: MutableUser,
  users: readonly MutableUser[],
  price: bigint,
  material: MaterialType,
  quantity: bigint,
  rng: Rng,
): MutableUser | null {
  if (users.length <= 1) return null

  // 창고 여유는 슬롯(부피) 단위이므로 개수를 부피로 환산해 비교한다 (#21 결정 4).
  const requiredVolume = quantity * volumeOf(material)

  for (let probe = 0; probe < MAX_BUYER_PROBES; probe += 1) {
    const candidate = users[Math.floor(rng.next() * users.length)]!
    if (candidate.id === seller.id) continue
    if (candidate.money < price) continue
    if (computeFree(candidate.warehouseGrade, candidate.stacks) < requiredVolume) continue
    return candidate
  }
  return null
}

/**
 * 유저의 창고 재고를 판매한다.
 *
 * 예비 원료(`computeReserves`)를 제외한 전량을 판매 대상으로 삼고,
 * `profile.shopSellRatio` 비율만큼 유저 상점, 나머지는 글로벌 마켓으로 보낸다.
 * 글로벌 판매분은 `recentSales` 에 누적되어 다음 30분 가격 tick 의
 * demandFactor 에 반영된다 (docs/design/06-market.md §가격 산출 공식).
 *
 * 유저 상점 물량도 `recentSales` 에 넣지 않는다 — 런타임에서 `recentSales` 를
 * 올리는 것은 글로벌 판매 경로(`marketSell.ts`)뿐이기 때문이다.
 *
 * @param seller 판매자 (상태가 갱신된다)
 * @param users 전체 유저 (유저 상점 구매자 매칭용)
 * @param market 가변 마켓 상태 (recentSales 가 갱신된다)
 * @param rng 결정론적 난수원
 * @returns 판매 결과
 */
export function sellInventory(
  seller: MutableUser,
  users: readonly MutableUser[],
  market: Map<MaterialType, MutableMarketEntry>,
  rng: Rng,
): SellOutcome {
  const reserves = computeReserves(seller)
  let minted = 0n
  let listingTax = 0n
  let transferred = 0n
  let grossRevenue = 0n
  let tradeCount = 0

  const shopRatioPercent = BigInt(Math.round(seller.profile.shopSellRatio * 100))
  const listingRateBps = listingTaxRateBps(seller.profile.listingDurationDays)

  for (const [key, held] of Object.entries(seller.stacks)) {
    const material = key as MaterialType
    if (NON_SELLABLE.has(material)) continue

    const sellable = held - (reserves.get(material) ?? 0n)
    if (sellable <= 0n) continue

    const entry = market.get(material)
    if (!entry) continue

    const shopQty = (sellable * shopRatioPercent) / 100n
    const globalQty = sellable - shopQty

    // 글로벌 마켓 즉시 판매 — 시스템이 대금 지급 (화폐 발행).
    if (globalQty > 0n) {
      const gross = entry.currentPrice * globalQty
      seller.money += gross
      seller.stacks[material] = (seller.stacks[material] ?? 0n) - globalQty
      entry.recentSales += Number(globalQty)
      minted += gross
      grossRevenue += gross
      tradeCount += 1
    }

    // 유저 상점 — 구매자에게서 판매자로 이전, 세율만큼 소각.
    if (shopQty > 0n) {
      const gross = entry.currentPrice * shopQty
      const buyer = pickBuyer(seller, users, gross, material, shopQty, rng)
      if (buyer) {
        const tax = calcListingTax(gross, listingRateBps)
        buyer.money -= gross
        buyer.stacks[material] = (buyer.stacks[material] ?? 0n) + shopQty
        seller.money += gross - tax
        seller.stacks[material] = (seller.stacks[material] ?? 0n) - shopQty
        listingTax += tax
        transferred += gross
        grossRevenue += gross
        tradeCount += 1
      }
      // 구매자가 없으면 미체결 — 재고를 그대로 둔다(만료 회수 근사).
    }

    if ((seller.stacks[material] ?? 0n) <= 0n) delete seller.stacks[material]
  }

  if (tradeCount === 0) return EMPTY_OUTCOME
  seller.weeklyRevenue += grossRevenue
  return { minted, listingTax, transferred, grossRevenue, tradeCount }
}
