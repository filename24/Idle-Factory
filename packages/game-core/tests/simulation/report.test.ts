/**
 * 리포트·차트·CSV·스윕(`src/simulation/{report,charts,csv,sweep,artifact}.ts`)
 * 단위 테스트.
 *
 * 검증 축:
 *  - 마크다운 표의 열 수가 헤더와 일치하는지 (깨진 표는 GitHub 에서 통째로
 *    렌더되지 않는다)
 *  - mermaid 블록이 문법 형태를 갖추는지
 *  - 아티팩트 이름 규칙 `[브랜치]-[커밋]`
 *  - CSV 헤더·행 폭 일치
 */

import { describe, expect, it } from 'vitest'
import {
  artifactName,
  buildScenario,
  dailyCsv,
  exportCsvFiles,
  flowSeries,
  inflationChart,
  MODEL_LIMITS,
  priceChart,
  priceSeries,
  profileAssetChart,
  profileSeries,
  renderReport,
  renderSweepTable,
  runSimulation,
  runSweep,
  sanitizeBranch,
  summaryCsv,
  supplyChart,
  supplySeries,
  sweepCsv,
  targetsCsv,
  type SimResult,
} from '../../src'

/** 테스트용 결과 묶음 — 프로파일 단독 3건 + 혼합 1건. */
function makeResults(): SimResult[] {
  const singles = (['HARDCORE', 'CASUAL', 'IDLE'] as const).map((kind) =>
    runSimulation(buildScenario({ userCount: 1, days: 3, profiles: [kind] })),
  )
  return [...singles, runSimulation(buildScenario({ userCount: 5, days: 3 }))]
}

/** 마크다운 표에서 파이프 구분 열 수를 센다. */
function columnCount(row: string): number {
  return row.split('|').length
}

