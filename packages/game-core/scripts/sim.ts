/**
 * 경제 밸런스 시뮬레이터 실행 스크립트 (#31 §실행 형태).
 *
 * `pnpm --filter @idle/game-core sim` 으로 표준 시나리오를 돌려 마크다운
 * 리포트와 CSV 를 파일로 떨군다. CI 는 이 산출물을 job summary 에 붙이고
 * 아티팩트로 업로드한다.
 *
 * 이 파일은 `src/` 밖에 있다 — game-core 는 런타임 의존성이 0 인 순수 패키지라
 * `node:fs` 같은 I/O 를 src 에 넣을 수 없기 때문이다. tsup 빌드 대상도 src 뿐이라
 * 이 스크립트는 번들에 포함되지 않는다.
 *
 * 사용법:
 *   tsx scripts/sim.ts [--out <dir>] [--sweep] [--users <n>] [--days <n>]
 *
 *   --out    산출물 디렉터리 (기본: .sim-output)
 *   --sweep  파라미터 민감도 스윕을 함께 수행 (실행 시간이 늘어난다)
 *   --users  기준선 시나리오 유저 수 (기본: 10)
 *   --days   기준선 시나리오 기간 (기본: 7)
 */

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  artifactName,
  buildScenario,
  exportCsvFiles,
  renderReport,
  runSimulation,
  runSweep,
  standardScenarios,
  summarize,
  sweepCsv,
  type ReportMeta,
  type SimResult,
  type SweepPoint,
} from '../src'

/** 파싱된 CLI 인자. */
interface CliOptions {
  readonly outDir: string
  readonly sweep: boolean
  readonly users: number
  readonly days: number
}

/**
 * 유저 수 상한.
 *
 * 실행 시간은 유저 수에 선형으로 늘어난다(구매자 매칭을 표본 추출로 바꾼 뒤).
 * 1,000명 × 60일이 약 53초이므로 이 상한에서도 CI 잡이 몇 분 안에 끝난다.
 * 상한이 없으면 오타 하나로 잡이 몇 시간씩 돌 수 있다.
 */
const MAX_USERS = 2_000

/** 기간 상한 (일). tick 수가 `days × 144` 로 선형 증가한다. */
const MAX_DAYS = 180

/** CLI 인자를 파싱한다. 알 수 없는 플래그는 무시한다. */
function parseArgs(argv: readonly string[]): CliOptions {
  const valueOf = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const numberOf = (flag: string, fallback: number, max: number): number => {
    const raw = valueOf(flag)
    const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    if (parsed > max) {
      process.stdout.write(`  ⚠ ${flag} ${parsed} → ${max} 로 제한합니다 (상한).\n`)
      return max
    }
    return parsed
  }

  return {
    outDir: valueOf('--out') ?? '.sim-output',
    sweep: argv.includes('--sweep'),
    users: numberOf('--users', 10, MAX_USERS),
    days: numberOf('--days', 7, MAX_DAYS),
  }
}

/**
 * git 정보를 읽는다.
 *
 * CI 에서는 `GITHUB_REF_NAME`/`GITHUB_SHA` 가 신뢰할 수 있는 출처이므로 먼저
 * 본다 — detached HEAD 로 체크아웃되는 Actions 환경에서 `git rev-parse
 * --abbrev-ref HEAD` 는 `HEAD` 를 돌려주기 때문이다.
 */
function gitInfo(): { branch: string; commit: string } {
  const run = (command: string): string => {
    try {
      return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return ''
    }
  }

  const branch =
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    run('git rev-parse --abbrev-ref HEAD') ||
    'unknown'
  const commit = (process.env.GITHUB_SHA || run('git rev-parse HEAD') || 'unknown').slice(0, 7)

  return { branch, commit }
}

/** 산출물을 파일로 쓴다. */
function writeArtifacts(
  outDir: string,
  results: readonly SimResult[],
  sweep: readonly SweepPoint[],
  meta: ReportMeta & { artifactName: string },
): string[] {
  mkdirSync(outDir, { recursive: true })
  const written: string[] = []

  const report = renderReport(results, meta, sweep)
  const reportPath = join(outDir, 'report.md')
  writeFileSync(reportPath, report, 'utf8')
  written.push(reportPath)

  for (const file of exportCsvFiles(results)) {
    const path = join(outDir, file.name)
    writeFileSync(path, file.content, 'utf8')
    written.push(path)
  }

  if (sweep.length > 0) {
    const path = join(outDir, 'sweep.csv')
    writeFileSync(path, sweepCsv(sweep), 'utf8')
    written.push(path)
  }

  // 기계 판독용 원본 — BigInt 는 문자열로 직렬화한다.
  const jsonPath = join(outDir, 'summary.json')
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      { meta, summaries: results.map(summarize) },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    )}\n`,
    'utf8',
  )
  written.push(jsonPath)

  return written
}

/** 엔트리포인트. */
function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const { branch, commit } = gitInfo()
  const name = artifactName(branch, commit)

  process.stdout.write(`▶ 경제 밸런스 시뮬레이션 — ${name}\n`)

  const started = Date.now()

  // `--users`/`--days` 로 만든 시나리오를 실제로 돌리고 리포트의 **대표
  // 시나리오**로 지정한다. 이 시나리오를 결과 목록에 넣지 않으면 입력이
  // 스윕 기준선에만 쓰여, `--sweep` 없이 실행할 때 두 값이 통째로 무시된다.
  const featured = buildScenario({
    userCount: options.users,
    days: options.days,
    suffix: 'cli',
  })
  const results = [featured, ...standardScenarios()].map((scenario) => runSimulation(scenario))
  const sweep = options.sweep ? runSweep(featured) : []

  const written = writeArtifacts(options.outDir, results, sweep, {
    branch,
    commit,
    generatedAt: new Date().toISOString(),
    artifactName: name,
    featuredScenarioId: featured.id,
    runParams: `유저 ${options.users}명 · ${options.days}일 · 스윕 ${options.sweep ? 'ON' : 'OFF'}`,
  })

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  process.stdout.write(`  대표 시나리오 \`${featured.id}\` · 시나리오 ${results.length}건`)
  process.stdout.write(options.sweep ? ` · 스윕 ${sweep.length}건` : '')
  process.stdout.write(` · ${elapsed}s\n`)
  for (const path of written) process.stdout.write(`  · ${path}\n`)
}

main()
