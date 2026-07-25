/**
 * 마크다운 리포트 생성기 (#31 §검증 리포트).
 *
 * 출력은 GitHub Actions job summary(`$GITHUB_STEP_SUMMARY`)에 그대로 붙일 수
 * 있는 마크다운이다. 차트는 mermaid 코드 블록이라 별도 렌더러가 필요 없다.
 *
 * 리포트가 **판단까지 적는다**는 점이 중요하다. 숫자만 던지면 읽는 사람이
 * 매번 설계 문서를 뒤져야 하므로, 목표 미달 항목은 근거 문서 위치와 함께
 * 무엇이 어긋났는지 문장으로 남긴다.
 */

import { GAME_CORE_VERSION } from '../version'
import { inflationChart, mintBurnChart, priceChart, profileAssetChart, supplyChart } from './charts'
import { flowSeries, priceSeries, profileSeries, summarize, supplySeries } from './metrics'
import { renderSweepTable, type SweepPoint } from './sweep'
import { checkSimulated, checkStaticTargets, type TargetCheck } from './targets'
import type { SimResult } from './types'

/** 리포트 헤더에 박을 실행 메타데이터. */
export interface ReportMeta {
  /** git 브랜치명. */
  readonly branch?: string
  /** git 커밋 해시 (짧은 형식 권장). */
  readonly commit?: string
  /** 생성 시각 ISO 문자열 — 호출자가 주입한다(순수성 유지). */
  readonly generatedAt?: string
  /** 아티팩트 파일명 규약 `[브랜치]-[커밋]`. */
  readonly artifactName?: string
}

/** 천 단위 구분 기호를 넣는다 (로캘 비의존). */
function comma(value: bigint | number): string {
  const text = typeof value === 'bigint' ? value.toString() : Math.round(value).toString()
  const negative = text.startsWith('-')
  const digits = negative ? text.slice(1) : text
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return negative ? `-${grouped}` : grouped
}

/** 판정 아이콘. */
function verdict(pass: boolean): string {
  return pass ? '✅' : '❌'
}

/** 목표치 검증 표를 만든다. */
function targetTable(checks: readonly TargetCheck[]): string {
  const rows = checks.map(
    (check) =>
      `| ${verdict(check.pass)} | ${check.label} | ${check.target} | **${check.actual}** | ${check.source} |`,
  )
  return ['| 판정 | 항목 | 목표 | 실측 | 근거 |', '| --- | --- | --- | --- | --- |', ...rows].join(
    '\n',
  )
}

/** 미달 항목의 설명을 목록으로 만든다. */
function failureNotes(checks: readonly TargetCheck[]): string {
  const failures = checks.filter((check) => !check.pass && check.note)
  if (failures.length === 0) return ''
  return failures.map((check) => `- **${check.label}** — ${check.note}`).join('\n')
}

/** 시나리오별 요약 표. */
function summaryTable(results: readonly SimResult[]): string {
  const rows = results.map((result) => {
    const s = summarize(result)
    const t2 = s.tierReach.find((tier) => tier.level === 5)
    const t3 = s.tierReach.find((tier) => tier.level === 10)
    const cells = [
      `\`${s.scenarioId}\``,
      `${s.userCount}명`,
      `${s.days}일`,
      comma(s.totalMinted),
      comma(s.totalBurned),
      s.sinkRatio.toFixed(2),
      comma(s.finalSupply),
      comma(s.finalAssets),
      s.averageLevel.toFixed(1),
      String(t2?.firstReachedTick ?? '—'),
      String(t3?.firstReachedTick ?? '—'),
    ]
    return `| ${cells.join(' | ')} |`
  })
  return [
    '| 시나리오 | 유저 | 기간 | 발행 | 소각 | 소각비 | 종료 통화량 | 종료 총자산 | 평균 Lv | T2 tick | T3 tick |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n')
}

