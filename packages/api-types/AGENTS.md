# @idle/api-types — Shared Type Package

Shared TypeScript types and small utilities used by both the bot and the web app. Consumed across workspaces via `@idle/api-types`.

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

| Command       | Purpose               |
| ------------- | --------------------- |
| `pnpm build`  | Bundle with `tsup`.   |
| `pnpm lint`   | `prettier --check .`. |
| `pnpm format` | `prettier --write .`. |

## Runtime Deps

- `@sapphire/snowflake` — Snowflake generation/parsing.

## Conventions

- **Types only / tiny pure helpers.** Do not introduce runtime dependencies on discord.js, Prisma, Next.js, or any app-specific framework — this package must remain usable by every workspace.
- **Stable public surface.** Any symbol exported from `src/index.ts` is effectively public API across the monorepo; rename/remove with care and update call sites in `apps/bot` and `apps/web` in the same change.
- **No side effects.** Keep modules tree-shakable — avoid top-level work.
- **Privacy:** Marked `private: true`; do not publish to npm.
