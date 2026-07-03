/**
 * 마켓 거래 로그 기록 + XP 사기 방지(반복 상대 감쇠·신규 계정 시그널) 헬퍼.
 *
 * `market.ts` 의 buy/cancel/expireStale 가 공유한다. 서비스 계층 규약을 지켜
 * discord.js 에 의존하지 않는다 — 입력은 원시값(문자열/bigint/Date)만 받는다.
 *
 * 제공:
 *  - `recordMarketTrade` : TradeLog 한 건 기록(kind=MARKET_SELL 고정, Guild FK 가드 포함).
 *  - `grantMarketSellReward` : 판매자에게 세후 대금(MONEY) + 반복 상대 감쇠 XP 지급.
 *  - `assessActorTrust` : 구매자 신규 계정/신규 서버 멤버 시그널 계산(v0 로깅용, 비차단).
 *
 * 수치 근거:
 *  - docs/design/09-level-xp.md §사기 방지 — "동일 상대와의 반복 거래는 XP 감소(N회 이후 0)",
 *    "동일 IP/부계정 간 거래는 XP 미지급".
 *  - docs/design/10-open-questions.md "사기 방지 규칙 세부 수치"(🟢 미확정)의 최초 확정값(v0).
 */

import type { MaterialType } from '@idle/game-core'
import { xpForEvent } from '@idle/game-core'
import { RewardService, type GrantResult } from './reward'
import type { Tx } from './base'

/** 하루(ms). */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 반복 상대 XP 감쇠 판정 윈도 — 최근 24시간.
 * 근거: docs/design/09-level-xp.md §사기 방지("동일 상대와의 반복 거래").
 */
export const MARKET_XP_DECAY_WINDOW_MS = DAY_MS

/** 100% 지급 최대 순번(1~3회차). */
const DECAY_FULL_MAX_ORDINAL = 3
/** 50% 지급 최대 순번(4~5회차). */
const DECAY_HALF_MAX_ORDINAL = 5
/** 승수 기준(1만분율, permyriad). calcTax 와 동일한 정수 산술을 쓴다. */
const PPM_DENOMINATOR = 10_000n
const PPM_FULL = 10_000
const PPM_HALF = 5_000
const PPM_ZERO = 0

/**
 * 신규 계정 판정 임계 — Discord 계정 생성 7일 미만.
 * v0 최초 확정값(docs/design/10-open-questions.md "사기 방지 규칙 세부 수치").
 */
export const NEW_ACCOUNT_MAX_AGE_DAYS = 7
/**
 * 신규 서버 멤버 판정 임계 — 서버 가입 1일 미만.
 * v0 최초 확정값(docs/design/10-open-questions.md "사기 방지 규칙 세부 수치").
 */
export const NEW_GUILD_MEMBER_MAX_AGE_DAYS = 1

/**
 * 현재 판매의 순번(ordinal, 1-based)에 대응하는 XP 승수(1만분율)를 반환한다.
 *
 * ordinal = (윈도 내 동일 상대 기존 실판매 수) + 1.
 *  - 1~3회차: 100% (10000)
 *  - 4~5회차: 50%  (5000)
 *  - 6회차+ : 0%   (0)
 *
 * 근거: docs/design/09-level-xp.md §사기 방지 / docs/design/10-open-questions.md v0.
 */
export function marketSellXpMultiplierPpm(ordinal: number): number {
  if (ordinal <= DECAY_FULL_MAX_ORDINAL) return PPM_FULL
  if (ordinal <= DECAY_HALF_MAX_ORDINAL) return PPM_HALF
  return PPM_ZERO
}

/**
 * BigInt 기준값에 1만분율 승수를 곱해 감쇠값을 정수로 반환(floor).
 * float 곱셈을 피하려 `calcTax` 와 동일한 1만분율 정수 산술만 쓴다.
 */
export function applyPpm(base: bigint, ppm: number): bigint {
  return (base * BigInt(ppm)) / PPM_DENOMINATOR
}

/**
 * 마켓 거래 TradeLog 한 건 입력.
 *
 * v0 규약(docs/design/09-level-xp.md §사기 방지, schema `TradeLog` 주석):
 *  - 실판매(buy): toUserId=구매자, amount=수량, price=총액.
 *  - 취소/만료: toUserId=null, price=0(자재 회수 이벤트 구분자), amount=회수 수량.
 *  - 글로벌 판매(유저→시스템, #15 U-3): toUserId=null(상대 없음), price=총액(>0),
 *    amount=수량. toUserId=null 이면서 price>0 이면 글로벌 판매 — price=0 인
 *    취소/만료 회수와 구분된다. `MARKET_SELL` enum 주석("글로벌/유저 상점 판매")
 *    의 원 의도대로 enum 확장 없이 판별 가능하다.
 */
