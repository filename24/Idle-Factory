/**
 * `/debug` — 개발/QA 전용 상태 조작 커맨드.
 *
 * 마켓·경제 플로우(등록/구매/취소/만료)는 잔액·재고·시간 상태에 의존해 손으로
 * 끝까지 재현하기 어렵다. 이 커맨드는 그 상태를 즉시 세팅/관찰할 수 있게 한다.
 *
 * 서브커맨드:
 *  - `money <amount>`                    — 내 지갑 잔액을 절대값으로 설정
 *  - `material <material> <amount>`       — 내 창고에 자재 지급
 *  - `listings`                          — 내 매물 목록(id/status/qty/만료) 조회
 *  - `expire [listing_id]`               — 매물을 즉시 만료 처리(백데이트 후 스케줄러 로직 실행)
 *  - `run-scheduler [task]`              — 스케줄러 수동 실행(미입력 시 전체 실행)
 *  - `seed-listing <material> <qty> <price> <days>` — 디버그 판매자 명의로 매물 생성(구매 테스트용)
 *  - `set-level <level>`                 — 내 레벨을 절대값으로 설정(주식 해금 Lv.10·상장 Lv.25 게이트 우회)
 *  - `seed-stock [type] [price] [shares]` — 디버그 판매자 명의의 상장 종목 생성(IPO 4중 조건 우회, 매수 테스트용)
 *  - `set-weekly-profit <stock> <amount>` — 종목 주간수익을 절대값으로 설정(배당 정산 테스트용)
 *  - `set-stock-price <stock> <price>`    — 종목 현재가를 설정하고 tick 1건 삽입(서킷브레이커 테스트용)
 *  - `seed-stock-ticks <stock> [count] [base]` — 백데이트 시간별 tick 이력 주입(info 스파크라인 테스트용)
 *
 * 게이팅(이중 방어):
 *  1. `preconditions: ['OwnerOnly']` — owner 만 실행 (`OwnerOnly.ts`).
 *  2. `config.devGuildID` 설정 시 개발 길드에만 등록 — 다른 서버엔 노출 안 됨.
 *
 * 잔액/재고를 임의 조작하므로 프로덕션 노출 금지. 모든 응답은 ephemeral Components v2.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { MaterialType, FactoryType } from '@idle/game-core'
import { FACTORY_CATALOG } from '@idle/game-core'
import type { PrismaClient } from '@idle/database'
import { MessageFlags } from 'discord.js'
import {
  simpleContainer,
  simpleV2Payload,
  v2EditPayload,
  V2_ACCENT
} from '@utils/ComponentsV2'
import {
  localizeMaterial,
  localizeFactoryType,
  materialChoiceLocalizations,
  factoryTypeChoiceLocalizations
} from '../../utils/enumLocale'
import { MATERIAL_CHOICES } from '../game/market'
import { MarketService, taxRateForDuration } from '../../services/market'
import { RewardService } from '../../services/reward'
import { UserService } from '../../services/user'
import { runInTx } from '../../services/base'
import { runWeeklySettlement } from '../../scheduled-tasks/weekly-settlement'
import { runDailyGlobal } from '../../scheduled-tasks/daily-global'
import { runMonthlyRedistribution } from '../../scheduled-tasks/monthly-redistribution'
import config from '../../config'

/**
 * `runSchedulerTask`·autocomplete 가 조회하는 scheduled-tasks 스토어의 최소 인터페이스.
 *
 * 실제로는 `container.stores.get('scheduled-tasks')`(ScheduledTaskStore) 를
 * 넘긴다. 이름 조회(has/get)와 키 열거(keys)만 쓰므로 얇은 구조적 타입으로
 * 노출해 단위 테스트에서 가짜 스토어를 주입할 수 있게 한다.
 */
export interface SchedulerStore {
  has(name: string): boolean
  get(name: string): { run(payload?: unknown): unknown } | undefined
  keys(): Iterable<string>
}