/**
 * CSV 한 줄을 셀로 나눈다 (RFC4180 최소 구현).
 *
 * `split(',')` 로는 따옴표 안의 쉼표를 잘못 자르고, 정규식 매칭으로는 줄 끝의
 * 빈 셀을 놓친다 — 둘 다 이 테스트가 잡아야 할 결함을 못 잡게 만든다.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

describe('artifactName', () => {
  it('브랜치의 슬래시를 하이픈으로 바꾼다', () => {
    expect(artifactName('feat/economy-sim', 'abc1234')).toBe('feat-economy-sim-abc1234')
  })

  it('커밋 해시를 7자로 줄인다', () => {
    expect(artifactName('main', '0123456789abcdef')).toBe('main-0123456')
  })

  it('중첩 슬래시·공백·연속 하이픈을 하나로 접는다', () => {
    expect(sanitizeBranch('feat//a b--c')).toBe('feat-a-b-c')
  })

  it('빈 브랜치명은 unknown 으로 대체한다', () => {
    expect(artifactName('', 'abc1234')).toBe('unknown-abc1234')
    expect(artifactName('///', 'abc1234')).toBe('unknown-abc1234')
  })
})

describe('renderReport', () => {
  const results = makeResults()
  const report = renderReport(results, {
    branch: 'feat/x',
    commit: 'abc1234',
    generatedAt: '2026-07-25T00:00:00.000Z',
    artifactName: 'feat-x-abc1234',
  })

  it('메타데이터를 헤더에 싣는다', () => {
    expect(report).toContain('feat/x')
    expect(report).toContain('abc1234')
    expect(report).toContain('feat-x-abc1234')
  })

  it('mermaid 차트 블록을 5개 포함한다 (통화량·인플레·발행소각·가격·프로파일)', () => {
    const blocks = report.match(/```mermaid/g) ?? []
    expect(blocks).toHaveLength(5)
    expect(report).toContain('xychart-beta')
  })

  it('모든 표의 행 열 수가 헤더와 일치한다', () => {
    const lines = report.split('\n')
    let header: string | null = null
    for (const line of lines) {
      if (!line.startsWith('|')) {
        header = null
        continue
      }
      if (header === null) {
        header = line
        continue
      }
      // 구분선 행은 건너뛴다.
      if (/^\|[\s:-]+\|$/.test(line.replace(/\s/g, ''))) continue
      expect(columnCount(line), `열 수 불일치: ${line}`).toBe(columnCount(header))
    }
  })

  it('모델 한계 고지를 포함한다', () => {
    expect(report).toContain(MODEL_LIMITS.split('\n')[0]!)
    expect(report).toContain('토지 인접 시너지')
  })

  it('섹션 제목이 중복되지 않는다', () => {
    const headings = (report.match(/^## .+$/gm) ?? []).map((line) => line.trim())
    expect(new Set(headings).size).toBe(headings.length)
  })

  it('featuredScenarioId 로 차트 대상 시나리오를 지정할 수 있다', () => {
    // CLI/CI 입력(--users, --days)이 리포트에 반영되는 경로. 지정이 없으면
    // 고정 매트릭스 중 유저 수가 가장 많은 것이 뽑혀 입력이 무시된 것처럼 보인다.
    const target = results.find((result) => result.scenario.profiles.length === 1)!
    const rendered = renderReport(results, { featuredScenarioId: target.scenario.id })
    expect(rendered).toContain(`대표 시나리오: \`${target.scenario.id}\``)
  })

  it('featuredScenarioId 가 없으면 유저 수가 가장 많은 시나리오를 고른다', () => {
    const rendered = renderReport(results)
    const biggest = [...results].sort((a, b) => b.scenario.userCount - a.scenario.userCount)[0]!
    expect(rendered).toContain(`대표 시나리오: \`${biggest.scenario.id}\``)
  })

  it('존재하지 않는 featuredScenarioId 는 기본 선택으로 대체된다', () => {
    const rendered = renderReport(results, { featuredScenarioId: 'nope' })
    expect(rendered).toContain('대표 시나리오:')
    expect(rendered).not.toContain('`nope`')
  })

  it('runParams 를 헤더에 남긴다', () => {
    const rendered = renderReport(results, { runParams: '유저 42명 · 3일 · 스윕 ON' })
    expect(rendered).toContain('**실행 파라미터**: 유저 42명 · 3일 · 스윕 ON')
  })

  it('스윕 결과를 주면 민감도 절이 붙는다', () => {
    const sweep = runSweep(buildScenario({ userCount: 2, days: 1 }), [
      { key: 'taxSurcharge', label: '서버 가산세', values: [0, 0.2] },
    ])
    const withSweep = renderReport(results, {}, sweep)
    expect(withSweep).toContain('파라미터 민감도 스윕')
    expect(withSweep).toContain('서버 가산세')
  })
})

describe('차트 생성기', () => {
  const result = runSimulation(buildScenario({ userCount: 3, days: 3 }))

  it('통화량 차트의 y축 하한이 음수로 내려가지 않는다 (값이 전부 양수일 때)', () => {
    const chart = supplyChart(supplySeries(result), 'test')
    const axis = /y-axis "천원" (-?\d+) --> /.exec(chart)
    expect(axis).not.toBeNull()
    expect(Number(axis![1])).toBeGreaterThanOrEqual(0)
  })

  it('인플레율 차트는 음수 축을 허용한다', () => {
    const chart = inflationChart(supplySeries(result), 'test')
    expect(chart).toContain('xychart-beta')
    expect(chart).toContain('bar ')
  })

  it('가격 차트가 계열 순서를 제목에 적는다 (mermaid 는 범례가 없다)', () => {
    const chart = priceChart(priceSeries(result, ['GRAIN', 'ORE'], 10), 'test')
    expect(chart).toContain('계열 순서: GRAIN / ORE')
  })

  it('프로파일 곡선이 없으면 안내 문구를 낸다', () => {
    expect(profileAssetChart([])).toContain('시나리오가 없습니다')
  })

  it('프로파일 곡선이 있으면 계열 순서를 적는다', () => {
    const singles = (['HARDCORE', 'IDLE'] as const).map((kind) =>
      runSimulation(buildScenario({ userCount: 1, days: 2, profiles: [kind] })),
    )
    const chart = profileAssetChart(profileSeries(singles))
    expect(chart).toContain('HARDCORE / IDLE')
  })
})

describe('CSV 내보내기', () => {
  const results = makeResults()

  it('5개 파일을 낸다', () => {
    const files = exportCsvFiles(results)
    expect(files.map((file) => file.name)).toEqual([
      'summary.csv',
      'daily.csv',
      'prices.csv',
      'flows.csv',
      'targets.csv',
    ])
  })

  it('모든 행의 열 수가 헤더와 같다', () => {
    for (const file of exportCsvFiles(results)) {
      const lines = file.content.trim().split('\n')
      const width = splitCsvLine(lines[0]!).length
      for (const line of lines.slice(1)) {
        expect(splitCsvLine(line).length, `${file.name}: ${line}`).toBe(width)
      }
    }
  })

  it('summary.csv 가 시나리오 수만큼 행을 낸다', () => {
    const lines = summaryCsv(results).content.trim().split('\n')
    expect(lines).toHaveLength(results.length + 1)
  })

  it('daily.csv 가 시나리오×일수만큼 행을 낸다', () => {
    const expected = results.reduce((sum, result) => sum + result.daily.length, 0)
    expect(dailyCsv(results).content.trim().split('\n')).toHaveLength(expected + 1)
  })

  it('targets.csv 에 각 항목의 근거 문서가 들어간다', () => {
    const content = targetsCsv(results).content
    expect(content).toContain('#21 결정 3')
    expect(content).toContain('#21 결정 2')
    expect(content).toContain('docs/design/05-warehouse.md')
  })
})

describe('파라미터 스윕', () => {
  const baseline = buildScenario({ userCount: 3, days: 2 })
  const sweep = runSweep(baseline, [
    { key: 'taxSurcharge', label: '서버 가산세', values: [0, 0.1, 0.2] },
  ])

  it('축의 값 수만큼 결과를 낸다', () => {
    expect(sweep).toHaveLength(3)
  })

  it('기준선 값 하나만 isBaseline 이다', () => {
    expect(sweep.filter((point) => point.isBaseline)).toHaveLength(1)
    expect(sweep.find((point) => point.isBaseline)?.value).toBe(0)
  })

  it('가산세를 올리면 소각이 늘어 총자산이 줄어든다', () => {
    const low = sweep.find((point) => point.value === 0)!
    const high = sweep.find((point) => point.value === 0.2)!
    expect(high.totalBurned).toBeGreaterThanOrEqual(low.totalBurned)
  })

  it('표와 CSV 를 렌더한다', () => {
    expect(renderSweepTable(sweep)).toContain('서버 가산세')
    expect(sweepCsv(sweep).trim().split('\n')).toHaveLength(4)
  })
})

describe('flowSeries 회귀', () => {
  it('일간 발행/소각 합이 tick 합과 일치한다', () => {
    const result = runSimulation(buildScenario({ userCount: 3, days: 3 }))
    const daily = flowSeries(result)
    const dailyMinted = daily.reduce((sum, point) => sum + point.minted, 0n)
    const tickMinted = result.flows.reduce((sum, flow) => sum + flow.minted, 0n)
    expect(dailyMinted).toBe(tickMinted)
  })
})
