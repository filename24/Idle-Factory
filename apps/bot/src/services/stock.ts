/**
 * 주식 서비스 (#18) — IPO 상장·매수·매도.
 *
 * v0 스코프 (블루프린트 확정):
 *  - 상장 단위 = 공장 (`Stock.factoryId` 1:1, D1). 시장은 SERVER 고정 —
 *    GLOBAL 마켓은 Phase 5+ (D13).
 *  - 매매 상대 = 시스템 (D3, marketSell.ts 패턴): 유저 간 호가창 없음.
 *    TradeLog 는 fromUserId=거래 유저·toUserId=null 로 기록한다.
 *  - 무수수료·무세금 (D4, docs/design/08-stock.md §매수/매도 수수료) —
 *    gross=net, 마켓 buy 의 tax 경로를 복사하지 않는다.
 *  - 신뢰도 게이트(서버 500+/글로벌 1500+)는 #17 미구현으로 보류 (D5) —
 *    아래 `// TODO(#17)` 주석이 게이트 위치.
 *  - 동일 IP/부계정 차단은 비차단 로깅 v0 (D12) — 신규 구현 없음.
 *
 * 모든 상태 변경 메서드는 `runInTx`(Serializable 격리)로 감싼다.
 *
 * 참조: docs/design/08-stock.md, docs/design/09-level-xp.md §해금(Lv.10 매매),
 *      GitHub #18
 */

import type {
  PrismaClient,
  Stock,
  StockHolding,
  StockPriceTick,
  TradeKind
} from '@idle/database'
import type { FactoryType, MaterialType } from '@idle/game-core'
import {
  checkListingConditions,
  clampIpoPrice,
  computeDefaultIpoPrice,
  computeNextAvgBuyPrice,
  evaluateTotalAssets,
  xpForEvent,
  type ListingConditionFailure
} from '@idle/game-core'
import { ServiceError, isUniqueViolation, runInTx, type Tx } from './base'
import { RewardService } from './reward'
import { recordStockTrade } from './tradeLog'

/** 하루(ms). */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 주식 매매 참여 최소 레벨 — Lv.10.
 * 근거: docs/design/09-level-xp.md §레벨별 해금 "Lv.10 — 서버 주식 참여
 * (매수/매도)" (D6 — StockMarket.SERVER enum 주석 = 코드 현행).
 */
export const STOCK_TRADE_MIN_LEVEL = 10

/**
 * rate limit 판정 윈도 — 최근 1시간.
 * 근거: docs/design/08-stock.md §사기 방지 "동일 종목 1시간 내 반복
 * 매수/매도 rate limit" (D11).
 */
export const STOCK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * rate limit 허용 횟수 — 동일 유저×동일 종목 1시간 내 매수+매도 합산 6회.
 * 초과(7회째 시도) 시 `STOCK_RATE_LIMITED` 로 거부한다 (D11 — 횟수는 v0 상수).
 */
export const STOCK_RATE_LIMIT_MAX_TRADES = 6

/**
 * 상장 조건 "최근 거래 활성도" 집계 윈도 — 30일.
 * 근거: docs/design/08-stock.md §상장 조건 "최근 30일 거래 10회 이상".
 */
export const LISTING_TRADE_WINDOW_DAYS = 30

/**
 * 상장 조건 "최근 30일 거래 10회+" 집계에 포함되는 **능동 거래** kind 목록.
 *
 * DIVIDEND 는 시스템이 지급하는 수동 수령(배당)이라 유저의 거래 활성도가
 * 아니다 — docs/design/08-stock.md §상장 조건 "최근 30일 거래 10회 이상"은
 * 유저가 직접 수행한 거래(마켓 판매·직거래·직구매·주식 매매)만 센다.
 */
const ACTIVE_TRADE_KINDS = [
  'MARKET_SELL',
  'USER_TRADE',
  'DIRECT_BUY',
  'STOCK_BUY',
  'STOCK_SELL'
] as const satisfies ReadonlyArray<TradeKind>

/** Discord autocomplete 응답 상한 (market.ts 관례). */
const AUTOCOMPLETE_MAX = 25

/**
 * `/stock market` 시세 보드 페이지당 종목 수 — 종목당 Section 1개(매수 버튼
 * accessory)라, 제목·부제·네비 ActionRow 를 더해도 Container 최상위 컴포넌트
 * 한도(40) 안이고 한 화면 가독성이 좋은 값. 종목이 이보다 많으면 페이지네이션.
 */
export const STOCK_MARKET_PAGE_SIZE = 8

/** `/stock info` 스파크라인용 기본 tick 조회 수 — 최근 24시간(1시간 tick). */
const DEFAULT_RECENT_TICKS = 24

