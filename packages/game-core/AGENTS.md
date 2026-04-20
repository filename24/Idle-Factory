# @idle/game-core — Pure Domain Logic

Idle-Factory's **pure domain logic** package. Provides factory/warehouse/land/experience calculations with zero dependency on DB, network, or framework, so both the bot and the web app can consume it identically.

## Contents

```
src/
├─ index.ts                    Barrel: full re-exports + GAME_CORE_VERSION
├─ types.ts                    Pure TS types kept in sync with Prisma enums
├─ factories/
│   ├─ catalog.ts              Factory catalog (numeric constants + lookup helpers)
│   ├─ cost.ts                 Build / upgrade / move / demolish / land-expansion costs
│   └─ production.ts           Tick elapsed → production/consumption calculation
├─ warehouse/
│   └─ capacity.ts             Warehouse capacity, upgrade cost, headroom math
├─ land/
│   ├─ layout.ts               Placement validity, special-slot bonuses
│   └─ specialSlots.ts         Special-slot probability generator (injectable RNG)
└─ xp/
    └─ level.ts                Per-event XP awards, level-up application
```

Design sources: `docs/design/03-factories.md`, `docs/design/05-warehouse.md`, `docs/design/09-level-xp.md`, `docs/design/11-land.md`, etc.

## Build

- **Bundler:** `tsup` — emits `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts`.
- **Exports map**:
  - `import` → `./dist/index.mjs`
  - `require` → `./dist/index.js`
  - `types` → `./dist/index.d.ts`
- **TS config** extends `tsconfig/base.json`.

Consumers must build this package at least once (Turbo `^build` handles it) before referencing `@idle/game-core`.

## Scripts

| Command           | Purpose                    |
| ----------------- | -------------------------- |
| `pnpm build`      | Bundle with `tsup`.        |
| `pnpm typecheck`  | `tsc --noEmit`.            |
| `pnpm test`       | `vitest run` (unit tests). |
| `pnpm test:watch` | `vitest` watch mode.       |
| `pnpm lint`       | `prettier --check .`.      |
| `pnpm format`     | `prettier --write .`.      |

## Runtime Deps

None. Zero runtime dependencies — this package must remain safe to import from any workspace.

## Dev Deps

- `vitest` — unit test runner
- `tsup`, `typescript`, `eslint-config-idle`, `tsconfig`

## Conventions

- **Korean JSDoc required on source code.** Every exported symbol (function, class, type, interface, constant) in `src/` carries a Korean `/** */` JSDoc block. Functions take a one-line summary plus `@param`/`@returns`, and `@throws`/`@example` where relevant. Cite the originating `docs/design/XX-*.md` section in comments on numeric constants. This package follows the repo-wide rule: AGENTS.md itself stays English, but source JSDoc is Korean.
- **No DB/Prisma dependency.** This package is pure domain. Never add I/O deps such as `@idle/database`, `@prisma/client`, or `ioredis`. The enums in `types.ts` are manually kept value-compatible with the Prisma schema.
- **Immutability.** Internal tables and catalogs are all `readonly` / `Readonly<...>`. Calculation functions never mutate their inputs (including `MaterialBag`).
- **`bigint` first.** All resource and currency amounts are `bigint` to avoid precision loss. When crossing through `Number` is unavoidable (e.g. `Math.pow`-based land expansion cost), leave a comment explaining the rationale.
- **Test coverage target 80%+.** Maintain `vitest` unit tests focused on formulas and branch coverage. When any numeric formula changes, update both the design doc and the test in the same change.
- **Cite design docs.** Numeric constants (cost tables, XP requirements, probabilities) must reference the matching `docs/design/XX-*.md` section in their JSDoc for traceability.
- **Privacy:** Marked `private: true`; do not publish to npm.
