import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  FACTORY_CATALOG,
  type FactoryType,
  type MaterialType
} from '@idle/game-core'
import type { ShortageMode } from '@idle/database'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { formatBigInt, renderFactoryInfo } from '@structures/renderers'
import { appendQuestCompletions } from '@utils/questNotifier'
import { DEFAULT_LAND_INDEX, FactoryService } from '../../services/factory'
import { MAX_BUYABLE_INDEX } from '../../services/land'
import { UserService } from '../../services/user'
import { ServiceError } from '../../services/base'
import {
  localizeFactoryType,
  localizeShortageMode
} from '../../utils/enumLocale'

/**
 * `/factory` 슬래시 커맨드 그룹.
 *
 * 서브커맨드:
 * - `build`: 토지 `(x, y)`에 MVP 공장을 건설한다.
 * - `upgrade`: 소유 공장을 한 단계 업그레이드한다.
 * - `info`: 공장 현재 상태를 조회한다.
 * - `setmode`: 원료 부족 시 동작 모드를 변경한다.
 *
 * 모든 응답은 공개 메시지로 전송된다.
 *
 * 참조: `docs/design/03-factories.md`.
 */

/** `/factory build` 서브커맨드의 `type` 선택지로 사용할 MVP 공장 목록. */
export const MVP_FACTORY_CHOICES: readonly FactoryType[] = [
  'FARM',
  'MINE',
  'LUMBER',
  'STEEL_MILL',
  'FLOUR_MILL',
  'CAR_FACTORY'
]

/** `/factory setmode` 의 `mode` 선택지. */
const SHORTAGE_MODES: readonly ShortageMode[] = ['PAUSE', 'AUTO_BUY', 'PARTIAL']

