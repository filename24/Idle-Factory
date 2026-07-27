#!/usr/bin/env node
/**
 * 빌드 산출물에 Sapphire piece 디렉터리가 빠짐없이 들어갔는지 확인한다.
 *
 * tsup 은 엔트리로 지정한 것만 build/ 에 구조를 유지해 떨어뜨린다. store
 * 디렉터리를 엔트리에서 빠뜨리면 **빌드는 성공하고 런타임에만 조용히** 그 store
 * 가 비게 된다. 특히 preconditions 가 비면 그것을 요구하는 명령이 전부 차단돼,
 * 봇이 정상 부팅한 것처럼 보이면서 모든 명령에 무응답이 된다. 에러 로그도 남지
 * 않아 원인을 찾기 매우 어렵다 — 실제로 프로덕션에서 겪은 사고다.
 *
 * `pnpm build` 마지막 단계로 돌려서 그 상황을 빌드 시점에 잡는다.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** Sapphire(+플러그인)가 piece 를 파일로 로드하는 디렉터리 이름. */
const STORE_DIRS = [
  'commands',
  'listeners',
  'preconditions',
  'arguments',
  'interaction-handlers',
  'scheduled-tasks'
]

const root = process.cwd()
const srcDir = join(root, 'src')
const buildDir = join(root, 'build')

if (!existsSync(buildDir)) {
  console.error('[verify-build] build/ 가 없다. tsup 이 실패했는지 확인할 것.')
  process.exit(1)
}

const problems = []

for (const name of STORE_DIRS) {
  const src = join(srcDir, name)
  if (!existsSync(src)) continue // 이 프로젝트가 쓰지 않는 store

  const out = join(buildDir, name)
  if (!existsSync(out)) {
    problems.push(
      `build/${name}/ 이 없다 — tsup.config.ts 의 entry 에 'src/${name}/**/*.ts' 를 추가할 것`
    )
    continue
  }

  const count = (dir) =>
    readdirSync(dir, { withFileTypes: true, recursive: true }).filter(
      (e) => e.isFile() && e.name.endsWith(name === 'locales' ? '.json' : '.js')
    ).length
  const srcCount = readdirSync(src, {
    withFileTypes: true,
    recursive: true
  }).filter((e) => e.isFile() && e.name.endsWith('.ts')).length

  if (count(out) === 0 && srcCount > 0) {
    problems.push(`build/${name}/ 이 비었다 (src 에는 ${srcCount}개)`)
  }
}

// i18next 가 읽는 로케일. build 스크립트의 `cp -R` 이 빠지면 부팅이 깨진다.
if (
  existsSync(join(srcDir, 'locales')) &&
  !existsSync(join(buildDir, 'locales'))
) {
  problems.push(
    'build/locales/ 가 없다 — build 스크립트의 `cp -R src/locales` 확인'
  )
}

if (problems.length > 0) {
  console.error('[verify-build] 빌드 산출물에 문제가 있다:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

console.log('[verify-build] piece 디렉터리 확인 완료')
