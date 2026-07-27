import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/bot.ts',
    // 아래 네 디렉터리는 Sapphire 가 파일 단위로 로드하는 piece 다. 엔트리로
    // 지정해 build/ 아래 같은 구조로 떨어뜨려야 store 가 찾을 수 있다.
    // (piece 를 찾을 루트 자체는 utils/pieceRoot.ts 가 정한다 — 번들러가 코드를
    //  어느 청크에 넣든 흔들리지 않도록 import.meta.url 을 쓰지 않는다.)
    'src/commands/**/*.ts',
    'src/listeners/**/*.ts',
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
