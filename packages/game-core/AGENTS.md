# @idle/game-core — Pure Domain Logic

Idle-Factory's **pure domain logic** package. Provides factory/warehouse/land/experience calculations with zero dependency on DB, network, or framework, so both the bot and the web app can consume it identically.

## Contents

```
src/
├─ index.ts                    Barrel: full re-exports
├─ version.ts                  GAME_CORE_VERSION (separate module to avoid import cycles)
├─ types.ts                    Pure TS types kept in sync with Prisma enums
├─ factories/
│   ├─ catalog.ts              Factory catalog (numeric constants + lookup helpers)
│   ├─ cost.ts                 Build / upgrade / move / demolish costs
│   ├─ booster.ts              Upgrade/raw booster multipliers, RARE drop (injectable RNG)
│   └─ production.ts           Tick elapsed → production/consumption calculation
├─ warehouse/
│   └─ capacity.ts             Warehouse capacity, upgrade cost, headroom math
├─ land/
│   ├─ layout.ts               Placement validity, special-slot bonuses
│   ├─ expansion.ts            Land expansion cost / level gating
│   ├─ specialSlots.ts         Special-slot probability generator (injectable RNG)
│   └─ synergy.ts              Adjacency synergy multipliers (max +30%)
├─ market/
│   ├─ basePrices.ts           Base price table — manually synced with prisma/seed.ts
│   └─ price.ts                30-min price tick, demand factor, listing price band
├─ economy/
│   ├─ assets.ts               Total asset valuation (U-2)
│   ├─ directBuy.ts            Direct purchase pricing / daily limits
│   ├─ kst.ts                  KST day/week boundaries for settlement windows
│   └─ tax.ts                  Weekly progressive asset tax + user-shop duration tax
├─ stock/                      Listing eligibility, price ticks, holdings
├─ credit/                     Trust score transitions
├─ quests/                     Tutorial quest chain + event matcher
├─ xp/
│   └─ level.ts                Per-event XP awards, level-up application
└─ simulation/                 Economy balance simulator (issue #31)
    ├─ engine.ts               10-min tick loop: harvest → sell → buy → reinvest
    ├─ types.ts                Scenario / user / market value objects
    ├─ profiles.ts             HARDCORE / CASUAL / IDLE play profiles
    ├─ scenarios.ts            Standard scenario matrix + deterministic seeds
    ├─ state.ts                Mutable in-loop state + readonly snapshots
    ├─ harvest.ts              Production step, sale reserves
    ├─ sell.ts                 Global sale (mint) vs user-shop trade (transfer + tax burn)
    ├─ directBuySim.ts         Recipe material replenishment (burn)
    ├─ invest.ts               Build / upgrade / replace decisions (burn)
    ├─ metrics.ts              Summaries and chart series
    ├─ targets.ts              Design-target verification (300~400/tick, 33 min, 16 h)
    ├─ sweep.ts                One-at-a-time parameter sensitivity sweep
    ├─ charts.ts               Mermaid xychart-beta generators
    ├─ report.ts               Markdown report + model-limitations notice
    ├─ csv.ts                  CSV export for artifacts
    ├─ artifact.ts             Artifact naming rule `[branch]-[commit]`
    └─ rng.ts                  Deterministic mulberry32 RNG
```

Design sources: `docs/design/00-onboarding.md`, `03-factories.md`, `04-economy.md`, `05-warehouse.md`, `06-market.md`, `07-global-system.md`, `09-level-xp.md`, `11-land.md`.

## Build

- **Bundler:** `tsup` — emits `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts`.
- **Exports map**:
  - `import` → `./dist/index.mjs`
  - `require` → `./dist/index.js`
  - `types` → `./dist/index.d.ts`
- **TS config** extends `tsconfig/base.json`.

Consumers must build this package at least once (Turbo `^build` handles it) before referencing `@idle/game-core`.

## Scripts

