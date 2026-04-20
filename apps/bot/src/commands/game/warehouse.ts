/**
 * `/warehouse` 슬래시 커맨드.
 *
 * 서브커맨드:
 * - `view`: 창고 등급/용량/사용량/보관 스택 조회
 * - `upgrade`: 창고 등급 업그레이드 (돈/재료 차감)
 *
 * 모든 응답은 ephemeral. 서비스 에러는 `ServiceError.code` 기반 i18n 메시지로 변환.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import Embed from '@utils/Embed'
import { UserService } from '../../services/user'
import { WarehouseService, type WarehouseView } from '../../services/warehouse'
import { ServiceError } from '../../services/base'
import { formatBigInt } from '../../structures/renderers/FactoryRenderer'

function stacksDisplay(view: WarehouseView): string {
  const nonEmpty = view.stacks.filter((s) => s.count > 0n)
  if (nonEmpty.length === 0) return '—'
  return nonEmpty
    .map((s) => `• ${s.material}: ${formatBigInt(s.count)}`)
    .join('\n')
}

export class WarehouseCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)

    if (sub === 'view') return this.handleView(interaction)
    if (sub === 'upgrade') return this.handleUpgrade(interaction)
    return undefined
  }

  private async handleView(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    const { client, db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? 'en-US'
    })

    const view = await WarehouseService.view(db, interaction.user.id)

    const embed = new Embed(client, 'info')
      .setTitle(t('game:warehouse.view.title'))
      .addFields([
        {
          name: t('game:warehouse.view.fields.grade'),
          value: `G${view.grade}`,
          inline: true
        },
        {
          name: t('game:warehouse.view.fields.capacity'),
          value: formatBigInt(view.capacity),
          inline: true
        },
        {
          name: t('game:warehouse.view.fields.used'),
          value: formatBigInt(view.used),
          inline: true
        },
        {
          name: t('game:warehouse.view.fields.free'),
          value: formatBigInt(view.free),
          inline: true
        },
        {
          name: t('game:warehouse.view.fields.stacks'),
          value: stacksDisplay(view),
          inline: false
        }
      ])

    return interaction.reply({ embeds: [embed], ephemeral: true })
  }

  private async handleUpgrade(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    const { client, db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? 'en-US'
    })

    try {
      const view = await WarehouseService.upgrade(db, interaction.user.id)
      const embed = new Embed(client, 'success').setDescription(
        t('game:warehouse.upgrade.success', { grade: view.grade })
      )
      return interaction.reply({ embeds: [embed], ephemeral: true })
    } catch (err) {
      if (err instanceof ServiceError) {
        const msg = this.translateUpgradeError(err, t)
        const embed = new Embed(client, 'error').setDescription(msg)
        return interaction.reply({ embeds: [embed], ephemeral: true })
      }
      throw err
    }
  }

  private translateUpgradeError(
    err: ServiceError,
    t: (key: string, opts?: Record<string, unknown>) => string
  ): string {
    switch (err.code) {
      case 'MAX_GRADE':
        return t('game:warehouse.upgrade.error.maxGrade')
      case 'INSUFFICIENT_MONEY':
        return t('game:warehouse.upgrade.error.insufficientMoney', {
          required: err.message
        })
      case 'INSUFFICIENT_MATERIAL':
        return t('game:warehouse.upgrade.error.insufficientMaterial', {
          amount: err.message,
          material: ''
        })
      case 'USER_NOT_FOUND':
        return t('game:common.error.userNotFound')
      default:
        return t('game:common.error.unknown')
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('warehouse')
        .setDescription('View or upgrade your warehouse.')
        .setNameLocalization('ko', '창고')
        .setDescriptionLocalization('ko', '창고를 확인하거나 업그레이드합니다.')
        .addSubcommand((sc) =>
          sc
            .setName('view')
            .setDescription('Show current warehouse status.')
            .setNameLocalization('ko', '보기')
            .setDescriptionLocalization('ko', '창고 상태를 확인합니다.')
        )
        .addSubcommand((sc) =>
          sc
            .setName('upgrade')
            .setDescription('Upgrade warehouse to the next grade.')
            .setNameLocalization('ko', '업그레이드')
            .setDescriptionLocalization('ko', '창고 등급을 업그레이드합니다.')
        )
    )
  }
}