/** `StockService.ipo` 입력. */
export interface StockIpoInput {
  /** 상장 유저 id. */
  readonly userId: string
  /** 상장할 공장 id — 본인 소유여야 한다 (D1). */
  readonly factoryId: string
  /**
   * 유저 희망 IPO 가격 (>= 1). 기본가의 30~70% 밖 값은 거부하지 않고
   * 클램프한다 (D7, docs/design/08-stock.md §IPO 최종가).
   */
  readonly userSetPrice: bigint
  /** 상장이 발생한 활동 서버 snowflake — `Stock.guildId`(소속 서버)로 캡처. */
  readonly guildId?: string | null
}

/** `StockService.ipo` 결과. */
export interface StockIpoResult {
  /** 생성된 종목 행. */
  readonly stock: Stock
  /** 공식 기본가 (D7 — recent30dProfit=0 v0). */
  readonly defaultIpoPrice: bigint
  /** 유저 희망가. */
  readonly requestedPrice: bigint
  /** 클램프 후 최종 IPO 가격 (= `Stock.ipoPrice`). */
  readonly finalPrice: bigint
  /** 희망가가 30~70% 밴드 밖이라 클램프됐는지. */
  readonly clamped: boolean
}

/** `StockService.buy` / `StockService.sell` 공통 입력. */
export interface StockTradeInput {
  /** 거래 유저 id. */
  readonly userId: string
  /** 대상 종목 id. */
  readonly stockId: string
  /** 주수 (>= 1 정수). */
  readonly shares: number
  /**
   * 거래가 발생한 활동 서버 snowflake. TradeLog.guildId 로 기록되며,
   * SERVER 종목의 길드 격리 판정에도 쓰인다 — 종목의 소속 서버
   * (`Stock.guildId`)와 다르면 `STOCK_NOT_FOUND` 로 거부한다
   * (docs/design/08-stock.md §시장 구분 "서버 유저만 참여").
   */
  readonly guildId?: string | null
}

/** `StockService.buy` 결과. */
export interface StockBuyResult {
  /** 체결 단가 — 체결 시점의 `Stock.currentPrice`. */
  readonly unitPrice: bigint
  /** 지불 총액 = unitPrice × shares (무수수료, D4). */
  readonly totalCost: bigint
  /** 체결 주수. */
  readonly shares: number
  /** 매수 후 보유 주수. */
  readonly holdingShares: number
  /** 매수 후 가중평균 매수단가. */
  readonly avgBuyPrice: bigint
}

/** `StockService.sell` 결과. */
export interface StockSellResult {
  /** 체결 단가 — 체결 시점의 `Stock.currentPrice`. */
  readonly unitPrice: bigint
  /** 수령 총액 = unitPrice × shares (무수수료·무세금, D4). */
  readonly totalPaid: bigint
  /** 체결 주수. */
  readonly shares: number
  /** 매도 후 잔여 보유 주수. */
  readonly remainingShares: number
  /** 매도 후 평단가 — 전량 매도 시 0 리셋 (schema `avgBuyPrice` 규약). */
  readonly avgBuyPrice: bigint
  /** 수익 실현 XP(+10) 지급으로 레벨업이 발생했는지 — 미지급 시 항상 false. */
  readonly leveledUp: boolean
  /** 지급 후 레벨. */
  readonly newLevel: number
  /**
   * 지급된 수익 실현 XP — 수익 실현(체결가 > 평단가)일 때만 +10, 본전·손실
   * 매도는 0 (docs/design/09-level-xp.md §이벤트별 XP "주식 수익 실현").
   */
  readonly xpAwarded: bigint
}

/** `/stock info` 용 종목 상세 뷰 (read-only). */
export interface StockDetailView {
  /** 종목 행. */
  readonly stock: Stock
  /** 상장 공장 종류 — 표시명 렌더링용. */
  readonly factoryType: FactoryType
  /** 상장 유저(공장 소유자) id. */
  readonly issuerUserId: string
  /** 조회 유저의 보유 행 (없으면 null). */
  readonly holding: StockHolding | null
  /** 전 유저 유통 주수 합 — float 잔여 = sharesOutstanding - 이 값. */
  readonly totalHeldShares: number
  /** 최근 가격 tick — 최신순 (스파크라인용, 기본 24개). */
  readonly recentTicks: readonly StockPriceTick[]
}

/** Discord autocomplete 용 종목 한 줄. */
export interface StockAutocompleteChoice {
  readonly id: string
  /** 상장 공장 종류. */
  readonly factoryType: FactoryType
  /** 현재가. */
  readonly currentPrice: bigint
}

