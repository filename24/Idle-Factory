/**
 * `/admin` — 운영 전용 커맨드 (#21 결정 6).
 *
 * 서브커맨드:
 *  - `credit set <guild_id> <amount> [reason]`      — 서버 신뢰도 절대값 설정 (0~2000)
 *  - `credit adjust <guild_id> <delta> <reason>`    — 상대 조정, 사유 필수
 *  - `market report [limit]`                        — 글로벌 현재가 ±50% 밖 매물 목록
 *  - `market remove <listing_id> [reason]`          — 이상 매물 강제 회수
 *
 * `/debug` 와 분리한 이유: `/debug` 는 개발자가 자기 상태를 조작하는 도구이고,
 * 이쪽은 **다른 유저·서버의 자산에 개입**한다. 감사 로그 유무가 두 커맨드의
 * 결정적 차이이므로 파일과 이름을 나눠 실수 실행을 줄인다.
 *
 * 게이팅(이중 방어):
 *  1. `preconditions: ['OwnerOnly']` — owner 만 실행.
 *  2. `config.devGuildID` 설정 시 개발 길드에만 등록.
 *
 * 모든 응답은 ephemeral Components v2 다 (`componentsv2-builder` 규약).
 */

import { Command } from '@sapphire/framework'
import { CREDIT_MAX, CREDIT_MIN } from '@idle/game-core'
import {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import {
  simpleV2Payload,
  v2PayloadFromContainers,
  V2_ACCENT
} from '@utils/ComponentsV2.js'
import config from '../../config'
import {
  AdminService,
  DEFAULT_REPORT_LIMIT,
  MAX_REPORT_LIMIT,
  ServiceError,
  type MarketOutlier
} from '../../services'

/** 신뢰도 조작 결과를 사람이 읽는 한 줄로. */
function creditLine(guildId: string, before: number, after: number): string {
  const arrow = after > before ? '▲' : after < before ? '▼' : '＝'
  return `**서버:** \`${guildId}\`\n**신뢰도:** ${before} ${arrow} **${after}** (변화 ${after - before >= 0 ? '+' : ''}${after - before})`
}

/** 이상치 한 건을 목록 줄로. */
function outlierLine(index: number, outlier: MarketOutlier): string {
  const pct = (outlier.deviation * 100).toFixed(0)
  const sign = outlier.deviation > 0 ? '+' : ''
  return [
    `**${index}. ${outlier.material}** · ${sign}${pct}%`,
    `-# 단가 ${outlier.price} / 기준가 ${outlier.globalPrice} · ${outlier.qty}개 · 판매자 \`${outlier.sellerId}\``,
    `-# \`${outlier.listingId}\``
  ].join('\n')
}

export class AdminCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, preconditions: ['OwnerOnly'] })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const group = interaction.options.getSubcommandGroup(false)
    const sub = interaction.options.getSubcommand(true)

    try {
      if (group === 'credit' && sub === 'set')
        return await this.creditSet(interaction)
      if (group === 'credit' && sub === 'adjust')
        return await this.creditAdjust(interaction)
      if (group === 'market' && sub === 'report')
        return await this.marketReport(interaction)
      if (group === 'market' && sub === 'remove')
        return await this.marketRemove(interaction)

      return await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: '알 수 없는 서브커맨드입니다.',
          ephemeral: true
        })
      )
    } catch (error) {
      return await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          title: '운영 명령 실패',
          body: this.describeError(error),
          footer: '변경은 반영되지 않았습니다. 값을 확인한 뒤 다시 시도하세요.',
          ephemeral: true
        })
      )
    }
  }

  /** ServiceError 를 운영자가 읽을 문장으로 바꾼다. */
  private describeError(error: unknown): string {
    if (error instanceof ServiceError) {
      switch (error.code) {
        case 'GUILD_NOT_FOUND':
          return '해당 서버를 찾을 수 없습니다. 봇이 들어간 적 있는 서버 ID인지 확인하세요.'
        case 'INVALID_CREDIT_VALUE':
          return `신뢰도는 ${CREDIT_MIN}~${CREDIT_MAX} 범위의 정수여야 합니다.`
        case 'AUDIT_REASON_REQUIRED':
          return '상대 조정에는 사유가 반드시 필요합니다.'
        case 'LISTING_NOT_FOUND':
          return '해당 매물을 찾을 수 없습니다.'
        case 'LISTING_NOT_ACTIVE':
          return '이미 판매·취소·만료된 매물입니다.'
        case 'USER_NOT_FOUND':
          return '판매자의 창고를 찾을 수 없어 자재를 되돌릴 수 없습니다.'
        default:
          return `처리에 실패했습니다 (\`${error.code}\`).`
      }
    }
    return '알 수 없는 오류로 처리에 실패했습니다. 로그를 확인하세요.'
  }

  /** `credit set` — 절대값 설정. */
  private async creditSet(interaction: Command.ChatInputCommandInteraction) {
    const guildId = interaction.options.getString('guild_id', true)
    const amount = interaction.options.getInteger('amount', true)
    const reason = interaction.options.getString('reason') ?? undefined

    const result = await AdminService.setCredit(
      this.container.db,
      interaction.user.id,
      guildId,
      amount,
      reason
    )

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '신뢰도 설정 완료',
        body: creditLine(result.guildId, result.before, result.after),
        footer: `감사 로그에 기록되었습니다 · 실행자 ${interaction.user.tag}`,
        ephemeral: true
      })
    )
  }

  /** `credit adjust` — 상대 조정 (사유 필수). */
  private async creditAdjust(interaction: Command.ChatInputCommandInteraction) {
    const guildId = interaction.options.getString('guild_id', true)
    const delta = interaction.options.getInteger('delta', true)
    const reason = interaction.options.getString('reason', true)

    const result = await AdminService.adjustCredit(
      this.container.db,
      interaction.user.id,
      guildId,
      delta,
      reason
    )

    const clamped =
      result.after === CREDIT_MIN || result.after === CREDIT_MAX
        ? `요청 증감(${delta >= 0 ? '+' : ''}${delta})이 0~2000 범위에서 클램프되었습니다.`
        : undefined

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '신뢰도 조정 완료',
        body: `${creditLine(result.guildId, result.before, result.after)}\n**사유:** ${reason}`,
        footer:
          clamped ??
          `감사 로그에 기록되었습니다 · 실행자 ${interaction.user.tag}`,
        ephemeral: true
      })
    )
  }

  /** `market report` — 가격 이상치 목록. */
  private async marketReport(interaction: Command.ChatInputCommandInteraction) {
    const limit =
      interaction.options.getInteger('limit') ?? DEFAULT_REPORT_LIMIT
    const outliers = await AdminService.marketOutliers(this.container.db, limit)

    if (outliers.length === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.info,
          title: '가격 이상치 없음',
          body: '글로벌 현재가 ±50% 밖에 있는 활성 매물이 없습니다. 등록 시 밴드 검증이 정상 작동하고 있습니다.',
          ephemeral: true
        })
      )
    }

    const container = new ContainerBuilder()
      .setAccentColor(V2_ACCENT.warn)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **가격 이상치 매물**')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `글로벌 현재가에서 ±50% 이상 벗어난 활성 매물 **${outliers.length}건**입니다. 등록 시점에는 밴드 안이었더라도 30분 가격 tick 이 움직이면 이렇게 남습니다.`
        )
      )
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      )

    for (const [index, outlier] of outliers.entries()) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(outlierLine(index + 1, outlier))
      )
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 회수하려면 \`/admin market remove <listing_id>\` · 최대 ${MAX_REPORT_LIMIT}건까지 조회`
      )
    )

    return interaction.reply(v2PayloadFromContainers([container], true))
  }

  /** `market remove` — 강제 회수. */
  private async marketRemove(interaction: Command.ChatInputCommandInteraction) {
    const listingId = interaction.options.getString('listing_id', true)
    const reason = interaction.options.getString('reason') ?? undefined

    const result = await AdminService.removeListing(
      this.container.db,
      interaction.user.id,
      listingId,
      reason,
      interaction.guildId
    )

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: '매물 강제 회수 완료',
        body: [
          `**매물:** \`${result.listingId}\``,
          `**판매자:** \`${result.sellerId}\``,
          `**되돌린 자재:** ${result.material} × ${result.returnedQty}`,
          reason ? `**사유:** ${reason}` : null
        ]
          .filter(Boolean)
          .join('\n'),
        footer: `자재는 판매자 창고로 반환되었습니다 · 실행자 ${interaction.user.tag}`,
        ephemeral: true
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName('admin')
          .setDescription('운영 전용 명령 (owner 한정)')
          .addSubcommandGroup((group) =>
            group
              .setName('credit')
              .setDescription('서버 신뢰도 조작')
              .addSubcommand((sub) =>
                sub
                  .setName('set')
                  .setDescription('신뢰도를 절대값으로 설정합니다.')
                  .addStringOption((option) =>
                    option
                      .setName('guild_id')
                      .setDescription('대상 서버 ID')
                      .setRequired(true)
                  )
                  .addIntegerOption((option) =>
                    option
                      .setName('amount')
                      .setDescription(
                        `설정할 신뢰도 (${CREDIT_MIN}~${CREDIT_MAX})`
                      )
                      .setMinValue(CREDIT_MIN)
                      .setMaxValue(CREDIT_MAX)
                      .setRequired(true)
                  )
                  .addStringOption((option) =>
                    option
                      .setName('reason')
                      .setDescription('사유 (감사 로그에 기록)')
                  )
              )
              .addSubcommand((sub) =>
                sub
                  .setName('adjust')
                  .setDescription('신뢰도를 상대값으로 조정합니다. 사유 필수.')
                  .addStringOption((option) =>
                    option
                      .setName('guild_id')
                      .setDescription('대상 서버 ID')
                      .setRequired(true)
                  )
                  .addIntegerOption((option) =>
                    option
                      .setName('delta')
                      .setDescription('증감폭 (음수 가능)')
                      .setMinValue(-CREDIT_MAX)
                      .setMaxValue(CREDIT_MAX)
                      .setRequired(true)
                  )
                  .addStringOption((option) =>
                    option
                      .setName('reason')
                      .setDescription('사유 (필수, 감사 로그에 기록)')
                      .setRequired(true)
                  )
              )
          )
          .addSubcommandGroup((group) =>
            group
              .setName('market')
              .setDescription('마켓 이상치 점검·회수')
              .addSubcommand((sub) =>
                sub
                  .setName('report')
                  .setDescription('글로벌 현재가 ±50% 밖 매물을 조회합니다.')
                  .addIntegerOption((option) =>
                    option
                      .setName('limit')
                      .setDescription(
                        `조회 건수 (기본 ${DEFAULT_REPORT_LIMIT}, 최대 ${MAX_REPORT_LIMIT})`
                      )
                      .setMinValue(1)
                      .setMaxValue(MAX_REPORT_LIMIT)
                  )
              )
              .addSubcommand((sub) =>
                sub
                  .setName('remove')
                  .setDescription(
                    '이상 매물을 강제 회수합니다 (자재는 판매자에게 반환).'
                  )
                  .addStringOption((option) =>
                    option
                      .setName('listing_id')
                      .setDescription('회수할 매물 ID')
                      .setRequired(true)
                  )
                  .addStringOption((option) =>
                    option
                      .setName('reason')
                      .setDescription('사유 (감사 로그에 기록)')
                  )
              )
          ),
      config.devGuildID ? { guildIds: [config.devGuildID] } : undefined
    )
  }
}
