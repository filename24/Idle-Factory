/**
 * Mermaid 차트 생성기 (#31 §시각화).
 *
 * GitHub 은 마크다운 안의 ```mermaid 블록을 그대로 렌더하므로, Actions job
 * summary·PR 코멘트·저장소 문서 어디에 붙여도 별도 뷰어 없이 그림이 보인다.
 * `xychart-beta` 는 **범례를 지원하지 않기 때문에** 계열 순서를 반드시 제목에
 * 적어 둔다 — 색만 다르고 이름이 없으면 읽을 수 없는 차트가 된다.
 *
 * 숫자는 전부 `Number` 로 낮춰 출력한다. 화폐가 2^53 을 넘길 만큼 커지면
 * 정밀도가 깨지지만, 차트는 표시용이고 정확한 값은 CSV·표에서 읽는다.
 */

import type { FlowPoint, PriceSeries, ProfileSeries, SupplyPoint } from './metrics'

/** 차트 y 축 여유 비율 — 곡선이 축에 붙어 보이지 않게 위아래로 벌린다. */
const AXIS_PADDING = 0.1

/** mermaid 블록으로 감싼다. */
function mermaidBlock(body: string): string {
  return ['```mermaid', body, '```'].join('\n')
}

/** 숫자 배열을 mermaid 리터럴로 만든다 (소수 2자리 절사). */
function numberList(values: readonly number[]): string {
  return `[${values.map((value) => Number(value.toFixed(2))).join(', ')}]`
}

/**
 * y 축 범위를 계산한다.
 *
 * 전 계열이 같은 값(예: 전부 0)이면 축이 0 폭이 되어 mermaid 가 그리지 못하므로
 * 최소 폭 1 을 보장한다.
 */
function axisRange(values: readonly number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  if (rawMin === rawMax) return { min: rawMin - 1, max: rawMax + 1 }

  const pad = (rawMax - rawMin) * AXIS_PADDING
  // 데이터가 전부 0 이상이면 축을 음수로 내리지 않는다 — 통화량 차트에 음수
  // 눈금이 찍히면 "화폐가 마이너스였다"로 오독된다. 인플레율처럼 실제로 음수가
  // 나오는 계열은 rawMin 이 음수이므로 이 클램프에 걸리지 않는다.
  const min = rawMin >= 0 ? Math.max(0, Math.floor(rawMin - pad)) : Math.floor(rawMin - pad)
  return { min, max: Math.ceil(rawMax + pad) }
}

/**
 * 통화 총량·총자산 추이 차트.
 *
 * 통화량(현금)과 총자산을 함께 그린다 — 재투자 성향이 강한 프로파일은 현금을
 * 즉시 공장으로 바꿔 버려 통화량만 보면 경제가 죽은 것처럼 보이기 때문이다.
 * 단위는 천원(K)으로 낮춘다.
 *
 * @param points 일간 통화량 시계열
 * @param title 차트 제목 (시나리오 식별용)
 * @returns mermaid 코드 블록
 */
export function supplyChart(points: readonly SupplyPoint[], title: string): string {
  const supply = points.map((point) => Number(point.supply) / 1_000)
  const assets = points.map((point) => Number(point.assets) / 1_000)
  const { min, max } = axisRange([...supply, ...assets])

  return mermaidBlock(
    [
      'xychart-beta',
      `    title "${title} · 통화량(1선)과 총자산(2선), 천원"`,
      `    x-axis "일차" ${numberList(points.map((point) => point.day))}`,
      `    y-axis "천원" ${min} --> ${max}`,
      `    line ${numberList(supply)}`,
      `    line ${numberList(assets)}`,
    ].join('\n'),
  )
}

/**
 * 일간 인플레율 차트 (막대).
 *
 * 통화량 증가율이므로 재투자로 현금이 빠지면 음수가 나온다 — 통화가 사라진
 * 것이 아니라 공장으로 바뀐 것이다.
 *
 * @param points 일간 통화량 시계열
 * @param title 차트 제목
 * @returns mermaid 코드 블록
 */