| Command           | Purpose                                        |
| ----------------- | ---------------------------------------------- |
| `pnpm build`      | Bundle with `tsup`.                            |
| `pnpm typecheck`  | `tsc --noEmit`.                                |
| `pnpm test`       | `vitest run` (unit tests).                     |
| `pnpm test:watch` | `vitest` watch mode.                           |
| `pnpm sim`        | Run the balance simulator, write report + CSV. |
| `pnpm sim:sweep`  | Same, plus a parameter sensitivity sweep.      |
| `pnpm lint`       | `prettier --check .`.                          |
| `pnpm format`     | `prettier --write .`.                          |

### Balance simulator

`pnpm sim [--out <dir>] [--sweep] [--users <n>] [--days <n>]` runs the standard
scenario matrix and writes `report.md` (markdown + mermaid charts), five CSV
files, and `summary.json` into `.sim-output/` (git-ignored).

The script lives in `scripts/`, **not** `src/`, because it needs `node:fs` and
this package must stay dependency-free. `tsup` only bundles `src/`, so the
script never ships.

CI runs it via the manual `Economy Simulation` workflow
(`.github/workflows/simulation.yml`): the report goes to the job summary and the
data directory is uploaded as an artifact named `[branch]-[commit]` — the name
comes from `summary.json`'s `meta.artifactName` so the rule
(`src/simulation/artifact.ts`) has a single source of truth.

Verification targets and their sources live in `src/simulation/targets.ts`.
Several of them currently **fail on purpose** — they record real gaps between
the design docs and the numbers (open contradictions 7 and 11 in
`docs/design/00-onboarding.md`). When a design decision resolves one, update
both the doc and `tests/simulation/targets.test.ts` in the same change.

## Runtime Deps

None. Zero runtime dependencies — this package must remain safe to import from any workspace.

## Dev Deps

- `vitest` — unit test runner
- `tsx` — TypeScript runner for `scripts/sim.ts` (dev-only; never imported from `src/`)
- `tsup`, `typescript`, `eslint-config-idle`, `tsconfig`

## Conventions

- **Korean JSDoc required on source code.** Every exported symbol (function, class, type, interface, constant) in `src/` carries a Korean `/** */` JSDoc block. Functions take a one-line summary plus `@param`/`@returns`, and `@throws`/`@example` where relevant. Cite the originating `docs/design/XX-*.md` section in comments on numeric constants. This package follows the repo-wide rule: AGENTS.md itself stays English, but source JSDoc is Korean.
- **No DB/Prisma dependency.** This package is pure domain. Never add I/O deps such as `@idle/database`, `@prisma/client`, or `ioredis`. The enums in `types.ts` are manually kept value-compatible with the Prisma schema.
- **Manually synced tables.** Two constants mirror data that lives in the database package and have no automatic sync: `types.ts` enums (↔ `schema.prisma`) and `market/basePrices.ts` (↔ `prisma/seed.ts`'s `MARKET_BASE_PRICES`). Change one, change the other. A drift guard test (`tests/simulation/basePrices.test.ts`) parses the seed file and fails on mismatch — do not weaken it.
- **Immutability.** Internal tables and catalogs are all `readonly` / `Readonly<...>`. Calculation functions never mutate their inputs (including `MaterialBag`).
- **`bigint` first.** All resource and currency amounts are `bigint` to avoid precision loss. When crossing through `Number` is unavoidable (e.g. `Math.pow`-based land expansion cost), leave a comment explaining the rationale.
- **Test coverage target 80%+.** Maintain `vitest` unit tests focused on formulas and branch coverage. When any numeric formula changes, update both the design doc and the test in the same change.
- **Cite design docs.** Numeric constants (cost tables, XP requirements, probabilities) must reference the matching `docs/design/XX-*.md` section in their JSDoc for traceability.
- **Privacy:** Marked `private: true`; do not publish to npm.
