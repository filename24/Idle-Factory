/**
 * 운영 툴 서비스 (#21 결정 6).
 *
 * `/admin` 커맨드가 쓰는 상태 조작·조회 로직. 다루는 값이 유저 자산에 직결되고
 * 되돌릴 수 없으므로 모든 변경은 예외 없이 `AdminAuditLog` 에 기록한다.
 * 기록은 DB 가 진실원이고, 디스코드 감사 웹후크는 가시성 보조 수단이다 —
 * 웹후크 전송 실패가 조작 자체를 되돌리지는 않는다(로그만 남기고 성공 처리).
 *
 * 신뢰도 조작은 `@idle/game-core` 의 `applyCreditDelta` / `CREDIT_MIN` /
 * `CREDIT_MAX` 를 그대로 쓴다 — 운영 툴이 도메인 규칙을 우회하면 주간 정산이
 * 계산하는 범위와 어긋난다 (docs/design/07-global-system.md §신뢰도).
 */

import { applyCreditDelta, CREDIT_MAX, CREDIT_MIN } from '@idle/game-core'
import type { MaterialType, PrismaClient } from '@idle/database'
import { ServiceError } from './base'
import { MarketService } from './market'

/** 감사 로그에 남기는 행위 종류. */
export type AdminAuditAction = 'CREDIT_SET' | 'CREDIT_ADJUST' | 'LISTING_REMOVE'

/** 이상치 판정 기준 — 글로벌 현재가 대비 허용 편차 비율. */
const OUTLIER_DEVIATION = 0.5

/** `market report` 기본 조회 건수. */
export const DEFAULT_REPORT_LIMIT = 10

/** `market report` 최대 조회 건수 — Components v2 텍스트 4,000자 한도 방어. */
export const MAX_REPORT_LIMIT = 25

/** 신뢰도 조작 결과. */
export interface CreditChangeResult {
  /** 대상 서버 snowflake. */
  readonly guildId: string
  /** 변경 전 신뢰도. */
  readonly before: number
  /** 변경 후 신뢰도 (0~2000 클램프 적용). */
  readonly after: number
}

/** 가격 이상치 매물 한 건. */
export interface MarketOutlier {
  readonly listingId: string
  readonly sellerId: string
  readonly material: MaterialType
  /** 등록 단가. */
  readonly price: bigint
  readonly qty: number
  /** 판정 시점의 글로벌 현재가. */
  readonly globalPrice: bigint
  /** 글로벌 현재가 대비 편차 비율 (+0.8 = 80% 높음). */
  readonly deviation: number
}

/** 매물 강제 회수 결과. */
export interface ListingRemoveResult {
  readonly listingId: string
  readonly sellerId: string
  readonly material: MaterialType
  /** 판매자 창고로 되돌린 수량. */
  readonly returnedQty: number
}

/** 감사 로그 입력. */
interface AuditInput {
  readonly actorId: string
  readonly action: AdminAuditAction
  readonly targetGuildId?: string | null
  readonly targetId?: string | null
  readonly beforeValue?: string | null
  readonly afterValue?: string | null
  readonly reason?: string | null
}

/**
 * 감사 웹후크 전송자.
 *
 * 실제 구현은 `AdminService.setAuditWebhook` 으로 주입한다 — 서비스 계층이
 * `fetch` 나 config 를 직접 붙들면 통합 테스트에서 외부 호출이 발생한다.
 */
export type AuditWebhookSender = (
  payload: AuditInput & { logId: string }
) => Promise<void>

let auditWebhook: AuditWebhookSender | null = null