export function inflationChart(points: readonly SupplyPoint[], title: string): string {
  const values = points.map((point) => point.inflationPercent)
  const { min, max } = axisRange(values)

  return mermaidBlock(
    [
      'xychart-beta',
      `    title "${title} · 일간 통화량 증가율(%)"`,
      `    x-axis "일차" ${numberList(points.map((point) => point.day))}`,
      `    y-axis "%" ${min} --> ${max}`,
      `    bar ${numberList(values)}`,
      `    line ${numberList(values)}`,
    ].join('\n'),
  )
}

/**
 * 일간 발행 vs 소각 차트.
 *
 * 1선 = 발행(글로벌 판매 대금), 2선 = 소각(세금·수수료·직구매·건설비).
 * 두 선이 붙어 있으면 싱크가 발행을 따라잡고 있다는 뜻이다.
 *
 * @param points 일간 발행/소각 시계열
 * @param title 차트 제목
 * @returns mermaid 코드 블록
 */
export function mintBurnChart(points: readonly FlowPoint[], title: string): string {
  const minted = points.map((point) => Number(point.minted) / 1_000)
  const burned = points.map((point) => Number(point.burned) / 1_000)
  const { min, max } = axisRange([...minted, ...burned])

  return mermaidBlock(
    [
      'xychart-beta',
      `    title "${title} · 발행(1선) vs 소각(2선), 천원"`,
      `    x-axis "일차" ${numberList(points.map((point) => point.day))}`,
      `    y-axis "천원" ${min} --> ${max}`,
      `    line ${numberList(minted)}`,
      `    line ${numberList(burned)}`,
    ].join('\n'),
  )
}

/**
 * 자재별 가격 궤적 차트.
 *
 * 계열 순서를 제목에 명시한다(범례 미지원). 기준가가 자재마다 달라
 * (곡물 10 ~ 원유 50) 절대값을 같이 그리면 저가 자재의 진동이 안 보이므로,
 * **기준가 대비 백분율**로 정규화한다 — 70~200% clamp 도 눈으로 확인된다
 * (docs/design/06-market.md §가격 변동).
 *
 * @param series 자재별 가격 시계열
 * @param title 차트 제목
 * @returns mermaid 코드 블록
 */
export function priceChart(series: readonly PriceSeries[], title: string): string {
  if (series.length === 0 || series[0]!.points.length === 0) {
    return '_가격 표본이 없습니다._'
  }

  const order = series.map((line) => line.material).join(' / ')
  const normalized = series.map((line) =>
    line.points.map((point) =>
      line.basePrice > 0n ? (Number(point.price) / Number(line.basePrice)) * 100 : 0,
    ),
  )
  const { min, max } = axisRange(normalized.flat())

  return mermaidBlock(
    [
      'xychart-beta',
      `    title "${title} · 기준가 대비 시세(%) — 계열 순서: ${order}"`,
      `    x-axis "가격 tick(30분)" ${numberList(series[0]!.points.map((_, index) => index))}`,
      `    y-axis "기준가 대비 %" ${min} --> ${max}`,
      ...normalized.map((values) => `    line ${numberList(values)}`),
    ].join('\n'),
  )
}

/**
 * 프로파일별 총자산 곡선 차트.
 *
 * @param series 프로파일별 자산 곡선
 * @returns mermaid 코드 블록
 */
export function profileAssetChart(series: readonly ProfileSeries[]): string {
  if (series.length === 0) return '_프로파일 단독 시나리오가 없습니다._'

  const order = series.map((line) => line.kind).join(' / ')
  const scaled = series.map((line) => line.assets.map((value) => Number(value) / 1_000))
  const days = Math.max(...series.map((line) => line.assets.length))
  const { min, max } = axisRange(scaled.flat())

  return mermaidBlock(
    [
      'xychart-beta',
      `    title "프로파일별 총자산(천원) — 계열 순서: ${order}"`,
      `    x-axis "일차" ${numberList(Array.from({ length: days }, (_, index) => index + 1))}`,
      `    y-axis "천원" ${min} --> ${max}`,
      ...scaled.map((values) => `    line ${numberList(values)}`),
    ].join('\n'),
  )
}
