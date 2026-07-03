/**
 * `/server vault` UI 렌더러 — 서버 금고 현황 패널 (#16).
 *
 * 금고 잔액·현재 서버 가산세·신뢰도(#17 자리)·최근 주간 정산 요약을 한
 * 컨테이너에 표시한다 (이슈 #16 본문 6번 커맨드).
 *
 * Components v2 전용 — `.claude/skills/componentsv2-builder/SKILL.md` 준수.
 *
 * 참조: docs/design/07-global-system.md §세금 시스템·§신뢰도 시스템, GitHub #16
 */

import {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import type { Guild as GuildRow } from '@idle/database'
import type { TFunction } from '@sapphire/plugin-i18next'
import { V2_ACCENT } from '@utils/ComponentsV2'
import type { GuildSettlementSummary } from '../../services/weeklySettlement'
import { formatBigInt } from './FactoryRenderer'

/**
 * 서버 금고 패널 컨테이너를 만든다.
 *
 * 레이아웃:
 *   Container (info accent)
 *     ├── 제목 (`# **🏦 서버 금고**`)
 *     ├── 잔액·가산세·신뢰도(자리만)·주간 DAU 키-값 라인
 *     ├── Separator
 *     └── 최근 정산 요약 (없으면 "아직 정산 이력이 없어요")
 *
 * @param guildRow  Guild 행 (vault·taxSurcharge·credit·weeklyDAU)
 * @param summary   최근 주간 정산 요약 — 이력이 없으면 null
 */
export function buildServerVaultContainer(
  guildRow: GuildRow,
  summary: GuildSettlementSummary | null,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:server.vault.title', { guildName: guildRow.name })}**`
    )
  )

  const statusLines = [
    t('game:server.vault.balance', { balance: formatBigInt(guildRow.vault) }),
    t('game:server.vault.surcharge', {
      surcharge: (guildRow.taxSurcharge * 100).toFixed(0)
    }),
    // 신뢰도는 #17 에서 실적용 — 현재는 저장값(기본 1000)만 노출하는 자리.
    t('game:server.vault.credit', { credit: guildRow.credit }),
    t('game:server.vault.weeklyDau', { dau: guildRow.weeklyDAU })
  ]
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statusLines.join('\n'))
  )

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${t('game:server.vault.settlement.heading')}`
    )
  )
  if (summary) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:server.vault.settlement.summary', {
          weekUnix: Math.floor(summary.weekStart.getTime() / 1000),
          revenue: formatBigInt(summary.salesRevenue),
          taxPaid: formatBigInt(summary.taxPaid),
          users: summary.userCount
        })
      )
    )
    if (summary.taxDue > summary.taxPaid) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          t('game:server.vault.settlement.unpaid', {
            unpaid: formatBigInt(summary.taxDue - summary.taxPaid)
          })
        )
      )
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:server.vault.settlement.empty')
      )
    )
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${t('game:server.vault.footer')}`)
  )

  return container
}
