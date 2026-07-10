/**
 * `/server` 커맨드 그룹 (#16).
 *
 * 서브커맨드:
 *  - `vault` — 서버 금고 현황: 잔액·가산세·신뢰도(#17 자리)·최근 주간 정산 요약.
 *
 * 기존 `/setup`(등록)·길드 설정 패널(버튼/Select)과 별도로, 서버 단위 경제
 * 정보를 조회하는 신규 그룹이다 — #17(신뢰도·재분배)에서 서브커맨드가 늘어날
 * 자리를 남긴다. 서버 컨텍스트 전용(DM 불가).
 *
 * 참조: docs/design/07-global-system.md §세금 시스템, GitHub #16
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { buildServerVaultContainer } from '@structures/renderers'
import { WeeklySettlementService } from '../../services/weeklySettlement'
import { resolveAnnounceAction } from '../../utils/announceAction'

export class ServerCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    if (sub === 'vault') return this.handleVault(interaction)
    if (sub === 'announce') return this.handleAnnounce(interaction)
    return this.replyUnknown(interaction)
  }

  /**
   * `/server vault` — 서버 금고 현황 조회 (공개 응답).
   *
   * 금고 잔액·현재 가산세는 `Guild` 행, 최근 정산 요약은
   * `WeeklySettlementService.guildSummary`(라인 비정규화 인덱스)에서 읽는다.
   * 신뢰도는 저장값만 노출한다 — 증감 로직은 #17 에서 연결된다.
   */
  private async handleVault(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    if (!interaction.guildId) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          body: t('game:server.vault.error.guildOnly'),
          ephemeral: true
        })
      )
    }

    const guildRow = await db.guild.findUnique({
      where: { id: interaction.guildId }
    })
    if (!guildRow) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          body: t('game:server.vault.error.notRegistered'),
          ephemeral: true
        })
      )
    }

    const summary = await WeeklySettlementService.guildSummary(
      db,
      interaction.guildId
    )
    const container = buildServerVaultContainer(guildRow, summary, t)
    return interaction.reply({
      components: [container],
      flags: v2Flags(false)
    })
  }

  /**
   * `/server announce` — 글로벌 이벤트 공지 채널 지정·해제·조회 (ephemeral).
   *
   * 순수 결정 로직은 `resolveAnnounceAction` 에 위임하고, 여기서는
   * discord/DB 상태 수집·부작용(권한 검사·DB 갱신)·로케일 응답만 담당한다.
   * 응답은 전부 Components v2 ephemeral. 채널 지정 시 `Guild.announceChannelId`
   * 를 갱신하고, `clear` 시 `null` 로 되돌린다.
   */
  private async handleAnnounce(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const clear = interaction.options.getBoolean('clear') ?? false
    const channel = interaction.options.getChannel('channel')
    const hasManage =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
      false

    const guildRow = interaction.guildId
      ? await db.guild.findUnique({ where: { id: interaction.guildId } })
      : null

    const isTextable = channel
      ? channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement
      : false

    const result = resolveAnnounceAction({
      inGuild: Boolean(interaction.guildId),
      hasManage,
      guildExists: guildRow !== null,
      clear,
      channelId: channel?.id ?? null,
      isTextable,
      currentChannelId: guildRow?.announceChannelId ?? null
    })

    switch (result.action) {
      case 'guildOnly':
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.warn,
          t('game:server.vault.error.guildOnly')
        )
      case 'notAdmin':
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.warn,
          t('embeds:guildSettings.error.notAdmin')
        )
      case 'notRegistered':
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.warn,
          t('game:server.vault.error.notRegistered')
        )
      case 'notTextable':
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.warn,
          t('game:server.announce.channel.notTextable')
        )
      case 'cleared':
        await db.guild.update({
          where: { id: interaction.guildId! },
          data: { announceChannelId: null }
        })
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.success,
          t('game:server.announce.channel.cleared')
        )
      case 'set':
        await db.guild.update({
          where: { id: interaction.guildId! },
          data: { announceChannelId: result.channelId }
        })
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.success,
          t('game:server.announce.channel.set')
        )
      case 'current':
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.info,
          t('game:server.announce.channel.current', {
            channelId: result.channelId
          })
        )
      case 'none':
      default:
        return this.replyAnnounce(
          interaction,
          V2_ACCENT.info,
          t('game:server.announce.channel.none')
        )
    }
  }

  /**
   * `/server announce` 공통 ephemeral Components v2 응답 헬퍼.
   */
  private replyAnnounce(
    interaction: Command.ChatInputCommandInteraction,
    accent: number,
    body: string
  ) {
    return interaction.reply(simpleV2Payload({ accent, body, ephemeral: true }))
  }

  private async replyUnknown(interaction: Command.ChatInputCommandInteraction) {
    const t = await fetchT(interaction)
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: t('game:common.error.unknown'),
        ephemeral: true
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('server')
        .setDescription('Server economy info.')
        .setNameLocalization('ko', '서버')
        .setDescriptionLocalization('ko', '서버 경제 정보')
        .addSubcommand((sub) =>
          sub
            .setName('vault')
            .setNameLocalization('ko', '금고')
            .setDescription('Show the server vault status.')
            .setDescriptionLocalization('ko', '서버 금고 현황을 봅니다.')
        )
        .addSubcommand((sub) =>
          sub
            .setName('announce')
            .setNameLocalization('ko', '공지채널')
            .setDescription('Set the global event announcement channel.')
            .setDescriptionLocalization(
              'ko',
              '글로벌 이벤트 공지 채널을 지정합니다.'
            )
            .addChannelOption((opt) =>
              opt
                .setName('channel')
                .setNameLocalization('ko', '채널')
                .setDescription('Channel to announce global events in.')
                .setDescriptionLocalization('ko', '공지를 보낼 채널')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
            )
            .addBooleanOption((opt) =>
              opt
                .setName('clear')
                .setNameLocalization('ko', '해제')
                .setDescription('Clear the current announcement channel.')
                .setDescriptionLocalization(
                  'ko',
                  '현재 공지 채널을 해제합니다.'
                )
                .setRequired(false)
            )
        )
    )
  }
}