export interface MarketTradeLogInput {
  /** 판매자(매물 소유자) id. */
  readonly fromUserId: string
  /** 구매자 id. 취소/만료 회수·글로벌 판매(상대 없음) 기록은 null. */
  readonly toUserId: string | null
  /** 거래 자재. */
  readonly material: MaterialType
  /** 수량. */
  readonly amount: bigint
  /** 총액(gross). 취소/만료는 0. */
  readonly price: bigint
  /** 활동 서버 snowflake. 없거나 미시드/탈퇴 서버면 가드가 null 로 낮춘다. */
  readonly guildId: string | null
}

/** `recordMarketTrade` 옵션. */
export interface RecordMarketTradeOptions {
  /**
   * 사전 배치 조회된 실존 Guild id 집합. 루프 호출부(expireStale)가
   * `resolveExistingGuildIds` 로 한 번만 조회해 넘기면 건별 `guild.findUnique`
   * 를 생략한다 (N+1 방지).
   */
  readonly knownGuildIds?: ReadonlySet<string>
}

/**
 * 마켓 거래 TradeLog 한 건을 기록한다 (kind=MARKET_SELL 고정, v0 — enum 미확장).
 *
 * `TradeLog.guildId` 는 Guild FK 이므로, 참조 서버가 DB 에 없으면(길드 미시드 또는
 * 등록 후 탈퇴로 인한 유령 참조) INSERT 가 FK 위반으로 실패해 상위 거래 트랜잭션을
 * 통째로 롤백시킨다. 사기 로그 실패가 실거래를 깨선 안 되므로, 서버 존재를 먼저
 * 확인해 없으면 guildId 를 null 로 낮춘 뒤 기록한다(best-effort 귀속).
 */
export async function recordMarketTrade(
  tx: Tx,
  input: MarketTradeLogInput,
  options?: RecordMarketTradeOptions
): Promise<void> {
  const safeGuildId = options?.knownGuildIds
    ? resolveGuildFkFromSet(input.guildId, options.knownGuildIds)
    : await resolveGuildFk(tx, input.guildId)
  await tx.tradeLog.create({
    data: {
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      guildId: safeGuildId,
      kind: 'MARKET_SELL',
      material: input.material,
      amount: input.amount,
      price: input.price
    }
  })
}

/**
 * guildId 가 실제 Guild 행을 가리킬 때만 그대로, 아니면 null 을 반환한다(FK 방어).
 *
 * 주의: check-then-insert 사이에 Guild 행이 하드 삭제되면 여전히 FK 위반(P2003,
 * 비재시도 에러) 가능. 현재 서버 퇴장은 소프트 삭제(`Guild.leftAt`)뿐이라 실해가
 * 없지만, GDPR 퍼지 등 하드 삭제 경로가 생기면 이 가드를 재검토할 것.
 */
async function resolveGuildFk(
  tx: Tx,
  guildId: string | null
): Promise<string | null> {
  if (!guildId) return null
  const guild = await tx.guild.findUnique({
    where: { id: guildId },
    select: { id: true }
  })
  return guild ? guildId : null
}

/** 배치 조회된 실존 집합 기준 FK 방어 — `resolveGuildFk` 의 무쿼리 버전. */
function resolveGuildFkFromSet(
  guildId: string | null,
  knownGuildIds: ReadonlySet<string>
): string | null {
  return guildId && knownGuildIds.has(guildId) ? guildId : null
}

/**
 * 후보 guildId 들 중 실제 Guild 행이 존재하는 id 집합을 한 번의 쿼리로 반환한다.
 *
 * `expireStale` 처럼 한 트랜잭션에서 여러 건을 기록하는 루프가 건별
 * `guild.findUnique` 를 반복(N+1)하지 않도록 사전 배치 조회한다 — Serializable
 * 트랜잭션 타임아웃(10s) 안에서 대량 백로그 처리 여유를 확보하기 위함.
 */
export async function resolveExistingGuildIds(
  tx: Tx,
  guildIds: ReadonlyArray<string | null>
): Promise<ReadonlySet<string>> {
  const candidates = [
    ...new Set(guildIds.filter((id): id is string => id !== null))
  ]
  if (candidates.length === 0) return new Set()
  const rows = await tx.guild.findMany({
    where: { id: { in: candidates } },
    select: { id: true }
  })
  return new Set(rows.map((r) => r.id))
}

/** `grantMarketSellReward` 입력. */
export interface MarketSellRewardInput {
  /** 판매자 id. */
  readonly sellerId: string
  /** 구매자 id — 반복 상대 감쇠 판정 대상. */
  readonly buyerId: string
  /** 세후 지급 대금. */
  readonly netRevenue: bigint
  /** 판정 기준 시각(감쇠 윈도 계산용). */
  readonly at: Date
}

/** `grantMarketSellReward` 결과 — `GrantResult` 에 감쇠 관측값을 덧붙인다. */
export interface MarketSellRewardResult extends GrantResult {
  /** 감쇠 전 기본 판매 XP(MARKET_SELL = 20). */
  readonly baseXp: bigint
  /** 실제 지급된(감쇠 후) 판매 XP. */
  readonly awardedXp: bigint
  /** 윈도 내 동일 상대 기존 실판매 수(현재 건 제외). */
  readonly recentCounterpartySales: number
  /** 적용된 XP 승수(1만분율). */
  readonly multiplierPpm: number
}