/**
 * 상세 요약을 제공하는 **알려진** 스케줄러 실행기.
 *
 * 각 run* 델리게이트를 호출해 실행 결과 수치를 사람이 읽을 요약으로 만든다.
 * 여기에 없는(새로 추가된) 스케줄러는 피스의 `run()` 을 직접 호출하고 일반
 * 요약으로 폴백하므로, 새 스케줄러도 debug 코드 수정 없이 자동 실행된다.
 */
const RICH_RUNNERS: Record<string, (db: PrismaClient) => Promise<string>> = {
  'market-expire': async (db) => {
    const { expiredCount } = await MarketService.expireStale(db)
    return `만료 ${expiredCount}건`
  },
  'weekly-settlement': async (db) => {
    const settled = await runWeeklySettlement(db)
    return `정산 유저 ${settled}명`
  },
  'daily-global': async (db) => {
    const r = await runDailyGlobal(db)
    return `패널티 ${r.penalizedGuilds} · 동결 ${r.collectedGuilds}`
  },
  'monthly-redistribution': async (db) => {
    const r = await runMonthlyRedistribution(db)
    return `재분배 서버 ${r.guildShares} · 유저 ${r.userPayouts}`
  }
}

/**
 * 등록된 스케줄러 task 이름을 정렬해 반환한다(autocomplete 후보).
 *
 * scheduled-tasks 스토어의 키를 그대로 노출하므로, 새 스케줄러 피스를 추가하면
 * 재빌드만으로 debug 목록에 자동 반영된다.
 */
export function listSchedulerTaskNames(store: SchedulerStore): string[] {
  return [...store.keys()].sort()
}

/**
 * `run-scheduler` 서브커맨드의 스토어 기반 실행 헬퍼.
 *
 * 하드코딩 목록 대신 런타임 스토어를 조회한다 — 스토어에 없는 task 는
 * `null`(알 수 없음). 알려진 task 는 `RICH_RUNNERS` 로 상세 요약을, 그 외
 * 등록된 task 는 피스의 `run()` 을 직접 호출한 뒤 일반 요약으로 실행한다.
 * 알림 등 부가 효과는 각 run*·피스 내부에서 발생한다.
 *
 * @param task 실행할 스케줄러 식별자.
 * @param db 대상 PrismaClient.
 * @param store scheduled-tasks 스토어(`container.stores.get('scheduled-tasks')`).
 * @returns 실행한 task 와 결과 요약. 스토어에 없으면 null.
 */
export async function runSchedulerTask(
  task: string,
  db: PrismaClient,
  store: SchedulerStore
): Promise<{ task: string; summary: string } | null> {
  if (!store.has(task)) return null

  const rich = RICH_RUNNERS[task]
  if (rich) return { task, summary: await rich(db) }

  // 상세 요약이 없는(새) 스케줄러 — 피스의 run() 을 직접 호출.
  await store.get(task)?.run(undefined)
  return { task, summary: '실행 완료' }
}

/**
 * 등록된 모든 스케줄러를 순차 실행하고 각 결과 요약을 모은다.
 *
 * `/debug run-scheduler` 를 task 옵션 없이 실행하면 사용한다(전체 QA용). 개별
 * task 의 실패는 나머지를 막지 않고 실패 요약으로 기록한 뒤 계속한다(부분 실행
 * 허용). 알림 등 부가 효과는 각 run*·피스 내부에서 발생한다.
 *
 * @param db 대상 PrismaClient.
 * @param store scheduled-tasks 스토어.
 * @returns task 별 결과 요약 목록(스토어 키 정렬 순).
 */
