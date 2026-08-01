# @idle/game-services — Prisma-Bound Service Layer

Idle-Factory's **DB orchestration layer**, shared by the Discord bot (`apps/bot`) and the web app (`apps/web`). Every function here owns a database transaction that spends money, grants XP, or moves materials.

This package exists because of a hard boundary: `@idle/game-core` guarantees zero dependency on DB, network, or framework, so Prisma-touching code cannot live there. Duplicating that code in `apps/web` instead would fork the money path between the two surfaces — the exact drift this package prevents.

## Layering

```
@idle/game-core       pure formulas, zero runtime deps      (costs, production, XP curves)
        ↑
@idle/game-services   Prisma transactions, framework-free   (THIS PACKAGE)
        ↑
apps/bot  /  apps/web  presentation, auth, i18n
```

## What belongs here

- Functions that take an explicit `PrismaClient` / `Tx` as their first parameter.
- Transaction orchestration, row-ownership verification, and `ServiceError` signalling.
- Anything both surfaces must execute identically.

## What does NOT belong here

- **Framework imports.** No `@sapphire/*`, no `discord.js`, no `next/*`, no React. If a function needs `container`, it stays in `apps/bot`.
- **Pure math.** Costs, production curves, and XP tables belong in `@idle/game-core`.
- **Presentation.** No Components v2 builders, no i18n rendering, no HTTP status codes. Services raise typed `ServiceError`s; each surface maps them to its own output format.

## Conventions

- **Explicit client parameter.** Every exported service function takes `prisma` or `tx` as its first argument. Never reach for a singleton or DI container — that is what keeps this package consumable from both surfaces.
- **Korean JSDoc on every exported symbol**, per the repo-wide rule in the root `CLAUDE.md`. This file stays English.
- **`ServiceError` for all expected failures.** Callers switch on `code`, never on message text.
- **No `instanceof` for cross-bundle error detection.** tsup bundling and duplicated monorepo installs break class identity; see the JSDoc in `src/base.ts`.

## Scripts

| Command                 | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `pnpm build`            | tsup → `dist/` (ESM + CJS + d.ts)                     |
| `pnpm typecheck`        | `tsc --noEmit`                                        |
| `pnpm test:unit`        | Unit tests only — no database required                |
| `pnpm test:integration` | Fails today — `tests/integration/` does not exist yet |
| `pnpm test:coverage`    | Coverage with the 80% gate                            |

No integration suite has been migrated into this package yet — `tests/` currently holds only `base.retry.test.ts`, a unit test that mocks `PrismaClient` rather than touching a real database. When a real `tests/integration/` suite lands here, it should follow the same dev-Postgres caution as `apps/bot`'s integration tests: not parallel-safe, must not run against a database anyone else is using.

## Coverage gate

80% statements/branches/functions/lines, enforced in `vitest.config.ts`. This threshold was inherited from `apps/bot`'s `src/services/**` gate when the code moved here; do not lower it. Money-path logic must stay verified before merge.

## Bot compatibility shims

`apps/bot/src/services/*.ts` re-export from this package so existing bot import paths keep working. Those shims are compatibility surface only — new code should import from `@idle/game-services` directly.