/**
 * 판매자에게 세후 대금(MONEY)과 반복 상대 감쇠를 적용한 판매 XP 를 지급한다.
 *
 * 1. 최근 24h 동일 (판매자→구매자) MARKET_SELL 실판매 수를 센다. toUserId 로 필터되어
 *    취소/만료(toUserId=null) 회수 기록은 카운트에 잡히지 않는다.
 * 2. ordinal = 기존 수 + 1 로 승수(1만분율)를 정해 기본 XP(20)에 곱한다(정수 산술).
 * 3. `RewardService.grant` 로 MONEY+XP 를 한 번에 지급 — 레벨업을 일관 처리한다.
 *    감쇠로 XP=0 이면 grant 가 XP 항목을 건너뛰고 MONEY 만 지급한다.
 *
 * 근거: docs/design/09-level-xp.md §이벤트별 XP(MARKET_SELL +20)·§사기 방지.
 */
export async function grantMarketSellReward(
  tx: Tx,
  input: MarketSellRewardInput
): Promise<MarketSellRewardResult> {
  const windowStart = new Date(input.at.getTime() - MARKET_XP_DECAY_WINDOW_MS)
  const recentCounterpartySales = await tx.tradeLog.count({
    where: {
      fromUserId: input.sellerId,
      toUserId: input.buyerId,
      kind: 'MARKET_SELL',
      createdAt: { gte: windowStart }
    }
  })

  const ordinal = recentCounterpartySales + 1
  const multiplierPpm = marketSellXpMultiplierPpm(ordinal)
  const baseXp = xpForEvent({ kind: 'MARKET_SELL' })
  const awardedXp = applyPpm(baseXp, multiplierPpm)

  const grant = await RewardService.grant(tx, input.sellerId, [
    { kind: 'MONEY', amount: input.netRevenue },
    { kind: 'XP', amount: awardedXp }
  ])

  return {
    ...grant,
    baseXp,
    awardedXp,
    recentCounterpartySales,
    multiplierPpm
  }
}

/** 액터(구매자) 신뢰 시그널 입력 — 핸들러가 discord.js 값에서 추출해 전달한다. */
export interface MarketActorInput {
  /** 구매자 Discord 계정 생성 시각(snowflake 파생). */
  readonly accountCreatedAt: Date
  /** 구매자 서버 가입 시각. 멤버 캐시 미스 시 null. */
  readonly guildJoinedAt: Date | null
}

/** `assessActorTrust` 입력 — `MarketActorInput` + 판정 기준 시각. */
export interface ActorTrustInput extends MarketActorInput {
  /** 판정 기준 시각. */
  readonly at: Date
}

/** 액터 신뢰 시그널(v0 로깅용). */
export interface ActorTrustSignal {
  /** 계정 나이(일, floor). */
  readonly accountAgeDays: number
  /** 서버 멤버 나이(일, floor). 가입 시각 미상이면 null. */
  readonly guildMemberAgeDays: number | null
  /** 신규 계정 여부(7일 미만). */
  readonly isNewAccount: boolean
  /** 신규 서버 멤버 여부(1일 미만). */
  readonly isNewGuildMember: boolean
}

/**
 * 구매자의 계정/서버 신뢰 시그널을 평가한다(순수 함수, v0 로깅용).
 *
 * IP 취득 불가 확정에 따른 대체 시그널 — 신규 계정·신규 서버 멤버는 부계정/사기
 * 개연이 높다. v0 는 차단하지 않고 시그널만 계산해 상위(핸들러)가 구조화 로깅한다.
 *
 * 근거: docs/design/09-level-xp.md §사기 방지("동일 IP/부계정") 대체 시그널,
 *      docs/design/10-open-questions.md "사기 방지 규칙 세부 수치" v0.
 */
export function assessActorTrust(input: ActorTrustInput): ActorTrustSignal {
  const accountAgeDays = diffDaysFloor(input.at, input.accountCreatedAt)
  const guildMemberAgeDays = input.guildJoinedAt
    ? diffDaysFloor(input.at, input.guildJoinedAt)
    : null
  return {
    accountAgeDays,
    guildMemberAgeDays,
    isNewAccount: accountAgeDays < NEW_ACCOUNT_MAX_AGE_DAYS,
    isNewGuildMember:
      guildMemberAgeDays !== null &&
      guildMemberAgeDays < NEW_GUILD_MEMBER_MAX_AGE_DAYS
  }
}

/** `from` 부터 `past` 까지 경과 일수(floor, 음수는 0). */
function diffDaysFloor(from: Date, past: Date): number {
  return Math.max(0, Math.floor((from.getTime() - past.getTime()) / DAY_MS))
}
