/**
 * 파라미터 스윕 (#31 §파라미터 스윕).
 *
 * 기준선 시나리오에서 축을 **하나씩만** 흔들어 인플레율 민감도를 본다.
 * 격자 전탐색(grid search)이 아니라 일변량(one-at-a-time) 스윕인 이유는,
 * 목적이 최적점 탐색이 아니라 "어떤 파라미터가 통화량을 실제로 움직이는가"를
 * 가려내는 것이기 때문이다. 축이 4개인데 전탐색하면 실행 수가 곱으로 늘고
 * 결과는 오히려 읽기 어려워진다.
 */

import { runSimulation } from './engine'
import { summarize } from './metrics'
import type { EconomyParams, SimScenario } from './types'

/** 스윕 축 하나. */
export interface SweepAxis {
  /** 축 이름 — `EconomyParams` 의 키. */
  readonly key: keyof EconomyParams
  /** 사람이 읽는 라벨. */
  readonly label: string
  /** 시험할 값들. */
  readonly values: readonly number[]
}

/** 스윕 한 점의 결과. */
export interface SweepPoint {
  /** 축 이름. */
  readonly axis: keyof EconomyParams
  /** 축 라벨. */
  readonly label: string
  /** 적용한 값. */
  readonly value: number
  /** 기준선 값인지 여부. */
  readonly isBaseline: boolean
  /** 일간 평균 인플레율. */
  readonly averageInflation: number
  /** 소각/발행 비율. */
  readonly sinkRatio: number
  /** 종료 통화량. */
  readonly finalSupply: bigint
  /** 종료 총자산. */
  readonly finalAssets: bigint
  /** 총 발행액. */
  readonly totalMinted: bigint
  /** 총 소각액. */
  readonly totalBurned: bigint
}

/**
 * 기본 스윕 축 정의.
 *
 * 각 축의 가운데 값이 설계 확정값(= `DEFAULT_ECONOMY_PARAMS`)이다.
 *  - `noiseLimit` — docs/design/06-market.md §가격 변동 ±20%
 *  - `demandCoefficient` — 같은 문서 §가격 산출 공식 "k: 예: 0.1"
 *  - `taxSurcharge` — docs/design/07-global-system.md §세율 "가산치 0 ~ +20%p"
 *  - `directBuyMultiplier` — docs/design/04-economy.md §가격 결정 "×2"
 */
export const DEFAULT_SWEEP_AXES: readonly SweepAxis[] = [
  { key: 'noiseLimit', label: '가격 노이즈 폭', values: [0.1, 0.2, 0.3] },
  { key: 'demandCoefficient', label: '수요 계수 k', values: [0.05, 0.1, 0.2] },
  { key: 'taxSurcharge', label: '서버 가산세', values: [0, 0.1, 0.2] },
  { key: 'directBuyMultiplier', label: '직구매 배율', values: [1.5, 2, 3] },
]

/**
 * 기준선 시나리오에서 축별 일변량 스윕을 수행한다.
 *
 * 시드는 기준선 것을 그대로 쓴다 — 같은 난수열 위에서 파라미터만 바꿔야
 * 차이가 파라미터 때문인지 운 때문인지 헷갈리지 않는다.
 *
 * @param baseline 기준선 시나리오
 * @param axes 스윕 축 (생략 시 {@link DEFAULT_SWEEP_AXES})
 * @returns 축 × 값 조합별 결과
 */
export function runSweep(
  baseline: SimScenario,
  axes: readonly SweepAxis[] = DEFAULT_SWEEP_AXES,
): SweepPoint[] {
  const points: SweepPoint[] = []

  for (const axis of axes) {
    for (const value of axis.values) {
      const scenario: SimScenario = {
        ...baseline,
        id: `${baseline.id}-${axis.key}=${value}`,
        params: { ...baseline.params, [axis.key]: value },
      }
      const summary = summarize(runSimulation(scenario))

      points.push({
        axis: axis.key,
        label: axis.label,
        value,
        isBaseline: baseline.params[axis.key] === value,
        averageInflation: summary.averageInflation,
        sinkRatio: summary.sinkRatio,
        finalSupply: summary.finalSupply,
        finalAssets: summary.finalAssets,
        totalMinted: summary.totalMinted,
        totalBurned: summary.totalBurned,
      })
    }
  }

  return points
}

/**
 * 스윕 결과를 마크다운 표로 렌더한다.
 *
 * 기준선 대비 총자산 변화율을 함께 내 민감도를 한눈에 보이게 한다 — 통화량은
 * 재투자 타이밍에 따라 요동치므로 총자산이 더 안정적인 비교 축이다.
 *
 * @param points 스윕 결과
 * @returns 마크다운 표
 */
export function renderSweepTable(points: readonly SweepPoint[]): string {
  const baselineByAxis = new Map<string, SweepPoint>()
  for (const point of points) {
    if (point.isBaseline) baselineByAxis.set(point.axis, point)
  }

  const rows = points.map((point) => {
    const baseline = baselineByAxis.get(point.axis)
    const delta =
      baseline && baseline.finalAssets > 0n
        ? ((Number(point.finalAssets) - Number(baseline.finalAssets)) /
            Number(baseline.finalAssets)) *
          100
        : 0
    const cells = [
      point.label,
      `${point.value}${point.isBaseline ? ' *(기준)*' : ''}`,
      `${(point.averageInflation * 100).toFixed(1)}%`,
      point.sinkRatio.toFixed(2),
      point.finalAssets.toString(),
      `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
    ]
    return `| ${cells.join(' | ')} |`
  })

  return [
    '| 축 | 값 | 일간 인플레 | 소각비 | 종료 총자산 | 기준 대비 |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
  ].join('\n')
}

/**
 * 스윕 결과를 CSV 로 만든다.
 *
 * @param points 스윕 결과
 * @returns CSV 본문
 */
export function sweepCsv(points: readonly SweepPoint[]): string {
  const header = [
    'axis',
    'label',
    'value',
    'is_baseline',
    'average_inflation',
    'sink_ratio',
    'final_supply',
    'final_assets',
    'total_minted',
    'total_burned',
  ].join(',')

  const rows = points.map((point) =>
    [
      point.axis,
      point.label,
      point.value,
      point.isBaseline,
      point.averageInflation.toFixed(6),
      point.sinkRatio.toFixed(4),
      point.finalSupply,
      point.finalAssets,
      point.totalMinted,
      point.totalBurned,
    ].join(','),
  )

  return `${[header, ...rows].join('\n')}\n`
}