/** 소각 원인 분해 표. */
function burnTable(results: readonly SimResult[]): string {
  const rows = results.map((result) => {
    const { burns } = result
    const total =
      burns.weeklyTax + burns.listingTax + burns.directBuy + burns.construction + burns.warehouse
    const share = (value: bigint): string =>
      total > 0n ? `${((Number(value) / Number(total)) * 100).toFixed(1)}%` : '—'
    const cells = [
      `\`${result.scenario.id}\``,
      `${comma(burns.weeklyTax)} (${share(burns.weeklyTax)})`,
      `${comma(burns.listingTax)} (${share(burns.listingTax)})`,
      `${comma(burns.directBuy)} (${share(burns.directBuy)})`,
      `${comma(burns.construction)} (${share(burns.construction)})`,
      `${comma(burns.warehouse)} (${share(burns.warehouse)})`,
    ]
    return `| ${cells.join(' | ')} |`
  })
  return [
    '| 시나리오 | 주간 자산세 | 상점 세율 | 직구매 | 공장 건설·업글 | 창고 업글 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n')
}

/** 티어 도달 표. */
function tierTable(results: readonly SimResult[]): string {
  const rows = profileSeries(results).map((line) => {
    const toTime = (tick: number | null): string =>
      tick === null ? '미도달' : `tick ${tick} (${(tick / 6).toFixed(1)}시간)`
    return `| ${line.kind} | ${toTime(line.tier2Tick)} | ${toTime(line.tier3Tick)} |`
  })
  if (rows.length === 0) return '_프로파일 단독 시나리오가 없습니다._'
  return ['| 프로파일 | T2 해금(Lv.5) | T3 해금(Lv.10) |', '| --- | --- | --- |', ...rows].join(
    '\n',
  )
}

/**
 * 대표 시나리오를 고른다 — 차트는 하나의 시나리오만 그린다.
 *
 * 유저 수가 가장 많은 것을 고르되, 동률이면 기간이 긴 쪽을 쓴다. 다인·장기
 * 시나리오가 유저 상점 거래와 장기 인플레 추세를 모두 담기 때문이다.
 */
function pickFeatured(results: readonly SimResult[]): SimResult | null {
  if (results.length === 0) return null
  return [...results].sort((a, b) => {
    const users = b.scenario.userCount - a.scenario.userCount
    return users !== 0 ? users : b.scenario.days - a.scenario.days
  })[0]!
}

/**
 * 시뮬레이션 결과들로 마크다운 리포트를 만든다.
 *
 * @param results 시나리오별 시뮬레이션 결과 (하나 이상)
 * @param meta 브랜치·커밋·생성 시각 등 실행 메타데이터
 * @param sweep 파라미터 스윕 결과 (있으면 민감도 절을 추가한다)
 * @returns GitHub 마크다운 문자열
 */
export function renderReport(
  results: readonly SimResult[],
  meta: ReportMeta = {},
  sweep: readonly SweepPoint[] = [],
): string {
  const staticChecks = checkStaticTargets()
  const featured = pickFeatured(results)
  const simChecks = featured ? checkSimulated(featured) : []
  const allChecks = [...staticChecks, ...simChecks]
  const passed = allChecks.filter((check) => check.pass).length

  const lines: string[] = []

  lines.push('# 경제 밸런스 시뮬레이션 리포트')
  lines.push('')
  lines.push(
    `> game-core \`${GAME_CORE_VERSION}\` · 시나리오 ${results.length}건 · 검증 **${passed}/${allChecks.length}** 통과`,
  )
  lines.push('')

  const metaRows: string[] = []
  if (meta.branch) metaRows.push(`- **브랜치**: \`${meta.branch}\``)
  if (meta.commit) metaRows.push(`- **커밋**: \`${meta.commit}\``)
  if (meta.generatedAt) metaRows.push(`- **생성 시각**: ${meta.generatedAt}`)
  if (meta.artifactName) metaRows.push(`- **아티팩트**: \`${meta.artifactName}\``)
  if (metaRows.length > 0) {
    lines.push(...metaRows, '')
  }

  lines.push('## 1. 설계 목표치 검증')
  lines.push('')
  lines.push(targetTable(allChecks))
  lines.push('')

  const notes = failureNotes(allChecks)
  if (notes) {
    lines.push('### 미달 항목 해설')
    lines.push('')
    lines.push(notes)
    lines.push('')
  }

  if (featured) {
    const title = featured.scenario.id
    lines.push('## 2. 시각화')
    lines.push('')
    lines.push(
      `대표 시나리오: \`${title}\` (유저 ${featured.scenario.userCount}명 · ${featured.scenario.days}일)`,
    )
    lines.push('')
    lines.push('### 2.1 통화 총량과 총자산')
    lines.push('')
    lines.push(supplyChart(supplySeries(featured), title))
    lines.push('')
    lines.push('### 2.2 일간 통화량 증가율')
    lines.push('')
    lines.push(inflationChart(supplySeries(featured), title))
    lines.push('')
    lines.push('### 2.3 일간 발행 vs 소각')
    lines.push('')
    lines.push(mintBurnChart(flowSeries(featured), title))
    lines.push('')
    lines.push('### 2.4 자재별 가격 궤적')
    lines.push('')
    lines.push(priceChart(priceSeries(featured), title))
    lines.push('')
    lines.push('### 2.5 프로파일별 자산 곡선')
    lines.push('')
    lines.push(profileAssetChart(profileSeries(results)))
    lines.push('')
    lines.push(tierTable(results))
    lines.push('')
  }

  lines.push('## 3. 시나리오별 요약')
  lines.push('')
  lines.push(summaryTable(results))
  lines.push('')
  lines.push('## 4. 통화 소각 분해')
  lines.push('')
  lines.push(burnTable(results))
  lines.push('')

  if (sweep.length > 0) {
    lines.push('## 5. 파라미터 민감도 스윕')
    lines.push('')
    lines.push('기준선에서 축을 하나씩만 흔든 결과다 (같은 시드 위에서 비교).')
    lines.push('')
    lines.push(renderSweepTable(sweep))
    lines.push('')
  }

  lines.push(MODEL_LIMITS)
  lines.push('')

  return lines.join('\n')
}