export class FactoryCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    switch (sub) {
      case 'build':
        return this.handleBuild(interaction)
      case 'upgrade':
        return this.handleUpgrade(interaction)
      case 'info':
        return this.handleInfo(interaction)
      case 'setmode':
        return this.handleSetMode(interaction)
      case 'destroy':
        return this.handleDestroy(interaction)
      default:
        return this.replyError(interaction, 'game:common.error.unknown')
    }
  }

  /**
   * `/factory build` 처리.
   *
   * 1. `UserService.ensure`로 유저/토지/창고 존재 보장.
   * 2. `FactoryService.build` 호출.
   * 3. 결과를 `renderFactoryInfo` 필드로 Embed 구성.
   */
  private async handleBuild(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const type = interaction.options.getString('type', true) as FactoryType
    const x = interaction.options.getInteger('x', true)
    const y = interaction.options.getInteger('y', true)
    const landIndex =
      interaction.options.getInteger('land_index') ?? DEFAULT_LAND_INDEX

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const { factory, quest } = await FactoryService.build(db, {
        userId: interaction.user.id,
        landIndex,
        type,
        anchorX: x,
        anchorY: y
      })

      const entry = FACTORY_CATALOG[factory.type]
      const info = await FactoryService.info(db, factory.id)
      const nextCost =
        info.nextUpgradeCost.money !== null &&
        info.nextUpgradeCost.material !== null
          ? {
              money: info.nextUpgradeCost.money,
              material: info.nextUpgradeCost.material.material as MaterialType,
              amount: info.nextUpgradeCost.material.amount
            }
          : null

      const base = simpleV2Payload({
        accent: V2_ACCENT.success,
        title: t('game:factory.build.success', {
          type: localizeFactoryType(t, factory.type),
          emoji: entry.emoji,
          x: factory.anchorX,
          y: factory.anchorY
        }),
        body: renderFactoryInfo(info, entry, nextCost, t),
        ephemeral: false
      })
      return interaction.reply(appendQuestCompletions(base, quest, t))
    } catch (err) {
      return this.replyFromError(interaction, err, 'build')
    }
  }

  /** `/factory upgrade` 처리. */
  private async handleUpgrade(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const factoryId = interaction.options.getString('factory_id', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const { factory, quest } = await FactoryService.upgrade(db, {
        userId: interaction.user.id,
        factoryId
      })
      const base = simpleV2Payload({
        accent: V2_ACCENT.success,
        title: t('game:factory.upgrade.success', {
          type: localizeFactoryType(t, factory.type),
          grade: factory.grade
        }),
        ephemeral: false
      })
      return interaction.reply(appendQuestCompletions(base, quest, t))
    } catch (err) {
      return this.replyFromError(interaction, err, 'upgrade')
    }
  }

  /** `/factory info` 처리. */
  private async handleInfo(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const factoryId = interaction.options.getString('factory_id', true)

    try {
      const info = await FactoryService.info(db, factoryId)
      const entry = FACTORY_CATALOG[info.type]
      const nextCost =
        info.nextUpgradeCost.money !== null &&
        info.nextUpgradeCost.material !== null
          ? {
              money: info.nextUpgradeCost.money,
              material: info.nextUpgradeCost.material.material as MaterialType,
              amount: info.nextUpgradeCost.material.amount
            }
          : null

      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.info,
          title: t('game:factory.info.title', {
            emoji: entry.emoji,
            type: localizeFactoryType(t, info.type),
            grade: info.grade
          }),
          body: renderFactoryInfo(info, entry, nextCost, t),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'info')
    }
  }

  /** `/factory setmode` 처리. */
  private async handleSetMode(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const factoryId = interaction.options.getString('factory_id', true)
    const mode = interaction.options.getString('mode', true) as ShortageMode

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      await FactoryService.setMode(db, {
        userId: interaction.user.id,
        factoryId,
        mode
      })
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:factory.setMode.success', {
            mode: localizeShortageMode(t, mode)
          }),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'setmode')
    }
  }

  /** `/factory destroy` 처리 — 확인 없이 즉시 철거한다 (UI 버튼 플로우에는 2단계 확인 있음). */
  private async handleDestroy(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const factoryId = interaction.options.getString('factory_id', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await FactoryService.destroy(db, {
        userId: interaction.user.id,
        factoryId
      })
      const entry = FACTORY_CATALOG[result.type]
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          body: t('game:factory.destroy.success', {
            emoji: entry.emoji,
            type: localizeFactoryType(t, result.type),
            refund: formatBigInt(result.refund),
            remaining: formatBigInt(result.remainingMoney)
          }),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'destroy')
    }
  }

  /**
   * `ServiceError`를 i18n 경고 Embed로 변환해 응답한다.
   *
   * 알려지지 않은 오류는 `game:common.error.unknown`으로 폴백한다.
   */
  private async replyFromError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    surface: 'build' | 'upgrade' | 'info' | 'setmode' | 'destroy'
  ) {
    if (!(err instanceof ServiceError)) {
      this.container.logger.error(err)
      return this.replyError(interaction, 'game:common.error.unknown')
    }
    const t = await fetchT(interaction)
    const key = this.resolveErrorKey(err, surface, t, interaction)
    return this.replyErrorRaw(interaction, key)
  }

  /** `ServiceError.code`와 서브커맨드 컨텍스트에 따라 i18n 키와 상호작용 파라미터를 결정한다. */
  private resolveErrorKey(
    err: ServiceError,
    surface: 'build' | 'upgrade' | 'info' | 'setmode' | 'destroy',
    t: TFunction,
    interaction: Command.ChatInputCommandInteraction
  ): string {
    switch (err.code) {
      case 'USER_NOT_FOUND':
        return t('game:common.error.userNotFound')
      case 'FACTORY_NOT_FOUND':
        return t('game:common.error.factoryNotFound')
      case 'WAREHOUSE_FULL':
        return t('game:common.error.warehouseFull')
      case 'INSUFFICIENT_MONEY': {
        const det = (err.details ?? {}) as {
          required?: string
          have?: string
        }
        const required = det.required ?? '-'
        const have = det.have ?? '-'
        if (surface === 'upgrade') {
          return t('game:factory.upgrade.error.insufficientMoney', {
            required
          })
        }
        return t('game:factory.build.error.insufficientMoney', {
          required,
          have
        })
      }
      case 'INSUFFICIENT_MATERIAL': {
        const details = (err.details ?? {}) as {
          material?: string
          amount?: bigint | string
        }
        const materialCode = details.material ?? '-'
        const materialLabel =
          materialCode !== '-'
            ? t(`game:material.${materialCode}`, { defaultValue: materialCode })
            : '-'
        const amount =
          details.amount !== undefined ? String(details.amount) : '-'
        if (surface === 'build') {
          return t('game:factory.build.error.insufficientMaterial', {
            amount,
            material: materialLabel
          })
        }
        return t('game:factory.upgrade.error.insufficientMaterial', {
          amount,
          material: materialLabel
        })
      }
      case 'LEVEL_LOCKED': {
        const typeOpt = interaction.options.getString('type')
        const level =
          typeOpt && typeOpt in FACTORY_CATALOG
            ? FACTORY_CATALOG[typeOpt as FactoryType].unlockLevel
            : '?'
        return t('game:factory.build.error.levelLocked', { level })
      }
      case 'SLOT_OCCUPIED':
        return t('game:factory.build.error.slotOccupied')
      case 'OUT_OF_BOUNDS':
        return t('game:factory.build.error.outOfBounds')
      case 'MAX_GRADE':
        return t('game:factory.upgrade.error.maxGrade')
      case 'LAND_NOT_FOUND':
        return t('game:factory.build.error.landNotFound')
      default:
        return t('game:common.error.unknown')
    }
  }

  /** 이미 번역된 메시지 본문으로 경고 Components v2 응답. */
  private async replyErrorRaw(
    interaction: Command.ChatInputCommandInteraction,
    message: string
  ) {
    const payload = simpleV2Payload({
      accent: V2_ACCENT.warn,
      body: message,
      ephemeral: false
    })
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload)
    }
    return interaction.reply(payload)
  }

  /** i18n 키로부터 경고 Embed 응답을 만든다. */
  private async replyError(
    interaction: Command.ChatInputCommandInteraction,
    key: string
  ) {
    const t = await fetchT(interaction)
    return this.replyErrorRaw(interaction, t(key))
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('factory')
        .setDescription(
          'Manage your factories (build, upgrade, info, setmode).'
        )
        .setNameLocalization('ko', '공장')
        .setDescriptionLocalization(
          'ko',
          '공장 관리 (건설/업그레이드/조회/모드).'
        )
        .addSubcommand((sub) =>
          sub
            .setName('build')
            .setDescription('Build a factory at (x, y).')
            .setNameLocalization('ko', '건설')
            .setDescriptionLocalization(
              'ko',
              '공장을 (x, y) 위치에 건설합니다.'
            )
            .addStringOption((o) =>
              o
                .setName('type')
                .setDescription('Factory type')
                .setNameLocalization('ko', '종류')
                .setDescriptionLocalization('ko', '공장 종류')
                .setRequired(true)
                .addChoices(
                  ...MVP_FACTORY_CHOICES.map((type) => ({
                    name: `${FACTORY_CATALOG[type].emoji} ${type} (${formatBigInt(
                      FACTORY_CATALOG[type].buildCost
                    )})`,
                    value: type
                  }))
                )
            )
            .addIntegerOption((o) =>
              o
                .setName('x')
                .setDescription('Anchor X (0-3)')
                .setNameLocalization('ko', 'x좌표')
                .setDescriptionLocalization('ko', '앵커 X 좌표 (0-3)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(3)
            )
            .addIntegerOption((o) =>
              o
                .setName('y')
                .setDescription('Anchor Y (0-3)')
                .setNameLocalization('ko', 'y좌표')
                .setDescriptionLocalization('ko', '앵커 Y 좌표 (0-3)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(3)
            )
            .addIntegerOption((o) =>
              o
                .setName('land_index')
                .setDescription('Land number (1-5, default 1)')
                .setNameLocalization('ko', '토지번호')
                .setDescriptionLocalization(
                  'ko',
                  '건설할 토지 번호 (1~5, 기본 1)'
                )
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_BUYABLE_INDEX)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('upgrade')
            .setDescription('Upgrade a factory by one grade.')
            .setNameLocalization('ko', '업그레이드')
            .setDescriptionLocalization(
              'ko',
              '공장을 한 단계 업그레이드합니다.'
            )
            .addStringOption((o) =>
              o
                .setName('factory_id')
                .setDescription('Factory ID')
                .setNameLocalization('ko', '공장id')
                .setDescriptionLocalization('ko', '공장 ID')
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('info')
            .setDescription('Show factory info.')
            .setNameLocalization('ko', '조회')
            .setDescriptionLocalization('ko', '공장 정보를 조회합니다.')
            .addStringOption((o) =>
              o
                .setName('factory_id')
                .setDescription('Factory ID')
                .setNameLocalization('ko', '공장id')
                .setDescriptionLocalization('ko', '공장 ID')
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('setmode')
            .setDescription('Set shortage-mode for a factory.')
            .setNameLocalization('ko', '모드설정')
            .setDescriptionLocalization(
              'ko',
              '공장의 원료 부족 동작 모드를 설정합니다.'
            )
            .addStringOption((o) =>
              o
                .setName('factory_id')
                .setDescription('Factory ID')
                .setNameLocalization('ko', '공장id')
                .setDescriptionLocalization('ko', '공장 ID')
                .setRequired(true)
            )
            .addStringOption((o) =>
              o
                .setName('mode')
                .setDescription('Shortage mode')
                .setNameLocalization('ko', '모드')
                .setDescriptionLocalization('ko', '원료 부족 동작 모드')
                .setRequired(true)
                .addChoices(
                  ...SHORTAGE_MODES.map((m) => ({ name: m, value: m }))
                )
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('destroy')
            .setDescription('Destroy a factory (50% money refund).')
            .setNameLocalization('ko', '철거')
            .setDescriptionLocalization(
              'ko',
              '공장을 철거합니다 (건설 비용 50% 환불).'
            )
            .addStringOption((o) =>
              o
                .setName('factory_id')
                .setDescription('Factory ID')
                .setNameLocalization('ko', '공장id')
                .setDescriptionLocalization('ko', '공장 ID')
                .setRequired(true)
            )
        )
    )
  }
}
