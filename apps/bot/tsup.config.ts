import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/bot.ts',
    // 아래는 Sapphire 가 파일 단위로 로드하는 piece 디렉터리다. 엔트리로 지정해
    // build/ 아래 같은 구조로 떨어뜨려야 store 가 찾을 수 있다.
    // (piece 를 찾을 루트 자체는 utils/pieceRoot.ts 가 정한다 — 번들러가 코드를
    //  어느 청크에 넣든 흔들리지 않도록 import.meta.url 을 쓰지 않는다.)
    //
    // ⚠️ 새 store 디렉터리를 만들면 여기에 반드시 추가할 것. 빠뜨리면 그 store 만
    // 조용히 비게 되는데, precondition 이 빠졌을 때는 그것을 요구하는 명령이 전부
    // 차단돼 봇이 모든 명령에 무응답이 된다(실제로 프로덕션에서 겪음).
    // scripts/verify-build.mjs 가 빌드 직후 이 누락을 잡는다.
    'src/commands/**/*.ts',
    'src/listeners/**/*.ts',
    'src/preconditions/**/*.ts',
    'src/interaction-handlers/**/*.ts',
    'src/scheduled-tasks/**/*.ts'
  ],
  format: ['esm'],
  outDir: 'build',
  bundle: true,
  splitting: true,
  clean: true,
  sourcemap: false,
  dts: false
})