export const AdminService = {
  /**
   * 감사 웹후크 전송자를 등록한다. `null` 이면 전송하지 않는다.
   *
   * @param sender 전송 구현 (부팅 시 1회 주입)
   */
  setAuditWebhook(sender: AuditWebhookSender | null): void {
    auditWebhook = sender
  },

  /**
   * 감사 로그를 남기고 웹후크로 알린다.
   *
   * DB 기록이 먼저다 — 웹후크는 가시성 보조 수단이라 전송 실패가 조작을
   * 되돌려서는 안 된다. 실패 처리는 전송자 구현
   * (`utils/adminAuditWebhook.ts`)이 자체적으로 흡수하고 로그만 남긴다.
   *
   * @param prisma Prisma 클라이언트
   * @param input 감사 항목
   * @returns 생성된 로그 id
   */
  async writeAudit(prisma: PrismaClient, input: AuditInput): Promise<string> {
    const row = await prisma.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetGuildId: input.targetGuildId ?? null,
        targetId: input.targetId ?? null,
        beforeValue: input.beforeValue ?? null,
        afterValue: input.afterValue ?? null,
        reason: input.reason ?? null
      },
      select: { id: true }
    })

    if (auditWebhook) {
      await auditWebhook({ ...input, logId: row.id })
    }
    return row.id
  },

  /**
   * 서버 신뢰도를 절대값으로 설정한다.
   *
   * @param prisma Prisma 클라이언트
   * @param actorId 실행한 owner snowflake
   * @param guildId 대상 서버
   * @param amount 설정할 신뢰도 (0~2000 범위를 벗어나면 거부)
   * @param reason 사유 (선택)
   * @returns 변경 전·후 신뢰도
   * @throws {ServiceError} `INVALID_CREDIT_VALUE` — 범위 밖 입력
   * @throws {ServiceError} `GUILD_NOT_FOUND` — 대상 서버 행 없음
   */
  async setCredit(
    prisma: PrismaClient,
    actorId: string,
    guildId: string,
    amount: number,
    reason?: string
  ): Promise<CreditChangeResult> {
    if (
      !Number.isInteger(amount) ||
      amount < CREDIT_MIN ||
      amount > CREDIT_MAX
    ) {
      throw new ServiceError(
        'INVALID_CREDIT_VALUE',
        `credit must be an integer in ${CREDIT_MIN}..${CREDIT_MAX}`,
        { min: CREDIT_MIN, max: CREDIT_MAX }
      )
    }

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { credit: true }
    })
    if (!guild) {
      throw new ServiceError('GUILD_NOT_FOUND', `guild ${guildId} not found`)
    }

    await prisma.guild.update({
      where: { id: guildId },
      data: { credit: amount }
    })

    await AdminService.writeAudit(prisma, {
      actorId,
      action: 'CREDIT_SET',
      targetGuildId: guildId,
      beforeValue: String(guild.credit),
      afterValue: String(amount),
      reason: reason ?? null
    })

    return { guildId, before: guild.credit, after: amount }
  },

  /**
   * 서버 신뢰도를 상대값으로 조정한다. 0~2000 클램프는 도메인 함수가 처리한다.
   *
   * 사유가 필수다 — 상대 조정은 "왜 깎았는지"가 남지 않으면 사후 검증이
   * 불가능하다 (#21 결정 6).
   *
   * @param prisma Prisma 클라이언트
   * @param actorId 실행한 owner snowflake
   * @param guildId 대상 서버
   * @param delta 증감폭 (음수 가능)
   * @param reason 사유 (필수, 공백 불가)
   * @returns 변경 전·후 신뢰도
   * @throws {ServiceError} `AUDIT_REASON_REQUIRED` — 사유 누락
   * @throws {ServiceError} `GUILD_NOT_FOUND` — 대상 서버 행 없음
   */
  async adjustCredit(
    prisma: PrismaClient,
    actorId: string,
    guildId: string,
    delta: number,
    reason: string
  ): Promise<CreditChangeResult> {
    if (!Number.isInteger(delta)) {
      throw new ServiceError('INVALID_CREDIT_VALUE', 'delta must be an integer')
    }
    if (!reason || reason.trim().length === 0) {
      throw new ServiceError(
        'AUDIT_REASON_REQUIRED',
        'reason is required for credit adjust'
      )
    }

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { credit: true }
    })
    if (!guild) {
      throw new ServiceError('GUILD_NOT_FOUND', `guild ${guildId} not found`)
    }

    const after = applyCreditDelta(guild.credit, delta)
    await prisma.guild.update({
      where: { id: guildId },
      data: { credit: after }
    })

    await AdminService.writeAudit(prisma, {
      actorId,
      action: 'CREDIT_ADJUST',
      targetGuildId: guildId,
      beforeValue: String(guild.credit),
      afterValue: String(after),
      reason: reason.trim()
    })

    return { guildId, before: guild.credit, after }
  },

  /**
   * 글로벌 현재가에서 ±50% 이상 벗어난 ACTIVE 매물을 찾는다.
   *
   * 등록 시점에는 `MarketService.list` 가 ±50% 밴드를 검증하지만, 글로벌 가격은
   * 30분마다 움직이므로 등록 후 밴드를 벗어나는 매물이 생긴다
   * (docs/design/06-market.md §유저 상점 규칙). 그 잔존 이상치를 찾는 것이
   * 이 조회의 목적이다.
   *
   * 편차 계산은 자재 종류가 13종으로 고정이라 메모리에서 처리한다 — SQL 로
   * 조인해 계산하면 BigInt 나눗셈 정밀도를 DB 방언에 맡기게 된다.
   *
   * @param prisma Prisma 클라이언트
   * @param limit 최대 반환 건수 (1..25)
   * @returns 편차 절대값이 큰 순서로 정렬된 이상치 목록
   */
  async marketOutliers(
    prisma: PrismaClient,
    limit = DEFAULT_REPORT_LIMIT
  ): Promise<MarketOutlier[]> {
    const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_REPORT_LIMIT)

    const [listings, prices] = await Promise.all([
      prisma.marketListing.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          sellerId: true,
          material: true,
          price: true,
          qty: true
        },
        orderBy: { registeredAt: 'desc' }
      }),
      prisma.globalMarketPrice.findMany({
        select: { material: true, currentPrice: true }
      })
    ])

    const priceOf = new Map(
      prices.map((row) => [row.material, row.currentPrice])
    )

    const outliers: MarketOutlier[] = []
    for (const listing of listings) {
      const globalPrice = priceOf.get(listing.material)
      // 시드 누락으로 기준가가 없으면 편차를 정의할 수 없다 — 조용히 건너뛰지
      // 않고 이상치로 올린다면 오탐이 되므로 제외한다.
      if (!globalPrice || globalPrice <= 0n) continue

      const deviation =
        Number(listing.price - globalPrice) / Number(globalPrice)
      if (Math.abs(deviation) < OUTLIER_DEVIATION) continue

      outliers.push({
        listingId: listing.id,
        sellerId: listing.sellerId,
        material: listing.material,
        price: listing.price,
        qty: listing.qty,
        globalPrice,
        deviation
      })
    }

    outliers.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
    return outliers.slice(0, capped)
  },

  /**
   * 이상 매물을 강제 회수한다 — 자재는 판매자 창고로 되돌아간다.
   *
   * 회수 자체는 `MarketService.forceRemove` 가 트랜잭션으로 처리하고, 이 함수는
   * 감사 로그를 덧붙이는 책임만 진다. 로그가 회수 성공 **후** 기록되므로,
   * 로그 기록이 실패하면 회수는 이미 반영된 상태로 남는다 — 자재를 유저에게
   * 되돌려 준 쪽이 안전한 실패 방향이라 이 순서를 택했다.
   *
   * @param prisma Prisma 클라이언트
   * @param actorId 실행한 owner snowflake
   * @param listingId 회수할 매물 id
   * @param reason 사유 (선택)
   * @param guildId 회수 TradeLog 에 남길 활동 서버
   * @returns 회수 결과
   * @throws {ServiceError} `LISTING_NOT_FOUND` · `LISTING_NOT_ACTIVE`
   */
  async removeListing(
    prisma: PrismaClient,
    actorId: string,
    listingId: string,
    reason?: string,
    guildId: string | null = null
  ): Promise<ListingRemoveResult> {
    const result = await MarketService.forceRemove(prisma, listingId, guildId)

    await AdminService.writeAudit(prisma, {
      actorId,
      action: 'LISTING_REMOVE',
      targetGuildId: guildId,
      targetId: listingId,
      beforeValue: 'ACTIVE',
      afterValue: result.listing.status,
      reason: reason ?? null
    })

    return {
      listingId,
      sellerId: result.listing.sellerId,
      material: result.listing.material,
      returnedQty: Number(result.returned.quantity)
    }
  }
}
