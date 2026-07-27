import { join } from 'path'

/**
 * Sapphire 가 piece(commands·listeners·interaction-handlers·scheduled-tasks)를
 * 찾을 루트 디렉터리이자, i18next 로케일의 부모 디렉터리.
 *
 * **`import.meta.url` 로 잡으면 안 된다.** tsup 이 `splitting: true` 로 번들하기
 * 때문에 이 코드가 어느 청크에 실리는지가 빌드마다 달라지고, 그에 따라 상대
 * 경로의 기준점이 바뀐다. 실제로 프로덕션에서 `new URL('..', import.meta.url)`
 * 이 `build/` 대신 패키지 루트를 가리켜 Sapphire 가 `<root>/commands` 를 뒤졌고,
 * piece 가 하나도 로드되지 않았다. 에러는 나지 않고 봇이 모든 명령에 무응답이
 * 되기 때문에 원인을 찾기가 특히 어렵다.
 *
 * 그래서 번들 구조와 무관한 두 가지로만 판단한다.
 *  - `process.cwd()` — dev 는 turbo 가 패키지 디렉터리에서 실행하고,
 *    프로덕션은 Dockerfile 의 `WORKDIR /app` 이 곧 패키지 루트다.
 *  - `NODE_ENV` — Dockerfile 이 `production` 으로 고정한다.
 *
 * dev 는 tsx 가 `src/` 를 직접 실행하므로 소스 디렉터리를, 프로덕션은 tsup
 * 산출물이 있는 `build/` 를 가리킨다.
 */
export const pieceRoot: string = join(
  process.cwd(),
  process.env.NODE_ENV === 'production' ? 'build' : 'src'
)
