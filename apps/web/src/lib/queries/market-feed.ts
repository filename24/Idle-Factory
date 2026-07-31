import { unstable_cache } from 'next/cache'
import { getCreditTier } from '@idle/game-core'
import { db } from '../db'
import { changeFromBasePpm } from '../market-math'
import { MARKET_PRICE_REVALIDATE_SECONDS } from './market'

/**
 * 랜딩 "Market Feed" 패널용 실데이터.
 *
 * 이전에는 이 패널이 하드코딩된 데모 수치(`₩ 4,820` 등)를 **"Live" 배지와 함께**
 * 보여 줬다. 파리티 감사에서 지적된 부분으로, 실제 DB 와 아무 관련이 없으면서
 * 실시간인 것처럼 보이는 게 문제였다.
 *
 * ## "24시간 변동"을 만들 수 없다
 *
 * `GlobalMarketPrice` 에는 이력 테이블이 없다(`basePrice`/`currentPrice` 뿐).
 * 주가와 달리 `StockPriceTick` 같은 대응물이 없어서 24시간 델타는 계산이
 * **불가능**하다. 그래서 라벨을 "기준가 대비"로 바꿨다 — 기준가 델타를
 * "24h 변동"이라 부르는 건 없애려던 거짓말과 같은 종류다.
 */

/** 피드 타일 한 칸. */
export interface MarketFeedTile {
  /** 메시지 키 접미사 — `home.economy.metrics.<key>`. */
  readonly key: string
  readonly value: string
  /** 기준가 대비 등락 ppm. 등락 개념이 없는 타일은 null. */
  readonly changePpm: number | null
}

/** 랜딩 피드 전체. */
export interface MarketFeed {
  readonly steelPrice: string
  readonly steelChangePpm: number
  readonly oilPrice: string
  readonly oilChangePpm: number
  /** 활성 서버 평균 신뢰도(0~2000). */
  readonly avgCredit: number
  /** 평균 신뢰도의 티어 라벨. */
  readonly creditTier: string
  readonly factoryCount: number
}

/**
 * 랜딩 피드 데이터를 가져온다.
 *
 * 시세 행이 하나도 없으면(미시드 DB) `null` 을 준다 — 호출 측은 그때
 * 예시 수치를 **SAMPLE 로 명시해서** 렌더해야 한다.
 */
export const getMarketFeed = unstable_cache(
  async (): Promise<MarketFeed | null> => {
    const [steel, oil, creditAgg, factoryCount] = await Promise.all([
      db.globalMarketPrice.findUnique({ where: { material: 'STEEL' } }),
      db.globalMarketPrice.findUnique({ where: { material: 'CRUDE_OIL' } }),
      db.guild.aggregate({ _avg: { credit: true }, where: { leftAt: null } }),
      db.factory.count(),
    ])

    if (!steel || !oil) return null

    const avgCredit = Math.round(creditAgg._avg.credit ?? 0)

    return {
      steelPrice: steel.currentPrice.toString(),
      steelChangePpm: changeFromBasePpm(steel.currentPrice, steel.basePrice),
      oilPrice: oil.currentPrice.toString(),
      oilChangePpm: changeFromBasePpm(oil.currentPrice, oil.basePrice),
      avgCredit,
      creditTier: getCreditTier(avgCredit),
      factoryCount,
    }
  },
  ['market-feed'],
  { revalidate: MARKET_PRICE_REVALIDATE_SECONDS, tags: ['market-prices'] },
)
