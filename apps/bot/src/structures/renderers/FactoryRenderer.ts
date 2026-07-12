/**
 * 공장(Factory) 정보 렌더러.
 *
 * Discord Components v2 TextDisplay 본문(마크다운 문자열)으로 공장의 현재 상태를 표현한다.
 * Prisma/네트워크 의존 없이 순수 입력 → 순수 출력.
 *
 * 참조: `docs/design/03-factories.md` §공장 정보.
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder
} from 'discord.js'
import type { FactoryCatalogEntry } from '@idle/game-core'
import type {
  FactoryType,
  MaterialType,
  ShortageMode,
  UpgradeBooster
} from '@idle/game-core'
// 상대경로 유지: 스케줄러(`scheduled-tasks/*`)가 이 파일의 `formatBigInt` 를 import 하므로
// vitest 단위 테스트 그래프에 전이적으로 로드된다. vitest 는 `@utils` 별칭을 해석하지 못해
// 별칭 import 시 렌더러가 로드 실패한다 (apps/bot/CLAUDE.md §Testing). 형제 렌더러는
// 테스트에 전이 로드되지 않으므로 별칭을 유지해도 무방하다.
import { V2_ACCENT } from '../../utils/ComponentsV2'
import { localizeUpgradeBooster } from '../../utils/enumLocale'

/**
 * 부스터 분기 선택 Select customId prefix — `selects/factoryBoosterSelect.ts` 와 공유.
 * 포맷: `factory:booster:<ownerId>:<factoryId>`, value 는 `UpgradeBooster`.
 */
export const FACTORY_BOOSTER_SELECT_PREFIX = 'factory:booster:'

/**
 * 부스터별 대표 이모지.
 * 근거: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템 선택지 표.
 */
export const UPGRADE_BOOSTER_EMOJI: Readonly<Record<UpgradeBooster, string>> = {
  SAVING: '🔻',
  RARE: '🔺',
  SPEED: '⚡',
  PROFIT: '💰'
}

/** Select 옵션 순서 — 설계 문서 선택지 표 순서 그대로. */
const BOOSTER_OPTIONS: readonly UpgradeBooster[] = [
  'SAVING',
  'RARE',
  'SPEED',
  'PROFIT'
]

/**
 * 3/5/7/10등급 도달 시 노출하는 부스터 분기 선택 컨테이너를 만든다.
 *
 * 선택 확정은 `selects/factoryBoosterSelect.ts` 가
 * `FactoryService.chooseBooster` 를 호출해 처리한다.
 *
 * @param params ownerId(소유자 검증용)·factoryId·도달 등급·i18n
 * @returns 부스터 4지선다 Select 가 담긴 Container
 */
export function buildBoosterChoiceContainer(params: {
  readonly ownerId: string
  readonly factoryId: string
  readonly grade: number
  readonly t: TFunction
}): ContainerBuilder {
  const { ownerId, factoryId, grade, t } = params
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${FACTORY_BOOSTER_SELECT_PREFIX}${ownerId}:${factoryId}`)
    .setPlaceholder(t('game:factory.boosterChoice.placeholder'))
    .addOptions(
      BOOSTER_OPTIONS.map((booster) =>
        new StringSelectMenuOptionBuilder()
          .setValue(booster)
          .setLabel(localizeUpgradeBooster(t, booster))
          .setDescription(t(`game:factory.boosterChoice.desc.${booster}`))
          .setEmoji(UPGRADE_BOOSTER_EMOJI[booster])
      )
    )

  return new ContainerBuilder()
    .setAccentColor(V2_ACCENT.rare)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# **${t('game:factory.boosterChoice.title', { grade })}**`
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:factory.boosterChoice.body'))
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
    )
}

/**
 * 공장 렌더링 입력 DTO.
 *
 * DB 엔터티의 최소 표현. BigInt 필드는 이 계층에서 문자열로 포맷팅된다.
 */
export interface FactoryInfoDTO {
  /** 공장 종류 */
  readonly type: FactoryType
  /** 현재 등급 1..10 */
  readonly grade: number
  /**
   * 서버 신뢰도 기준 유효 최대 등급(8 | 9 | 10). 제공되면 등급 라인을
   * `G{grade} / {effectiveMaxGrade}` 로 표시한다. 근거: 이슈 #17 확정 결정 1.
   */
  readonly effectiveMaxGrade?: number
  /** 배치된 앵커 X */
  readonly anchorX: number
  /** 배치된 앵커 Y */
  readonly anchorY: number
  /** 원료 부족 시 동작 모드 */
  readonly shortageMode: ShortageMode
  /** 선택된 업그레이드 부스터 (미선택 null, 미제공 시 라인 생략) */
  readonly upgradeBooster?: UpgradeBooster | null
  /** 원자재 부스터 투입 여부 (미제공 시 라인 생략) */
  readonly hasRawBooster?: boolean
}

