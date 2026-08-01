# @idle/api-types — Shared Type Package

Shared TypeScript types and small utilities intended for use by both the bot and the web app via `@idle/api-types`. Not currently consumed by any workspace — neither `apps/bot` nor `apps/web` depend on this package yet.

## Contents

```
src/
├─ index.ts        Barrel re-exports (`flags`, `SnowFlake`)
├─ flags.ts        Bitfield flag constants / helpers
└─ SnowFlake.ts    Snowflake ID helpers (wraps @sapphire/snowflake)
```

## Build

- **Bundler:** `tsup` — emits `dist/index.js` (CJS), `dist/index.mjs` (ESM), and `dist/index.d.ts`.
- **Exports map** in `package.json`:
  - `import` → `./dist/index.mjs`
  - `require` → `./dist/index.js`
  - `types` → `./dist/index.d.ts`
- **TS config** extends `tsconfig/base.json`.

Consumers must run the package's `build` task at least once (Turbo handles this via `^build` dependencies) before referencing `@idle/api-types`.

## Scripts

| Command          | Purpose               |
| ---------------- | --------------------- |
| `pnpm build`     | Bundle with `tsup`.   |
| `pnpm lint`      | `prettier --check .`. |
| `pnpm format`    | `prettier --write .`. |
| `pnpm typecheck` | `tsc --noEmit`.       |

## Runtime Deps

- `@sapphire/snowflake` — Snowflake generation/parsing.

## Conventions

- **Types only / tiny pure helpers.** Do not introduce runtime dependencies on discord.js, Prisma, Next.js, or any app-specific framework — this package must remain usable by every workspace.
- **Stable public surface.** Any symbol exported from `src/index.ts` is intended to be public API across the monorepo; rename/remove with care. Note: as of now, neither `apps/bot` nor `apps/web` depends on this package, so there are no existing call sites to update — apply this guidance once a workspace actually wires in `@idle/api-types`.
- **Minimal side effects.** Keep modules tree-shakable — simple top-level `const` instantiation of stateless helper objects (e.g. `SnowFlake.ts`'s `SnowflakeId`) is fine, but avoid heavier top-level work (I/O, timers, global mutation).
- **Privacy:** Marked `private: true`; do not publish to npm.
