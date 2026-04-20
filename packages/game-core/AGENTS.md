# @idle/game-core — Pure Domain Logic

Idle-Factory의 **순수 도메인 로직** 패키지. 공장/창고/토지/경험치 계산을 DB·네트워크·프레임워크 의존 없이 제공하며, bot과 web 어느 쪽에서도 동일하게 쓸 수 있다.

## Contents

```
src/
├─ index.ts                    배럴: 전체 재export + GAME_CORE_VERSION
├─ types.ts                    Prisma enum과 동기화된 순수 TS 타입
├─ factories/
│   ├─ catalog.ts              공장 카탈로그 (수치 상수 + 조회 함수)
│   ├─ cost.ts                 건설/업그레이드/이동/철거/토지확장 비용
│   └─ production.ts           tick 경과 → 생산/소비 계산
├─ warehouse/
│   └─ capacity.ts             창고 용량·업그레이드 비용·여유 계산
├─ land/
│   ├─ layout.ts               배치 가능 여부 검사, 특수 슬롯 보너스
│   └─ specialSlots.ts         특수 슬롯 확률 생성 (RNG 주입 가능)
└─ xp/
    └─ level.ts                이벤트별 XP, 레벨업 적용
```

설계 근거 문서: `docs/design/03-factories.md`, `docs/design/05-warehouse.md`, `docs/design/09-level-xp.md`, `docs/design/11-land.md` 등.

## Build

- **Bundler:** `tsup` — emits `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts`.
- **Exports map**:
  - `import` → `./dist/index.mjs`
  - `require` → `./dist/index.js`
  - `types` → `./dist/index.d.ts`
- **TS config** extends `tsconfig/base.json`.

Consumers must build this package at least once (Turbo `^build` handles it) before referencing `@idle/game-core`.

## Scripts

| Command           | Purpose                     |
| ----------------- | --------------------------- |
| `pnpm build`      | Bundle with `tsup`.         |
| `pnpm typecheck`  | `tsc --noEmit`.             |
| `pnpm test`       | `vitest run` (단위 테스트). |
| `pnpm test:watch` | `vitest` watch 모드.        |
| `pnpm lint`       | `prettier --check .`.       |
| `pnpm format`     | `prettier --write .`.       |

## Runtime Deps

없음. 런타임 의존성 0개 — 패키지는 어떤 워크스페이스에서도 안전하게 임포트할 수 있어야 한다.

## Dev Deps

- `vitest` — 단위 테스트 러너
- `tsup`, `typescript`, `eslint-config-idle`, `tsconfig`

## Conventions

- **한국어 JSDoc 주석 필수.** 모든 exported 심볼(함수·클래스·타입·인터페이스·상수)에는 한국어 `/** */` JSDoc을 단다. 함수는 한 줄 개요 + `@param`/`@returns`, 필요 시 `@throws`/`@example`을 포함한다. 설계 수치는 `docs/design/XX-*.md` 경로를 주석에 명시해 출처를 남긴다.
- **DB/Prisma 의존 금지.** 이 패키지는 순수 도메인이다. `@idle/database`, `@prisma/client`, `ioredis` 등 I/O 의존성을 추가하지 말 것. `types.ts`의 enum은 Prisma schema와 값이 일치하는지 수동으로 동기화한다.
- **불변성.** 내부 테이블·카탈로그는 전부 `readonly`/`Readonly<...>`. 계산 함수는 입력을 절대 변형하지 않는다 (`MaterialBag` 포함).
- **bigint 우선.** 자원량·화폐는 모두 `bigint`로 처리해 정밀도 손실을 피한다. `Number` 경유가 불가피한 경우(예: `Math.pow` 기반 토지 확장비) 주석으로 근거를 남긴다.
- **테스트 커버리지 목표 80%+.** `vitest`로 공식·분기 위주 단위 테스트를 유지한다. 수치 공식 변경 시 근거 문서와 테스트를 같이 갱신할 것.
- **설계 문서 인용.** 수치 상수(비용표·요구 XP·확률 등) 주석에는 `docs/design/XX-*.md` 섹션 참조를 달아 추적 가능성을 확보한다.
- **Privacy:** Marked `private: true`; do not publish to npm.