/**
 * 다음 등급(G+1) 업그레이드 비용 DTO.
 *
 * 현재 등급이 최대라면 `null`을 전달한다.
 */
export interface NextUpgradeCost {
  /** 다음 등급에 필요한 화폐 비용 */
  readonly money: bigint
  /** 다음 등급에 필요한 재료 종류 */
  readonly material: MaterialType
  /** 다음 등급에 필요한 재료 수량 */
  readonly amount: bigint
}

/**
 * 공장 정보를 Components v2 TextDisplay 본문 문자열로 변환한다.
 *
 * 각 라인은 `**라벨:** 값` 형태의 마크다운이며, 마지막에 (있으면) 다음
 * 업그레이드 비용 라인이 추가된다. 라벨·공장 종류·재료·모드는 전부 i18n 으로 해석.
 *
 * @param factory 공장 런타임 DTO
 * @param catalogEntry 해당 공장 종류의 카탈로그 정의
 * @param nextCost 다음 등급 비용 (최대 등급이면 `null`)
 * @param t i18n TFunction (없으면 영문 enum 그대로 노출)
 * @returns TextDisplay 에 바로 넣을 수 있는 멀티라인 문자열
 */
export function renderFactoryInfo(
  factory: FactoryInfoDTO,
  catalogEntry: FactoryCatalogEntry,
  nextCost: NextUpgradeCost | null,
  t?: TFunction
): string {
  const typeLabel = t
    ? t(`game:factoryType.${factory.type}`, { defaultValue: factory.type })
    : factory.type
  const modeLabel = t
    ? t(`game:shortageMode.${factory.shortageMode}`, {
        defaultValue: factory.shortageMode
      })
    : factory.shortageMode
  const materialLabel = (m: MaterialType): string =>
    t ? t(`game:material.${m}`, { defaultValue: m }) : m

  const fieldLabel = (key: string, fallback: string): string =>
    t
      ? t(`game:factory.info.fields.${key}`, { defaultValue: fallback })
      : fallback

  const unlockValue =
    catalogEntry.unlockLevel >= 9999
      ? t
        ? t('game:factory.info.unlockHidden', { defaultValue: '미공개' })
        : '미공개'
      : `Lv.${catalogEntry.unlockLevel}`

  const gradeValue =
    factory.effectiveMaxGrade !== undefined
      ? `G${factory.grade} / ${factory.effectiveMaxGrade}`
      : `G${factory.grade}`

  const lines = [
    `**${fieldLabel('type', '종류')}:** ${catalogEntry.emoji} ${typeLabel} (${catalogEntry.tier})`,
    `**${fieldLabel('grade', '등급')}:** ${gradeValue}`,
    `**${fieldLabel('position', '좌표')}:** (${factory.anchorX}, ${factory.anchorY})`,
    `**${fieldLabel('mode', '모드')}:** ${modeLabel}`,
    `**${fieldLabel('unlock', '해금 레벨')}:** ${unlockValue}`
  ]

  if (factory.upgradeBooster !== undefined) {
    const boosterValue = factory.upgradeBooster
      ? `${UPGRADE_BOOSTER_EMOJI[factory.upgradeBooster]} ${
          t
            ? localizeUpgradeBooster(t, factory.upgradeBooster)
            : factory.upgradeBooster
        }`
      : t
        ? t('game:factory.info.boosterNone', { defaultValue: '미선택' })
        : '미선택'
    lines.push(`**${fieldLabel('booster', '부스터')}:** ${boosterValue}`)
  }
  if (factory.hasRawBooster) {
    lines.push(`**${fieldLabel('rawBooster', '원자재 부스터')}:** 🧪 ×1.2`)
  }

  if (nextCost !== null) {
    lines.push(
      `**${fieldLabel('nextCost', '다음 업그레이드')}:** ${formatBigInt(nextCost.money)} 💰 · ${formatBigInt(nextCost.amount)} ${materialLabel(nextCost.material)}`
    )
  }

  return lines.join('\n')
}

/**
 * `bigint`를 천단위 구분자 문자열로 포맷한다.
 *
 * 예: `1_000_000n → '1,000,000'`.
 *
 * @param value 변환할 BigInt
 * @returns 포맷된 문자열
 */
export function formatBigInt(value: bigint): string {
  const s = value.toString(10)
  const negative = s.startsWith('-')
  const digits = negative ? s.slice(1) : s
  const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${withCommas}` : withCommas
}
