/**
 * `/warehouse` 슬래시 커맨드.
 *
 * 서브커맨드:
 * - `view`: 창고 등급/용량/사용량/보관 스택 조회
 * - `upgrade`: 창고 등급 업그레이드 (돈/재료 차감)
 *
 * 모든 응답은 공개 메시지. 서비스 에러는 `ServiceError.code` 기반 i18n 메시지로 변환.
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { UserService } from '../../services/user'
import { WarehouseService, type WarehouseView } from '../../services/warehouse'
import { ServiceError } from '../../services/base'
import { formatBigInt } from '../../structures/renderers/FactoryRenderer'
import { localizeMaterial } from '../../utils/enumLocale'
import { stackLines } from '../../utils/warehouseDisplay'
import type { MaterialType } from '@idle/game-core'

/**
 * 보관 자원 블록. 표시 로직은 `/profile` 과 공유해 두 커맨드의 재고 표기가
 * 갈리지 않게 한다.
 *
 * @param view 창고 조회 결과
 * @param t 대상 로케일 `t` 함수
 * @returns 자재별 라인 목록, 재고가 없으면 안내 문구
 */
function stacksDisplay(view: WarehouseView, t: TFunction): string {
  const lines = stackLines(t, view.stacks)
  return lines.length === 0 ? t('game:warehouse.view.empty') : lines.join('\n')
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
    const { db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username
    })

    const view = await WarehouseService.view(db, interaction.user.id)

    const body = [
      `**${t('game:warehouse.view.fields.grade')}:** G${view.grade}`,
      `**${t('game:warehouse.view.fields.capacity')}:** ${formatBigInt(view.capacity)}`,
      `**${t('game:warehouse.view.fields.used')}:** ${formatBigInt(view.used)}`,
      `**${t('game:warehouse.view.fields.free')}:** ${formatBigInt(view.free)}`,
      '',
      `**${t('game:warehouse.view.fields.stacks')}**`,
      stacksDisplay(view, t)
    ].join('\n')

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        title: t('game:warehouse.view.title'),
        body,
        ephemeral: false
      })
    )
  }

  private async handleUpgrade(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    const { db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username
    })

    try {
      const view = await WarehouseService.upgrade(db, interaction.user.id)
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          body: t('game:warehouse.upgrade.success', { grade: view.grade }),
          ephemeral: false
        })
      )
    } catch (err) {
      if (err instanceof ServiceError) {
        const msg = this.translateUpgradeError(err, t)
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: msg,
            ephemeral: false
          })
        )
      }
      throw err
    }
  }

  private translateUpgradeError(err: ServiceError, t: TFunction): string {
    switch (err.code) {
      case 'MAX_GRADE':
        return t('game:warehouse.upgrade.error.maxGrade')
      case 'INSUFFICIENT_MONEY': {
        const d = (err.details ?? {}) as { required?: string }
        return t('game:warehouse.upgrade.error.insufficientMoney', {
          required: d.required ?? '-'
        })
      }
      case 'INSUFFICIENT_MATERIAL': {
        const d = (err.details ?? {}) as { material?: string; amount?: string }
        const materialLabel = d.material
          ? localizeMaterial(t, d.material as MaterialType)
          : '-'
        return t('game:warehouse.upgrade.error.insufficientMaterial', {
          amount: d.amount ?? '-',
          material: materialLabel
        })
      }
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
