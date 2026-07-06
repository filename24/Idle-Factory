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
 *  - `run-scheduler`                     — 만료 스케줄러(`expireStale`) 수동 실행
 *  - `seed-listing <material> <qty> <price> <days>` — 디버그 판매자 명의로 매물 생성(구매 테스트용)
 *
 * 게이팅(이중 방어):
 *  1. `preconditions: ['OwnerOnly']` — owner 만 실행 (`OwnerOnly.ts`).
 *  2. `config.devGuildID` 설정 시 개발 길드에만 등록 — 다른 서버엔 노출 안 됨.
 *
 * 잔액/재고를 임의 조작하므로 프로덕션 노출 금지. 모든 응답은 ephemeral Components v2.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { MaterialType } from '@idle/game-core'
import type { PrismaClient } from '@idle/database'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import {
  localizeMaterial,
  materialChoiceLocalizations
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

/** `/debug run-scheduler` 로 수동 실행 가능한 스케줄러 task 식별자 목록. */
const SCHEDULER_TASKS = [
  'market-expire',
  'weekly-settlement',
  'daily-global',
  'monthly-redistribution'
] as const

/**
 * `run-scheduler` 서브커맨드의 순수 매핑/실행 헬퍼.
 *
 * task 식별자를 대응하는 스케줄러 run* / expireStale 로직으로 라우팅하고,
 * 실행 결과 수치를 사람이 읽을 요약 문자열로 정리해 돌려준다. 알림은 각 run*
 * 내부에서 부가 효과로 발생하므로 여기서는 로직 호출과 요약만 담당한다.
 *
 * @param task 실행할 스케줄러 식별자(알 수 없는 값은 'market-expire' 로 폴백).
 * @param db 대상 PrismaClient.
 * @returns 정규화된 task 식별자와 결과 요약 문자열.
 */
export async function runSchedulerTask(
  task: string,
  db: PrismaClient
): Promise<{ task: string; summary: string }> {
  switch (task) {
    case 'weekly-settlement': {
      const settled = await runWeeklySettlement(db)
      return { task, summary: `정산 유저 ${settled}명` }
    }
    case 'daily-global': {
      const r = await runDailyGlobal(db)
      return {
        task,
        summary: `패널티 ${r.penalizedGuilds} · 동결 ${r.collectedGuilds}`
      }
    }
    case 'monthly-redistribution': {
      const r = await runMonthlyRedistribution(db)
      return {
        task,
        summary: `재분배 서버 ${r.guildShares} · 유저 ${r.userPayouts}`
      }
    }
    default: {
      const { expiredCount } = await MarketService.expireStale(db)
      return { task: 'market-expire', summary: `만료 ${expiredCount}건` }
    }
  }
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
    const task = interaction.options.getString('task') ?? 'market-expire'
    const result = await runSchedulerTask(task, this.container.db)
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '🔄 스케줄러 실행',
        body: `\`${result.task}\` 실행 완료 — ${result.summary}.`,
        ephemeral: true
      })
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

  public override registerApplicationCommands(registry: Command.Registry) {
    const materialChoices = MATERIAL_CHOICES.map((m) => ({
      name: m,
      name_localizations: materialChoiceLocalizations(m),
      value: m
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
                  .setDescription('Scheduler task (default: market-expire)')
                  .setDescriptionLocalization(
                    'ko',
                    '실행할 스케줄러 (기본: 매물 만료)'
                  )
                  .setRequired(false)
                  .addChoices(
                    ...SCHEDULER_TASKS.map((task) => ({
                      name: task,
                      value: task
                    }))
                  )
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
          ),
      config.devGuildID ? { guildIds: [config.devGuildID] } : undefined
    )
  }
}