/**
 * 모델 한계 고지문.
 *
 * 시뮬레이터 결과로 설계를 바꾸기 전에 반드시 읽어야 할 괴리 목록이다.
 * 여기 적히지 않은 괴리를 발견하면 이 문서를 먼저 갱신할 것.
 */
export const MODEL_LIMITS = `## 모델 한계 (결과 해석 전 필독)

이 시뮬레이터는 game-core 순수 함수만 조립한다. 아래 요소는 **모사되지 않으므로**
실제 런타임과 결과가 벌어질 수 있다.

| 미반영 요소 | 영향 방향 | 비고 |
| --- | --- | --- |
| 토지 인접 시너지 (최대 +30%) | 수익 **과소** 추정 | 좌표 배치를 모사하지 않아 \`synergyBonus\`=1.0 고정 (docs/design/11-land.md) |
| 특수 슬롯 보너스 | 수익 **과소** 추정 | \`slotBonus\`=1.0 고정 |
| 토지 확장 | 성장 **과소** 추정 | 초기 3×3 고정, \`land/expansion.ts\` 미사용 |
| 업그레이드·원료 부스터 | 수익 **과소** 추정 | RARE 드롭·SPEED/PROFIT/SAVING 미적용 |
| 튜토리얼 퀘스트 보상 (총 5,000원) | 초반 성장 **과소** 추정 | 씨드머니 1,000원만 지급 |
| 주식·배당·신용도 | 통화량 추정 오차 | \`stock/*\`, \`credit/*\` 경로 미모사 |
| 유저 상점 등록 한도·가격 밴드 | 거래량 **과대** 추정 | 현재가로 즉시 체결되는 것으로 근사 |
| 서버 금고·월간 재분배 | 소각 **과대** 추정 | 징수액을 전부 소각으로 계상 (실제로는 일부가 금고로 이동) |

또한 유저 행동은 "합리적 플레이어" 휴리스틱이다 — 실제 플레이어는 이보다
비효율적으로 움직이므로 성장 속도는 **상한**으로 읽어야 한다.

### net/gross 정합 (#16 이월 논점)

주간 세금 과세 베이스를 런타임과 동일하게 **gross(총 판매액)** 로 잡았다
(\`apps/bot/src/services/weeklySettlement.ts\` 헤더 주석 참조). 유저 상점 판매는
등록 세율을 이미 뗀 net 이 유저에게 들어오는데 과세는 gross 로 이뤄지므로,
상점 경로 판매분은 **이중과세에 가까운 구조**다. 이 구조를 유지할지는 설계
결정 사항이며, 시뮬레이터는 현행 구현을 그대로 재현했을 뿐이다.`