export async function runAllSchedulerTasks(
  db: PrismaClient,
  store: SchedulerStore
): Promise<Array<{ task: string; summary: string }>> {
  const results: Array<{ task: string; summary: string }> = []
  for (const name of listSchedulerTaskNames(store)) {
    try {
      const result = await runSchedulerTask(name, db, store)
      if (result) results.push(result)
    } catch (err) {
      results.push({
        task: name,
        summary: `⚠️ 실패: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }
  return results
}

/** 디버그 판매자(seed-listing)로 쓰는 고정 유저 id — 실제 Discord 계정 아님. */
const DEBUG_SELLER_ID = '000000000000000001'

/** ListingStatus → 표시용 이모지. */
const STATUS_EMOJI: Record<string, string> = {
  ACTIVE: '🟢',
  SOLD: '💰',
  CANCELLED: '↩️',
  EXPIRED: '⌛'
}

/** `set-level` 허용 상한 — QA 편의상 넉넉히 잡되 무한대는 막는다. */
const MAX_DEBUG_LEVEL = 100

/** `seed-stock` 기본 IPO/현재가. */
const SEED_STOCK_DEFAULT_PRICE = 100n

/** `seed-stock` 기본 발행 주수 (Stock.sharesOutstanding 기본값과 동일). */
const SEED_STOCK_DEFAULT_SHARES = 100

/** `seed-stock-ticks` 기본 tick 수 — `/stock info` 스파크라인 윈도(최근 24시간). */
const SEED_TICKS_DEFAULT_COUNT = 24

/** `seed-stock-ticks` tick 간격 — 실제 주가 tick 주기(1시간)와 동일. */
const TICK_INTERVAL_MS = 60 * 60 * 1000

/**
 * 전체 factory 종류 목록 (seed-stock `type` choice 용).
 *
 * `FACTORY_CATALOG` 키를 그대로 노출하므로 신규 공장 종류가 추가돼도
 * 재빌드만으로 seed-stock choice 에 자동 반영된다.
 */
const FACTORY_TYPE_VALUES = Object.keys(FACTORY_CATALOG) as FactoryType[]

export class DebugCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, preconditions: ['OwnerOnly'] })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    switch (sub) {
      case 'money':
        return this.setMoney(interaction)
      case 'material':
        return this.giveMaterial(interaction)
      case 'listings':
        return this.showListings(interaction)
      case 'expire':
        return this.expireNow(interaction)
      case 'run-scheduler':
        return this.runScheduler(interaction)
      case 'seed-listing':
        return this.seedListing(interaction)
      case 'set-level':
        return this.setLevel(interaction)
      case 'seed-stock':
        return this.seedStock(interaction)
      case 'set-weekly-profit':
        return this.setWeeklyProfit(interaction)
      case 'set-stock-price':
        return this.setStockPrice(interaction)
      case 'seed-stock-ticks':
        return this.seedStockTicks(interaction)
      default:
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: `알 수 없는 서브커맨드: \`${sub}\``,
            ephemeral: true
          })
        )
    }
  }

  /** 내 지갑 잔액을 절대값으로 설정한다. */
  private async setMoney(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const amount = BigInt(interaction.options.getInteger('amount', true))
    const userId = interaction.user.id

    await UserService.ensure(db, { discordId: userId })
    await db.user.update({ where: { id: userId }, data: { money: amount } })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '💰 잔액 설정',
        body: `지갑 잔액을 **${amount.toString()}원**으로 설정했어요.`,
        ephemeral: true
      })
    )
  }

  /** 내 창고에 자재를 지급한다. */
  private async giveMaterial(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const material = interaction.options.getString(
      'material',
      true
    ) as MaterialType
    const amount = BigInt(interaction.options.getInteger('amount', true))
    const userId = interaction.user.id

    // grant 는 창고 존재를 전제하므로 ensure 로 유저/창고를 먼저 시드한다.
    await UserService.ensure(db, { discordId: userId })
    await runInTx(db, (tx) =>
      RewardService.grant(tx, userId, [{ kind: 'MATERIAL', material, amount }])
    )

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '📦 자재 지급',
        body: `**${localizeMaterial(t, material)}** ×${amount.toString()} 지급 완료.`,
        ephemeral: true
      })
    )
  }

  /** 내 매물 목록을 조회한다(모든 상태). */
  private async showListings(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const listings = await db.marketListing.findMany({
      where: { sellerId: interaction.user.id },
      orderBy: { registeredAt: 'desc' },
      take: 15
    })

    if (listings.length === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.info,
          body: '등록한 매물이 없어요.',
          ephemeral: true
        })
      )
    }

    const lines = listings.map((l) => {
      const emoji = STATUS_EMOJI[l.status] ?? '❔'
      const mat = localizeMaterial(t, l.material as MaterialType)
      return `${emoji} \`${l.id}\` · ${mat} ×${l.qty} · ${l.price.toString()}원 · 만료 <t:${Math.floor(l.expiresAt.getTime() / 1000)}:R>`
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        title: '🗂️ 내 매물',
        body: lines.join('\n'),
        footer: `${listings.length}건 (최근순, 최대 15)`,
        ephemeral: true
      })
    )
  }

  /** 매물을 즉시 만료 처리한다: expiresAt 백데이트 → expireStale 실행. */
  private async expireNow(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const listingId = interaction.options.getString('listing_id')
    const past = new Date(Date.now() - 1000)

    const where = listingId
      ? { id: listingId, status: 'ACTIVE' as const }
      : { sellerId: interaction.user.id, status: 'ACTIVE' as const }

    const backdated = await db.marketListing.updateMany({
      where,
      data: { expiresAt: past }
    })

    if (backdated.count === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          body: listingId
            ? `\`${listingId}\` 는 ACTIVE 매물이 아니거나 존재하지 않아요.`
            : '만료시킬 내 ACTIVE 매물이 없어요.',
          ephemeral: true
        })
      )
    }

    const { expiredCount } = await MarketService.expireStale(db)

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '⌛ 매물 만료',
        body: `백데이트 **${backdated.count}건** → 만료 처리 **${expiredCount}건** (재고 반환 완료).`,
        ephemeral: true
      })
    )
  }

  /** 선택한 스케줄러 로직을 수동 실행하고 결과 요약을 응답한다. */
  private async runScheduler(interaction: Command.ChatInputCommandInteraction) {
    const store = this.container.stores.get(
      'scheduled-tasks'
    ) as unknown as SchedulerStore
    const task = interaction.options.getString('task')

    // 정산·재분배까지 돌리면 3초를 넘길 수 있으므로 먼저 defer(ephemeral).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    // task 미지정 → 등록된 모든 스케줄러 순차 실행.
    if (!task) {
      const results = await runAllSchedulerTasks(this.container.db, store)
      const body = results.length
        ? results.map((r) => `\`${r.task}\` — ${r.summary}`).join('\n')
        : '실행할 스케줄러가 없어요.'
      return interaction.editReply(
        v2EditPayload([
          simpleContainer(V2_ACCENT.success, '🔄 전체 스케줄러 실행', body)
        ])
      )
    }

    const result = await runSchedulerTask(task, this.container.db, store)
    if (!result) {
      return interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            `알 수 없는 스케줄러: \`${task}\``
          )
        ])
      )
    }

    return interaction.editReply(
      v2EditPayload([
        simpleContainer(
          V2_ACCENT.success,
          '🔄 스케줄러 실행',
          `\`${result.task}\` 실행 완료 — ${result.summary}.`
        )
      ])
    )
  }

  /** 디버그 판매자 명의로 매물을 생성한다(자기 매물 아님 → 구매 테스트 가능). */
  private async seedListing(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const material = interaction.options.getString(
      'material',
      true
    ) as MaterialType
    const qty = interaction.options.getInteger('qty', true)
    const price = BigInt(interaction.options.getInteger('price', true))
    const days = interaction.options.getInteger('days', true)

    // 판매자 유저(User+Land+Warehouse)를 멱등 시드한 뒤 매물을 직접 생성한다.
    await UserService.ensure(db, {
      discordId: DEBUG_SELLER_ID,
      nickname: 'DEBUG_SELLER'
    })
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const listing = await db.marketListing.create({
      data: {
        sellerId: DEBUG_SELLER_ID,
        material,
        price,
        qty,
        durationDays: days,
        taxRate: taxRateForDuration(days),
        expiresAt
      }
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '🌱 매물 시드',
        body: [
          `**${localizeMaterial(t, material)}** ×${qty} · 개당 **${price.toString()}원** · ${days}일`,
          `판매자: \`DEBUG_SELLER\` (본인 아님 → 구매 가능)`,
          `매물 id: \`${listing.id}\``
        ].join('\n'),
        footer: '`/market buy` 로 이 id 를 구매해 보세요.',
        ephemeral: true
      })
    )
  }

  /**
   * 내 레벨을 절대값으로 설정한다 (`User.level` = level, `User.xp` = 0 리셋).
   *
   * `User.xp` 는 "레벨 내 XP"(reward.ts §applyXp 규약)이므로 레벨 세팅 시 0 으로
   * 리셋해 다음 레벨 진행도를 깨끗하게 둔다. 주식 트레이딩(Lv.10)·상장(Lv.25)
   * 등 레벨 게이트를 즉시 넘기기 위한 QA 도구.
   */
  private async setLevel(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const level = interaction.options.getInteger('level', true)
    const userId = interaction.user.id

    await UserService.ensure(db, { discordId: userId })
    await db.user.update({
      where: { id: userId },
      data: { level, xp: 0n }
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '📈 레벨 설정',
        body: `내 레벨을 **Lv.${level}** 로 설정했어요 (레벨 내 XP 0 리셋).`,
        ephemeral: true
      })
    )
  }

  /**
   * 디버그 판매자 명의의 상장 종목을 생성한다.
   *
   * IPO 4중 조건(Lv.25·공장 5개·최근 30일 거래 10회·희망가 밴드)을 우회해
   * `Factory` + `Stock` + 초기 `StockPriceTick` 을 직접 시드한다. 종목 소유주가
   * DEBUG_SELLER 라 **본인이 아니므로** 곧바로 `/stock buy` 로 매수 테스트가
   * 가능하다(자기거래 차단 회피). 배치·슬롯 검증은 건너뛰므로 anchor 는 0,0 고정.
   */
  private async seedStock(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const type = (interaction.options.getString('type') ??
      'FARM') as FactoryType
    const price = BigInt(
      interaction.options.getInteger('price') ??
        Number(SEED_STOCK_DEFAULT_PRICE)
    )
    const shares =
      interaction.options.getInteger('shares') ?? SEED_STOCK_DEFAULT_SHARES

    // 판매자 유저(User+Land+Warehouse)를 멱등 시드하고 그 토지를 공장 부지로 쓴다.
    await UserService.ensure(db, {
      discordId: DEBUG_SELLER_ID,
      nickname: 'DEBUG_SELLER'
    })
    const land = await db.land.findFirst({
      where: { userId: DEBUG_SELLER_ID },
      orderBy: { index: 'asc' },
      select: { id: true }
    })
    if (!land) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: 'DEBUG_SELLER 토지 시드에 실패했어요.',
          ephemeral: true
        })
      )
    }

    // Stock.guildId 는 Guild FK — 미시드/탈퇴 서버면 null 로 낮춘다
    // (StockService.ipo 와 동일한 best-effort 귀속). guildId=null 종목도
    // `/stock` autocomplete 에 노출되므로 매수 테스트엔 지장 없다.
    const guildId = interaction.guildId
    const guild = guildId
      ? await db.guild.findUnique({
          where: { id: guildId },
          select: { id: true }
        })
      : null

    const entry = FACTORY_CATALOG[type]
    const stock = await runInTx(db, async (tx) => {
      const factory = await tx.factory.create({
        data: {
          userId: DEBUG_SELLER_ID,
          landId: land.id,
          guildId: guild?.id ?? null,
          type,
          tier: entry.tier,
          anchorX: 0,
          anchorY: 0,
          width: entry.size.width,
          height: entry.size.height
        }
      })
      const created = await tx.stock.create({
        data: {
          factoryId: factory.id,
          market: 'SERVER',
          guildId: guild?.id ?? null,
          ipoPrice: price,
          currentPrice: price,
          sharesOutstanding: shares
        }
      })
      await tx.stockPriceTick.create({
        data: { stockId: created.id, price }
      })
      return created
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '🌱 종목 시드',
        body: [
          `**${localizeFactoryType(t, type)}** · 현재가 **${price.toString()}원** · 발행 **${shares}주**`,
          `소유주: \`DEBUG_SELLER\` (본인 아님 → 매수 가능)`,
          `종목 id: \`${stock.id}\``
        ].join('\n'),
        footer: '`/stock buy` 로 이 종목을 매수해 보세요.',
        ephemeral: true
      })
    )
  }

  /**
   * 종목의 주간수익(`Stock.weeklyProfit`)을 절대값으로 설정한다.
   *
   * 배당 재원 = 주간수익 × 배당률(기본 10%)이라, 이 값이 0 이면 배당 정산을
   * 돌려도 지급액이 0 이다. 배당 지급/분배 로직을 검증하려면 먼저 이 값을 채운다.
   */
  private async setWeeklyProfit(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const stockId = interaction.options.getString('stock', true)
    const amount = BigInt(interaction.options.getInteger('amount', true))

    const updated = await db.stock.updateMany({
      where: { id: stockId },
      data: { weeklyProfit: amount }
    })
    if (updated.count === 0)
      return this.replyStockNotFound(interaction, stockId)

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '💵 주간수익 설정',
        body: `\`${stockId}\` 의 주간수익을 **${amount.toString()}원**으로 설정했어요.`,
        footer:
          '`/debug run-scheduler stock-dividend` 로 배당을 정산해 보세요.',
        ephemeral: true
      })
    )
  }

  /**
   * 종목 현재가를 설정하고 그 가격으로 `StockPriceTick` 1건을 삽입한다.
   *
   * 서킷브레이커(당일 첫 tick 대비 ±30% clamp)를 관찰하려면 기준가를 세팅한 뒤
   * price tick 을 돌려 clamp 를 확인할 수 있다. `Stock.lastTickAt` 도 now 로 갱신.
   */
  private async setStockPrice(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const stockId = interaction.options.getString('stock', true)
    const price = BigInt(interaction.options.getInteger('price', true))

    const exists = await db.stock.findUnique({
      where: { id: stockId },
      select: { id: true }
    })
    if (!exists) return this.replyStockNotFound(interaction, stockId)

    await runInTx(db, async (tx) => {
      await tx.stock.update({
        where: { id: stockId },
        data: { currentPrice: price, lastTickAt: new Date() }
      })
      await tx.stockPriceTick.create({ data: { stockId, price } })
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '🎯 현재가 설정',
        body: `\`${stockId}\` 의 현재가를 **${price.toString()}원**으로 설정하고 tick 1건을 남겼어요.`,
        ephemeral: true
      })
    )
  }

  /**
   * 백데이트된 시간별 `StockPriceTick` 이력을 주입한다.
   *
   * 갓 상장한 종목은 tick 이 1건뿐이라 `/stock info` 스파크라인이 밋밋하다.
   * `base` 를 중심으로 완만하게 진동하는 `count` 개의 tick 을 now 에서 과거로
   * 1시간 간격 백데이트해 삽입하고, 마지막(최신) tick 가격을 현재가로 맞춘다.
   */
  private async seedStockTicks(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const stockId = interaction.options.getString('stock', true)
    const count =
      interaction.options.getInteger('count') ?? SEED_TICKS_DEFAULT_COUNT

    const stock = await db.stock.findUnique({
      where: { id: stockId },
      select: { currentPrice: true }
    })
    if (!stock) return this.replyStockNotFound(interaction, stockId)

    const base = BigInt(
      interaction.options.getInteger('base') ?? Number(stock.currentPrice)
    )
    const now = Date.now()
    // now 에서 과거로 1시간 간격. i=0 이 가장 오래된 tick, i=count-1 이 최신.
    const rows = Array.from({ length: count }, (_, i) => {
      // base 를 중심으로 ±10% 완만한 sine 진동 — 스파크라인이 보이게.
      const factor = 1 + 0.1 * Math.sin(i)
      const price = BigInt(Math.max(1, Math.round(Number(base) * factor)))
      const tickAt = new Date(now - (count - 1 - i) * TICK_INTERVAL_MS)
      return { stockId, price, tickAt }
    })
    const lastPrice = rows[rows.length - 1].price

    await runInTx(db, async (tx) => {
      await tx.stockPriceTick.createMany({ data: rows })
      await tx.stock.update({
        where: { id: stockId },
        data: {
          currentPrice: lastPrice,
          lastTickAt: rows[rows.length - 1].tickAt
        }
      })
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '📊 tick 이력 시드',
        body: [
          `\`${stockId}\` 에 시간별 tick **${count}건** 삽입 (기준가 ${base.toString()}원).`,
          `현재가는 최신 tick **${lastPrice.toString()}원**으로 맞췄어요.`
        ].join('\n'),
        footer: '`/stock info` 로 스파크라인을 확인해 보세요.',
        ephemeral: true
      })
    )
  }

  /** 종목 id 미존재 시 공통 경고 응답. */
  private replyStockNotFound(
    interaction: Command.ChatInputCommandInteraction,
    stockId: string
  ) {
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.warn,
        body: `\`${stockId}\` 종목을 찾을 수 없어요.`,
        ephemeral: true
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    const materialChoices = MATERIAL_CHOICES.map((m) => ({
      name: m,
      name_localizations: materialChoiceLocalizations(m),
      value: m
    }))
    const factoryChoices = FACTORY_TYPE_VALUES.map((f) => ({
      name: f,
      name_localizations: factoryTypeChoiceLocalizations(f),
      value: f
    }))

    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName('debug')
          .setDescription('[DEV] Game state debug tools (owner only).')
          .setNameLocalization('ko', '디버그')
          .setDescriptionLocalization(
            'ko',
            '[개발] 게임 상태 디버그 도구 (관리자 전용).'
          )
          .addSubcommand((sub) =>
            sub
              .setName('money')
              .setDescription('Set your wallet balance.')
              .setDescriptionLocalization('ko', '지갑 잔액을 설정합니다.')
              .addIntegerOption((opt) =>
                opt
                  .setName('amount')
                  .setDescription('Target balance')
                  .setDescriptionLocalization('ko', '설정할 잔액')
                  .setMinValue(0)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('material')
              .setDescription('Grant materials to your warehouse.')
              .setDescriptionLocalization('ko', '창고에 자재를 지급합니다.')
              .addStringOption((opt) =>
                opt
                  .setName('material')
                  .setDescription('Material type')
                  .setDescriptionLocalization('ko', '자재 종류')
                  .setRequired(true)
                  .addChoices(...materialChoices)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('amount')
                  .setDescription('Amount to grant')
                  .setDescriptionLocalization('ko', '지급 수량')
                  .setMinValue(1)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('listings')
              .setDescription('List your market listings.')
              .setDescriptionLocalization('ko', '내 매물 목록을 조회합니다.')
          )
          .addSubcommand((sub) =>
            sub
              .setName('expire')
              .setDescription('Force-expire listings now.')
              .setDescriptionLocalization('ko', '매물을 즉시 만료 처리합니다.')
              .addStringOption((opt) =>
                opt
                  .setName('listing_id')
                  .setDescription(
                    'Specific listing id (default: all my active)'
                  )
                  .setDescriptionLocalization(
                    'ko',
                    '특정 매물 id (기본: 내 활성 매물 전체)'
                  )
                  .setRequired(false)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('run-scheduler')
              .setDescription('Run a scheduler task now.')
              .setDescriptionLocalization('ko', '스케줄러를 수동 실행합니다.')
              .addStringOption((opt) =>
                opt
                  .setName('task')
                  .setDescription('Scheduler task (blank: run all)')
                  .setDescriptionLocalization(
                    'ko',
                    '실행할 스케줄러 (미입력 시 전체 실행)'
                  )
                  .setRequired(false)
                  .setAutocomplete(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('seed-listing')
              .setDescription('Create a listing owned by a debug seller.')
              .setDescriptionLocalization(
                'ko',
                '디버그 판매자 명의로 매물을 생성합니다.'
              )
              .addStringOption((opt) =>
                opt
                  .setName('material')
                  .setDescription('Material type')
                  .setDescriptionLocalization('ko', '자재 종류')
                  .setRequired(true)
                  .addChoices(...materialChoices)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('qty')
                  .setDescription('Quantity')
                  .setDescriptionLocalization('ko', '수량')
                  .setMinValue(1)
                  .setRequired(true)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('price')
                  .setDescription('Price per unit')
                  .setDescriptionLocalization('ko', '개당 가격')
                  .setMinValue(1)
                  .setRequired(true)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('days')
                  .setDescription('Duration days (1-30)')
                  .setDescriptionLocalization('ko', '등록 기간 (1~30일)')
                  .setMinValue(1)
                  .setMaxValue(30)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('set-level')
              .setDescription('Set your level (bypass level gates).')
              .setDescriptionLocalization(
                'ko',
                '내 레벨을 설정합니다 (레벨 게이트 우회).'
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('level')
                  .setDescription('Target level')
                  .setDescriptionLocalization('ko', '설정할 레벨')
                  .setMinValue(1)
                  .setMaxValue(MAX_DEBUG_LEVEL)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('seed-stock')
              .setDescription('Create a listed stock owned by a debug seller.')
              .setDescriptionLocalization(
                'ko',
                '디버그 판매자 명의로 상장 종목을 생성합니다.'
              )
              .addStringOption((opt) =>
                opt
                  .setName('type')
                  .setDescription('Factory type (default: FARM)')
                  .setDescriptionLocalization('ko', '공장 종류 (기본: FARM)')
                  .setRequired(false)
                  .addChoices(...factoryChoices)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('price')
                  .setDescription('IPO / current price (default: 100)')
                  .setDescriptionLocalization('ko', 'IPO·현재가 (기본: 100)')
                  .setMinValue(1)
                  .setRequired(false)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('shares')
                  .setDescription('Shares outstanding (default: 100)')
                  .setDescriptionLocalization('ko', '발행 주수 (기본: 100)')
                  .setMinValue(1)
                  .setRequired(false)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('set-weekly-profit')
              .setDescription("Set a stock's weekly profit (for dividends).")
              .setDescriptionLocalization(
                'ko',
                '종목 주간수익을 설정합니다 (배당 테스트용).'
              )
              .addStringOption((opt) =>
                opt
                  .setName('stock')
                  .setDescription('Stock')
                  .setDescriptionLocalization('ko', '종목')
                  .setRequired(true)
                  .setAutocomplete(true)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('amount')
                  .setDescription('Weekly profit')
                  .setDescriptionLocalization('ko', '주간수익')
                  .setMinValue(0)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('set-stock-price')
              .setDescription("Set a stock's current price + insert a tick.")
              .setDescriptionLocalization(
                'ko',
                '종목 현재가를 설정하고 tick 을 남깁니다.'
              )
              .addStringOption((opt) =>
                opt
                  .setName('stock')
                  .setDescription('Stock')
                  .setDescriptionLocalization('ko', '종목')
                  .setRequired(true)
                  .setAutocomplete(true)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('price')
                  .setDescription('Target price')
                  .setDescriptionLocalization('ko', '설정할 가격')
                  .setMinValue(1)
                  .setRequired(true)
              )
          )
          .addSubcommand((sub) =>
            sub
              .setName('seed-stock-ticks')
              .setDescription('Seed backdated hourly price ticks (sparkline).')
              .setDescriptionLocalization(
                'ko',
                '백데이트 시간별 tick 이력을 주입합니다 (스파크라인).'
              )
              .addStringOption((opt) =>
                opt
                  .setName('stock')
                  .setDescription('Stock')
                  .setDescriptionLocalization('ko', '종목')
                  .setRequired(true)
                  .setAutocomplete(true)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('count')
                  .setDescription('Number of ticks (default: 24)')
                  .setDescriptionLocalization('ko', 'tick 수 (기본: 24)')
                  .setMinValue(1)
                  .setMaxValue(168)
                  .setRequired(false)
              )
              .addIntegerOption((opt) =>
                opt
                  .setName('base')
                  .setDescription('Base price (default: current price)')
                  .setDescriptionLocalization('ko', '기준가 (기본: 현재가)')
                  .setMinValue(1)
                  .setRequired(false)
              )
          ),
      config.devGuildID ? { guildIds: [config.devGuildID] } : undefined
    )
  }
}