/** `/stock market` 시세 보드 한 줄 (종목 + 조회 유저 보유량). */
export interface StockMarketRow {
  readonly id: string
  /** 상장 공장 종류. */
  readonly factoryType: FactoryType
  /** 현재가. */
  readonly currentPrice: bigint
  /** IPO 상장가 — 보드 등락 기준가(vs 상장가). */
  readonly ipoPrice: bigint
  /** 발행 주수. */
  readonly sharesOutstanding: number
  /** 조회 유저의 보유 주수 (미보유 0). */
  readonly myShares: number
}

/** `/stock market` 시세 보드 한 페이지 결과 (행 + 페이지네이션용 전체 종목 수). */
export interface StockMarketPage {
  /** 이 페이지의 종목 행 목록. */
  readonly rows: StockMarketRow[]
  /** 서버 격리 필터를 통과한 전체 상장 종목 수 (페이지 수 계산용). */
  readonly total: number
}

/**
 * 유저 총자산을 트랜잭션 안에서 평가한다 (U-2 `evaluateTotalAssets` 재사용).
 *
 * weeklySettlement.ts 의 정산용 평가와 동일한 조합:
 * 현금 + Σ(창고 자재 × 글로벌 현재가) + Σ(공장 누적 투자비).
 */
async function evaluateUserAssetsInTx(
  tx: Tx,
  userId: string,
  money: bigint
): Promise<bigint> {
  const priceRows = await tx.globalMarketPrice.findMany({
    select: { material: true, currentPrice: true }
  })
  const prices = new Map<MaterialType, bigint>(
    priceRows.map((r) => [r.material as MaterialType, r.currentPrice])
  )
  const warehouse = await tx.warehouse.findUnique({
    where: { userId },
    select: { stacks: { select: { material: true, count: true } } }
  })
  const factories = await tx.factory.findMany({
    where: { userId },
    select: { type: true, grade: true }
  })
  return evaluateTotalAssets({
    money,
    stacks: (warehouse?.stacks ?? []).map((s) => ({
      material: s.material as MaterialType,
      count: s.count
    })),
    prices,
    factories: factories.map((f) => ({
      type: f.type as FactoryType,
      grade: f.grade
    }))
  })
}

/**
 * 매매 공통 가드: 유저 존재·레벨 게이트·종목 존재·길드 격리·자기거래 차단·
 * rate limit.
 *
 * 길드 격리: SERVER 종목은 소속 서버 유저만 참여한다
 * (docs/design/08-stock.md §시장 구분 "서버 유저만 참여"). 종목의
 * `Stock.guildId` 가 null 이 아니고 거래 요청의 `guildId` 와 다르면 다른
 * 서버의 종목은 "없는 종목"으로 취급해 `STOCK_NOT_FOUND` 를 던진다 —
 * 존재 여부를 노출하지 않는다. `guildId=null`(미시드 서버 폴백) 종목은
 * 어느 서버에서나 거래 가능.
 *
 * 반환값은 이후 단계가 재사용할 유저/종목 스냅샷.
 *
 * @throws `USER_NOT_FOUND` / `STOCK_LEVEL_GATE` / `STOCK_NOT_FOUND`
 *         / `STOCK_SELF_TRADE` / `STOCK_RATE_LIMITED`
 */
async function assertTradeAllowed(
  tx: Tx,
  userId: string,
  stockId: string,
  guildId: string | null,
  now: Date
): Promise<{
  user: { id: string; level: number; money: bigint }
  stock: Stock & { factory: { userId: string } }
}> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, level: true, money: true }
  })
  if (!user) throw new ServiceError('USER_NOT_FOUND')
  if (user.level < STOCK_TRADE_MIN_LEVEL) {
    throw new ServiceError('STOCK_LEVEL_GATE', undefined, {
      level: user.level,
      required: STOCK_TRADE_MIN_LEVEL
    })
  }

  const stock = await tx.stock.findUnique({
    where: { id: stockId },
    include: { factory: { select: { userId: true } } }
  })
  if (!stock) throw new ServiceError('STOCK_NOT_FOUND')

  // 길드 격리 (docs/design/08-stock.md §시장 구분 "서버 유저만 참여") —
  // 다른 서버 소속 SERVER 종목은 "없는 종목"으로 취급한다.
  if (stock.guildId !== null && stock.guildId !== guildId) {
    throw new ServiceError('STOCK_NOT_FOUND')
  }

  // 자기 상장 종목 자기거래 금지 (docs/design/08-stock.md §사기 방지).
  if (stock.factory.userId === userId) {
    throw new ServiceError('STOCK_SELF_TRADE')
  }

  // TODO(#17): 서버 신뢰도 게이트(서버 500+ 보류/글로벌 1500+) — #17 신뢰도
  // 시스템 구현 후 이 위치에서 검증한다 (D5, 모순 9 보류).

  // rate limit — 동일 유저×동일 종목 1시간 매수+매도 합산 6회 초과 거부 (D11).
  // 매수/매도 모두 fromUserId=거래 유저로 기록되므로(D3) fromUserId 로 센다.
  const windowStart = new Date(now.getTime() - STOCK_RATE_LIMIT_WINDOW_MS)
  const recentTrades = await tx.tradeLog.count({
    where: {
      stockId,
      fromUserId: userId,
      kind: { in: ['STOCK_BUY', 'STOCK_SELL'] },
      createdAt: { gte: windowStart }
    }
  })
  if (recentTrades >= STOCK_RATE_LIMIT_MAX_TRADES) {
    throw new ServiceError('STOCK_RATE_LIMITED', undefined, {
      recentTrades,
      max: STOCK_RATE_LIMIT_MAX_TRADES,
      windowMs: STOCK_RATE_LIMIT_WINDOW_MS
    })
  }

  return { user, stock }
}

