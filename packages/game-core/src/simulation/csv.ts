/**
 * CSV 내보내기 (#31 §실행 형태 — 스윕 결과 md/csv 출력).
 *
 * 리포트가 "읽는 산출물"이라면 CSV 는 "다시 계산하는 산출물"이다. 스프레드시트나
 * 노트북으로 다시 돌려 볼 수 있도록 원시 시계열을 그대로 낸다 — 차트가 솎아낸
 * 표본이 아니라 전체 해상도다.
 *
 * BigInt 는 문자열로 쓴다. 정수 그대로 보존되며 스프레드시트가 수치로 읽는다.
 */

import { summarize } from './metrics'
import { checkSimulated, checkStaticTargets } from './targets'
import type { SimResult } from './types'

/** 생성된 CSV 파일 하나. */
export interface CsvFile {
  /** 파일명 (확장자 포함). */
  readonly name: string
  /** 파일 본문. */
  readonly content: string
}

/** CSV 셀 이스케이프 — 쉼표·따옴표·개행이 있으면 따옴표로 감싼다. */
function cell(value: string | number | bigint | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** 행 배열을 CSV 본문으로 만든다. */
function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header.join(',')]
  for (const row of rows) lines.push(row.map((value) => cell(value as string)).join(','))
  return `${lines.join('\n')}\n`
}

/**
 * 일간 시계열 CSV — 시나리오별 하루 단위 지표.
 *
 * @param results 시뮬레이션 결과들
 * @returns CSV 파일
 */
export function dailyCsv(results: readonly SimResult[]): CsvFile {
  const rows: unknown[][] = []
  for (const result of results) {
    for (const day of result.daily) {
      rows.push([
        result.scenario.id,
        day.day,
        day.minted,
        day.burned,
        day.moneySupply,
        day.totalAssets,
        day.inflationRate.toFixed(6),
        day.averageLevel.toFixed(2),
      ])
    }
  }
  return {
    name: 'daily.csv',
    content: toCsv(
      [
        'scenario',
        'day',
        'minted',
        'burned',
        'money_supply',
        'total_assets',
        'inflation_rate',
        'average_level',
      ],
      rows,
    ),
  }
}

/**
 * 가격 궤적 CSV — 30분 가격 tick 전체 해상도.
 *
 * @param results 시뮬레이션 결과들
 * @returns CSV 파일
 */
export function priceCsv(results: readonly SimResult[]): CsvFile {
  const rows: unknown[][] = []
  for (const result of results) {
    for (const sample of result.priceTrail) {
      for (const [material, price] of Object.entries(sample.prices)) {
        const base = result.market.get(material as never)?.basePrice ?? 0n
        rows.push([
          result.scenario.id,
          sample.tick,
          material,
          price,
          base,
          base > 0n ? ((Number(price) / Number(base)) * 100).toFixed(2) : '',
        ])
      }
    }
  }
  return {
    name: 'prices.csv',
    content: toCsv(
      ['scenario', 'tick', 'material', 'price', 'base_price', 'percent_of_base'],
      rows,
    ),
  }
}

/**
 * tick 단위 화폐 흐름 CSV — 가장 큰 파일이므로 필요할 때만 쓴다.
 *
 * @param results 시뮬레이션 결과들
 * @returns CSV 파일
 */
export function flowCsv(results: readonly SimResult[]): CsvFile {
  const rows: unknown[][] = []
  for (const result of results) {
    for (const flow of result.flows) {
      // 아무 일도 없던 tick 은 생략해 파일 크기를 줄인다 — 통화량은 직전 tick 과 같다.
      if (flow.minted === 0n && flow.burned === 0n) continue
      rows.push([result.scenario.id, flow.tick, flow.minted, flow.burned, flow.moneySupply])
    }
  }
  return {
    name: 'flows.csv',
    content: toCsv(['scenario', 'tick', 'minted', 'burned', 'money_supply'], rows),
  }
}

/**
 * 시나리오 요약 CSV.
 *
 * @param results 시뮬레이션 결과들
 * @returns CSV 파일
 */
export function summaryCsv(results: readonly SimResult[]): CsvFile {
  const rows = results.map((result) => {
    const s = summarize(result)
    return [
      s.scenarioId,
      s.userCount,
      s.days,
      result.scenario.seed,
      s.seedMoney,
      s.totalMinted,
      s.totalBurned,
      s.sinkRatio.toFixed(4),
      s.finalSupply,
      s.finalAssets,
      s.averageLevel.toFixed(2),
      s.averageInflation.toFixed(6),
      result.productionTicks,
      s.burns.weeklyTax,
      s.burns.listingTax,
      s.burns.directBuy,
      s.burns.construction,
      s.burns.warehouse,
      s.tierReach.find((tier) => tier.level === 5)?.firstReachedTick ?? '',
      s.tierReach.find((tier) => tier.level === 10)?.firstReachedTick ?? '',
    ]
  })
  return {
    name: 'summary.csv',
    content: toCsv(
      [
        'scenario',
        'users',
        'days',
        'seed',
        'seed_money',
        'total_minted',
        'total_burned',
        'sink_ratio',
        'final_supply',
        'final_assets',
        'average_level',
        'average_inflation',
        'production_ticks',
        'burn_weekly_tax',
        'burn_listing_tax',
        'burn_direct_buy',
        'burn_construction',
        'burn_warehouse',
        'tier2_first_tick',
        'tier3_first_tick',
      ],
      rows,
    ),
  }
}

/**
 * 목표치 검증 결과 CSV.
 *
 * @param results 시뮬레이션 결과들 (대표 하나로 실측 검증을 수행)
 * @returns CSV 파일
 */
export function targetsCsv(results: readonly SimResult[]): CsvFile {
  const checks = [...checkStaticTargets()]
  if (results.length > 0) checks.push(...checkSimulated(results[0]!))

  return {
    name: 'targets.csv',
    content: toCsv(
      ['id', 'label', 'target', 'actual', 'pass', 'source', 'note'],
      checks.map((check) => [
        check.id,
        check.label,
        check.target,
        check.actual,
        check.pass,
        check.source,
        check.note ?? '',
      ]),
    ),
  }
}

/**
 * 전 CSV 를 한 번에 생성한다.
 *
 * @param results 시뮬레이션 결과들
 * @returns CSV 파일 목록
 */
export function exportCsvFiles(results: readonly SimResult[]): CsvFile[] {
  return [
    summaryCsv(results),
    dailyCsv(results),
    priceCsv(results),
    flowCsv(results),
    targetsCsv(results),
  ]
}