/** 주수 입력(정수 >= 1) 검증 — 위반 시 `INVALID_QUANTITY`. */
function assertValidShares(shares: number): void {
  if (!Number.isInteger(shares) || shares < 1) {
    throw new ServiceError(
      'INVALID_QUANTITY',
      `shares must be an integer >= 1, got ${shares}`
    )
  }
}

export const StockService = {
  /**
   * 공장을 상장(IPO)한다.
   *
   * 단일 트랜잭션(Serializable):
   *  1. 유저·공장 소유 검증 (`USER_NOT_FOUND`, `FACTORY_NOT_FOUND`).
   *  2. 기상장 여부 (`STOCK_ALREADY_LISTED` — `Stock.factoryId` unique).
   *  3. 상장 조건 4종 AND 판정 (`STOCK_LISTING_CONDITION_NOT_MET`, D6):
   *     Lv.25+·공장 5+·총자산 1억+·최근 30일 거래 10회+. 총자산은 U-2
   *     `evaluateTotalAssets` 재사용, 거래 횟수는 TradeLog 실거래(price>0,
   *     본인이 from 또는 to, 능동 거래 kind 한정 — DIVIDEND 수동 수령 제외)
   *     카운트.
   *  4. IPO 가격: `defaultIPO = (totalAssets + 0×10) / 100` (D7 —
   *     recent30dProfit 은 상장 전 수익 이력이 없어 v0 은 0 고정) →
   *     `finalIPO = clamp(userSetPrice, 30%, 70%)`.
   *  5. `Stock.create` — market=SERVER 고정 (GLOBAL 은 D13 스코프 아웃),
   *     guildId 는 Guild FK 가드 후 캡처.
   *
   * IPO 자체는 XP 를 지급하지 않는다 (docs/design/09-level-xp.md §이벤트별
   * XP 에 상장 이벤트 없음).
   *
   * @throws {ServiceError}
   *  - `STOCK_IPO_PRICE_OUT_OF_RANGE` — 희망가 < 1 (클램프 불능 입력)
   *  - `USER_NOT_FOUND` / `FACTORY_NOT_FOUND` / `STOCK_ALREADY_LISTED`
   *  - `STOCK_LISTING_CONDITION_NOT_MET` — details.failures 에 미달 조건 목록
   */
  async ipo(
    prisma: PrismaClient,
    input: StockIpoInput
  ): Promise<StockIpoResult> {
    const { userId, factoryId, userSetPrice, guildId = null } = input

    if (userSetPrice < 1n) {
      throw new ServiceError(
        'STOCK_IPO_PRICE_OUT_OF_RANGE',
        `userSetPrice must be >= 1, got ${userSetPrice}`
      )
    }

    // now 는 트랜잭션 재시도(P2034) 간에도 안정적이도록 밖에서 캡처 (market.ts 관례).
    const now = new Date()

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, level: true, money: true }
      })
      if (!user) throw new ServiceError('USER_NOT_FOUND')

      const factory = await tx.factory.findUnique({
        where: { id: factoryId },
        select: { id: true, userId: true }
      })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }

      const existing = await tx.stock.findUnique({
        where: { factoryId },
        select: { id: true }
      })
      if (existing) {
        throw new ServiceError('STOCK_ALREADY_LISTED', undefined, {
          stockId: existing.id
        })
      }

      // 상장 조건 집계 (D6). 거래 활성도는 실거래만 — price=0 인 취소/만료
      // 회수 기록(schema TradeLog 규약)과 DIVIDEND(수동 수령,
      // ACTIVE_TRADE_KINDS 제외 kind)는 제외한다.
      const factoryCount = await tx.factory.count({ where: { userId } })
      const tradeWindowStart = new Date(
        now.getTime() - LISTING_TRADE_WINDOW_DAYS * DAY_MS
      )
      const recent30dTrades = await tx.tradeLog.count({
        where: {
          OR: [{ fromUserId: userId }, { toUserId: userId }],
          kind: { in: [...ACTIVE_TRADE_KINDS] },
          price: { gt: 0n },
          createdAt: { gte: tradeWindowStart }
        }
      })
      const totalAssets = await evaluateUserAssetsInTx(tx, userId, user.money)

      const failures: readonly ListingConditionFailure[] =
        checkListingConditions({
          level: user.level,
          factoryCount,
          totalAssets,
          recent30dTrades
        })
      if (failures.length > 0) {
        throw new ServiceError('STOCK_LISTING_CONDITION_NOT_MET', undefined, {
          failures,
          level: user.level,
          factoryCount,
          totalAssets: totalAssets.toString(),
          recent30dTrades
        })
      }

      // IPO 가격 확정 (D7): recent30dProfit=0 v0 → 30~70% 클램프.
      const defaultIpoPrice = computeDefaultIpoPrice({
        totalAssets,
        recent30dProfit: 0n
      })
      const finalPrice = clampIpoPrice(userSetPrice, defaultIpoPrice)

      // Stock.guildId 는 Guild FK — 미시드/탈퇴 서버면 null 로 낮춘다
      // (tradeLog.ts resolveGuildFk 와 동일한 best-effort 귀속).
      const guild = guildId
        ? await tx.guild.findUnique({
            where: { id: guildId },
            select: { id: true }
          })
        : null

      // 동시 더블 서브밋 경합: 위의 기상장 조회를 둘 다 통과해도
      // `Stock.factoryId` unique 가 P2002 로 한쪽을 거부한다 — unknown 에러가
      // 아니라 도메인 에러(STOCK_ALREADY_LISTED)로 변환해 노출한다.
      let stock: Stock
      try {
        stock = await tx.stock.create({
          data: {
            factoryId,
            market: 'SERVER',
            guildId: guild?.id ?? null,
            ipoPrice: finalPrice,
            currentPrice: finalPrice
          }
        })
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ServiceError('STOCK_ALREADY_LISTED', undefined, {
            factoryId
          })
        }
        throw err
      }

      return {
        stock,
        defaultIpoPrice,
        requestedPrice: userSetPrice,
        finalPrice,
        clamped: finalPrice !== userSetPrice
      }
    })
  },

  /**
   * 주식을 매수한다 (상대 = 시스템, D3).
   *
   * 단일 트랜잭션(Serializable):
   *  1. 공통 가드 — Lv.10 게이트·자기거래 차단·rate limit
   *     (`STOCK_LEVEL_GATE`, `STOCK_SELF_TRADE`, `STOCK_RATE_LIMITED`).
   *  2. 유통 상한 (D3): `sum(StockHolding.shares) + 매수량 ≤ sharesOutstanding`
   *     위반 시 `STOCK_FLOAT_EXHAUSTED`.
   *  3. 대금 = `currentPrice × 주수` (무수수료, D4) — 잔액 부족 시
   *     `INSUFFICIENT_MONEY`.
   *  4. 보유 행 upsert + 가중평균 매수단가 재계산 (`computeNextAvgBuyPrice`).
   *  5. `TradeLog(kind=STOCK_BUY, stockId, fromUserId=유저, toUserId=null)`.
   *
   * 매수 XP 는 없다 — docs/design/09-level-xp.md §이벤트별 XP 는 "주식 수익
   * 실현(+10)"만 정의하며 이는 매도 경로에서 지급한다.
   *
   * @throws {ServiceError} `INVALID_QUANTITY` / `USER_NOT_FOUND` /
   *  `STOCK_LEVEL_GATE` / `STOCK_NOT_FOUND` / `STOCK_SELF_TRADE` /
   *  `STOCK_RATE_LIMITED` / `STOCK_FLOAT_EXHAUSTED` / `INSUFFICIENT_MONEY`
   */
  async buy(
    prisma: PrismaClient,
    input: StockTradeInput
  ): Promise<StockBuyResult> {
    const { userId, stockId, shares, guildId = null } = input
    assertValidShares(shares)
    const now = new Date()

    return runInTx(prisma, async (tx) => {
      const { user, stock } = await assertTradeAllowed(
        tx,
        userId,
        stockId,
        guildId,
        now
      )

      // 유통 상한 (D3) — 전 유저 보유 합 + 매수량 ≤ 발행 주수.
      const held = await tx.stockHolding.aggregate({
        where: { stockId },
        _sum: { shares: true }
      })
      const totalHeld = held._sum.shares ?? 0
      if (totalHeld + shares > stock.sharesOutstanding) {
        throw new ServiceError('STOCK_FLOAT_EXHAUSTED', undefined, {
          totalHeld,
          requested: shares,
          sharesOutstanding: stock.sharesOutstanding
        })
      }

      const unitPrice = stock.currentPrice
      const totalCost = unitPrice * BigInt(shares)
      if (user.money < totalCost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: totalCost.toString(),
          have: user.money.toString()
        })
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: totalCost } }
      })

      // 가중평균 매수단가 재계산 (docs/design/08-stock.md §관련 스키마).
      const holding = await tx.stockHolding.findUnique({
        where: { userId_stockId: { userId, stockId } }
      })
      const nextAvg = computeNextAvgBuyPrice({
        prevShares: holding?.shares ?? 0,
        prevAvgBuyPrice: holding?.avgBuyPrice ?? 0n,
        buyShares: shares,
        buyUnitPrice: unitPrice
      })
      const updatedHolding = await tx.stockHolding.upsert({
        where: { userId_stockId: { userId, stockId } },
        create: { userId, stockId, shares, avgBuyPrice: nextAvg },
        update: { shares: { increment: shares }, avgBuyPrice: nextAvg }
      })

      await recordStockTrade(tx, {
        fromUserId: userId,
        toUserId: null,
        stockId,
        kind: 'STOCK_BUY',
        amount: BigInt(shares),
        price: totalCost,
        guildId
      })

      return {
        unitPrice,
        totalCost,
        shares,
        holdingShares: updatedHolding.shares,
        avgBuyPrice: updatedHolding.avgBuyPrice
      }
    })
  },

  /**
   * 주식을 매도한다 (상대 = 시스템, D3).
   *
   * 단일 트랜잭션(Serializable):
   *  1. 공통 가드 — Lv.10 게이트·자기거래 차단·rate limit.
   *  2. 보유 주수 검증 (`STOCK_INSUFFICIENT_SHARES`).
   *  3. 수령액 = `currentPrice × 주수` (무수수료·무세금, D4) —
   *     `RewardService.grant` 로 MONEY 지급. **수익 실현 XP(+10)는 체결가 >
   *     평단가일 때만** 함께 지급한다 — docs/design/09-level-xp.md
   *     §이벤트별 XP 의 문면이 "주식 **수익 실현** +10" 이므로 본전·손실
   *     매도는 미지급(매수↔매도 반복 XP 파밍 차단). `avgBuyPrice` 가 0
   *     (이전 데이터·엣지)이면 손익 판정이 불가능하므로 지급하지 않는다.
   *     상대가 시스템(toUserId=null)이므로 마켓의 반복 상대 감쇠
   *     (`grantMarketSellReward`)는 적용 대상이 아니다 — marketSell.ts
   *     (글로벌 판매, 감쇠 없음) 선례를 따른다. 반복 남용은 rate limit(D11)이
   *     별도로 차단한다.
   *  4. 보유 갱신 — 전량 매도 시 `avgBuyPrice` 를 0 으로 리셋 (schema 규약,
   *     game-core `computeNextAvgBuyPrice` JSDoc "전량 매도 시 0 리셋은
   *     서비스 책임").
   *  5. `TradeLog(kind=STOCK_SELL, stockId, fromUserId=유저, toUserId=null)`.
   *
   * @throws {ServiceError} `INVALID_QUANTITY` / `USER_NOT_FOUND` /
   *  `STOCK_LEVEL_GATE` / `STOCK_NOT_FOUND` / `STOCK_SELF_TRADE` /
   *  `STOCK_RATE_LIMITED` / `STOCK_INSUFFICIENT_SHARES`
   */
  async sell(
    prisma: PrismaClient,
    input: StockTradeInput
  ): Promise<StockSellResult> {
    const { userId, stockId, shares, guildId = null } = input
    assertValidShares(shares)
    const now = new Date()

    return runInTx(prisma, async (tx) => {
      const { stock } = await assertTradeAllowed(
        tx,
        userId,
        stockId,
        guildId,
        now
      )

      const holding = await tx.stockHolding.findUnique({
        where: { userId_stockId: { userId, stockId } }
      })
      if (!holding || holding.shares < shares) {
        throw new ServiceError('STOCK_INSUFFICIENT_SHARES', undefined, {
          requested: shares,
          have: holding?.shares ?? 0
        })
      }

      const unitPrice = stock.currentPrice
      const totalPaid = unitPrice * BigInt(shares)

      const remainingShares = holding.shares - shares
      await tx.stockHolding.update({
        where: { userId_stockId: { userId, stockId } },
        data: {
          shares: remainingShares,
          // 전량 매도 시 평단가 0 리셋 (schema `avgBuyPrice` 규약).
          ...(remainingShares === 0 ? { avgBuyPrice: 0n } : {})
        }
      })

      // 대금(MONEY) 지급 + 수익 실현 시에만 XP(+10) — 레벨업 일관 처리
      // (marketSell.ts 선례). docs/design/09-level-xp.md §이벤트별 XP "주식
      // 수익 실현 +10" 문면대로 체결가 > 평단가일 때만 지급한다. 본전·손실
      // 매도 미지급으로 매수↔매도 반복 XP 파밍을 차단하고, avgBuyPrice=0
      // (이전 데이터 엣지)은 손익 판정 불가라 미지급.
      const isProfitRealized =
        holding.avgBuyPrice > 0n && unitPrice > holding.avgBuyPrice
      const xpAwarded = isProfitRealized
        ? xpForEvent({ kind: 'STOCK_REALIZE' })
        : 0n
      const grant = await RewardService.grant(tx, userId, [
        { kind: 'MONEY', amount: totalPaid },
        ...(isProfitRealized
          ? [{ kind: 'XP' as const, amount: xpAwarded }]
          : [])
      ])

      await recordStockTrade(tx, {
        fromUserId: userId,
        toUserId: null,
        stockId,
        kind: 'STOCK_SELL',
        amount: BigInt(shares),
        price: totalPaid,
        guildId
      })

      return {
        unitPrice,
        totalPaid,
        shares,
        remainingShares,
        avgBuyPrice: remainingShares === 0 ? 0n : holding.avgBuyPrice,
        leveledUp: grant.leveledUp,
        newLevel: grant.newLevel,
        xpAwarded
      }
    })
  },

  /**
   * `/stock info` 용 종목 상세를 조회한다 (read-only).
   *
   * 종목 + 상장 공장 종류 + (선택) 조회 유저의 보유 행 + 유통 주수 합 +
   * 최근 가격 tick(최신순, 기본 24개 — 1시간 tick 기준 24시간 스파크라인).
   *
   * @throws {ServiceError} `STOCK_NOT_FOUND`
   */
  async getDetail(
    prisma: PrismaClient,
    input: { readonly stockId: string; readonly userId?: string }
  ): Promise<StockDetailView> {
    const stock = await prisma.stock.findUnique({
      where: { id: input.stockId },
      include: { factory: { select: { userId: true, type: true } } }
    })
    if (!stock) throw new ServiceError('STOCK_NOT_FOUND')

    const [holding, held, recentTicks] = await Promise.all([
      input.userId
        ? prisma.stockHolding.findUnique({
            where: {
              userId_stockId: { userId: input.userId, stockId: stock.id }
            }
          })
        : Promise.resolve(null),
      prisma.stockHolding.aggregate({
        where: { stockId: stock.id },
        _sum: { shares: true }
      }),
      prisma.stockPriceTick.findMany({
        where: { stockId: stock.id },
        orderBy: { tickAt: 'desc' },
        take: DEFAULT_RECENT_TICKS
      })
    ])

    const { factory, ...stockRow } = stock
    return {
      stock: stockRow as Stock,
      factoryType: factory.type as FactoryType,
      issuerUserId: factory.userId,
      holding,
      totalHeldShares: held._sum.shares ?? 0,
      recentTicks
    }
  },

  /**
   * Discord autocomplete 용 상장 종목 검색 (read-only).
   *
   * `query` 가 비어 있으면 최근 상장순 상위 25개, 아니면 종목 id prefix 또는
   * 공장 종류(enum 대문자 prefix) 매칭 — market.ts
   * `searchActiveForAutocomplete` 관례.
   *
   * 길드 격리 (docs/design/08-stock.md §시장 구분 "서버 유저만 참여"):
   * `guildId` 를 주면 그 서버 소속 종목 + 소속 서버가 없는(`guildId=null`,
   * 미시드 서버 폴백) 종목만 노출한다 — 다른 서버 종목은 후보에서 제외해
   * 매매 가드(`STOCK_NOT_FOUND`)와 일관되게 숨긴다.
   */
  async searchListedForAutocomplete(
    prisma: PrismaClient,
    input: {
      readonly query: string
      readonly limit?: number
      /** 조회 서버 snowflake — null/생략 시 소속 서버 없는 종목만 노출. */
      readonly guildId?: string | null
    }
  ): Promise<StockAutocompleteChoice[]> {
    const limit = Math.min(input.limit ?? AUTOCOMPLETE_MAX, AUTOCOMPLETE_MAX)
    const query = input.query.trim()

    // 공장 종류는 enum 이라 startsWith 필터가 불가 — 대문자 prefix 를
    // 메모리에서 매칭해 `in` 으로 조회한다 (market.ts MATERIAL_VALUES 관례).
    const upper = query.toUpperCase()
    const matchedTypes = FACTORY_TYPE_VALUES.filter((t) => t.startsWith(upper))
    const orClauses: Array<Record<string, unknown>> = [
      { id: { startsWith: query } }
    ]
    if (matchedTypes.length > 0) {
      orClauses.push({ factory: { type: { in: [...matchedTypes] } } })
    }

    // 길드 격리 필터 — guildId=null 종목(미시드 서버 폴백)은 항상 포함한다.
    const guildFilter =
      input.guildId != null
        ? { OR: [{ guildId: null }, { guildId: input.guildId }] }
        : { guildId: null }

    const rows = await prisma.stock.findMany({
      where:
        query.length === 0
          ? guildFilter
          : { AND: [guildFilter, { OR: orClauses }] },
      orderBy: { listedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        currentPrice: true,
        factory: { select: { type: true } }
      }
    })

    return rows.map((r) => ({
      id: r.id,
      factoryType: r.factory.type as FactoryType,
      currentPrice: r.currentPrice
    }))
  },

  /**
   * `/stock market` 시세 보드 한 페이지를 조회한다 (read-only).
   *
   * 조회 서버 격리(`searchListedForAutocomplete` 와 동일: 해당 서버 +
   * `guildId=null` 폴백)로 최근 상장순 정렬 후 `offset`/`limit` 로 페이지를
   * 자른다. 조회 유저 보유량은 종목별 `holdings` 를 유저 필터로 함께 select 해
   * N+1 없이 붙이고, 전체 종목 수(`total`)를 같은 필터로 count 해 함께 반환한다
   * (페이지 수 계산용).
   *
   * @param prisma - DB 클라이언트
   * @param input.guildId - 조회 서버 snowflake (null/생략 시 소속 서버 없는 종목만)
   * @param input.userId - 보유량 집계 대상 유저 id
   * @param input.limit - 페이지당 종목 수 (기본·최대 `STOCK_MARKET_PAGE_SIZE`)
   * @param input.offset - 건너뛸 종목 수 (`page × pageSize`, 기본 0)
   * @returns `{ rows, total }` — 이 페이지 행 + 전체 종목 수
   */
  async listListedForGuild(
    prisma: PrismaClient,
    input: {
      readonly guildId?: string | null
      readonly userId: string
      readonly limit?: number
      readonly offset?: number
    }
  ): Promise<StockMarketPage> {
    const limit = Math.min(
      input.limit ?? STOCK_MARKET_PAGE_SIZE,
      STOCK_MARKET_PAGE_SIZE
    )
    const offset = Math.max(0, input.offset ?? 0)
    const guildFilter =
      input.guildId != null
        ? { OR: [{ guildId: null }, { guildId: input.guildId }] }
        : { guildId: null }

    const [rows, total] = await Promise.all([
      prisma.stock.findMany({
        where: guildFilter,
        orderBy: { listedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          currentPrice: true,
          ipoPrice: true,
          sharesOutstanding: true,
          factory: { select: { type: true } },
          holdings: {
            where: { userId: input.userId },
            select: { shares: true }
          }
        }
      }),
      prisma.stock.count({ where: guildFilter })
    ])

    return {
      rows: rows.map((r) => ({
        id: r.id,
        factoryType: r.factory.type as FactoryType,
        currentPrice: r.currentPrice,
        ipoPrice: r.ipoPrice,
        sharesOutstanding: r.sharesOutstanding,
        myShares: r.holdings[0]?.shares ?? 0
      })),
      total
    }
  }
} as const

/** 공장 종류 enum 값 캐시 — 자동완성 매칭용 (market.ts MATERIAL_VALUES 관례). */
const FACTORY_TYPE_VALUES = [
  'FARM',
  'MINE',
  'LUMBER',
  'OIL_WELL',
  'STEEL_MILL',
  'REFINERY',
  'FLOUR_MILL',
  'FURNITURE_FACTORY',
  'CAR_FACTORY',
  'ELECTRONICS_FACTORY',
  'FOOD_FACTORY'
] as const satisfies ReadonlyArray<FactoryType>
