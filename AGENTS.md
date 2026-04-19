# Idle-Factory — Repository Guide

Monorepo for the **Idle Factory** Discord game: a Sapphire.js/discord.js bot, a Next.js web surface, and shared TypeScript packages.

## Stack

- **Package manager:** pnpm 10.9 (workspaces). Enforced via `packageManager` field.
- **Build orchestration:** Turborepo (`turbo.json`).
- **Language:** TypeScript 5.8, Node >= 20.19 for runtime apps.
- **Database:** PostgreSQL via Prisma 6.19. Optional Redis cache via ioredis.
- **Lint/format:** ESLint 9 (flat config) + Prettier 3, wired through `eslint-config-idle`.
- **Git hygiene:** Husky + lint-staged + commitlint (conventional commits).

## Workspace Layout

```
apps/
  bot/       Discord bot (Sapphire.js + discord.js v14)
  web/       Next.js 15 (App Router, React 19, Tailwind v4)
packages/
  api-types/           Shared TS types (flags, Snowflake helpers)
  database/            Prisma client wrapper + Redis, re-exports @prisma/client
  eslint-config-idle/  Shared ESLint flat config
  tsconfig/            Shared tsconfig presets (base, node16)
```

Workspace globs live in `pnpm-workspace.yaml`. Shared env keys (`DATABASE_URL`, `REDIS_URL`, `BOT_TOKEN`, `NODE_ENV`) are declared in `turbo.json#globalEnv`.

## Common Commands

Run from the repo root:

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install all workspace deps. Postinstall wires Husky (skipped in CI). |
| `pnpm build` | `turbo run build` across all packages/apps. |
| `pnpm build:packages` | Build libs only (`--filter '!./apps/*'`). |
| `pnpm build:apps` | Build apps only (`--filter '!./packages/*'`). |
| `pnpm dev` | `turbo run dev` (persistent, depends on `db:generate`). |
| `pnpm lint` | Workspace lint. |
| `pnpm format` | Workspace format. |
| `pnpm update` | Interactive recursive dep update. |
| `pnpm generate` | `turbo gen` scaffolding. |

## Turbo Task Graph

- `build` depends on `^build` and `db:generate` (Prisma client must exist before TS compile).
- `dev` is `persistent: true`, cache disabled.
- `web#build` overrides inputs/outputs for Next.js (`.next/**`, excludes cache).
- `db:generate`, `db:migrate:deploy`, `db:push`, `db:seed` are defined but only implemented in `packages/database`.

## Conventions

- **Commits:** Conventional Commits enforced by commitlint (`@commitlint/config-conventional` + angular). Types in use: `feat`, `fix`, `refactor`, `docs`, `chore`, `ci`, `perf`, `test`.
- **Pre-commit:** `lint-staged` runs formatters/linters on staged files (see `.lintstagedrc.json`).
- **TS configs:** Apps/packages extend `tsconfig/base.json` (`target: ES2022`, `strict: true`, `moduleResolution: node`). Node-flavored packages use `tsconfig/node16.json`.
- **Bundling:** Libraries and the bot use `tsup` (shared root `tsup.config.ts` as a template). The web app uses Next.js' own bundler.

## CI / CD

GitHub Actions workflows live under `.github/workflows/`. CI installs via `pnpm/action-setup` with store caching (per belgattitude gist) and runs `turbo` tasks. Do not hardcode secrets; workflow env must reference repository/environment secrets.

## Adding a New Package

1. Create `apps/<name>` or `packages/<name>` — `pnpm-workspace.yaml` already picks it up.
2. Add `package.json` with `"private": true` unless publishing; use `workspace:^` for internal deps.
3. Extend `tsconfig/base.json` in `tsconfig.json`.
4. Add `eslint.config.js` re-exporting `eslint-config-idle`.
5. Declare scripts (`build`, `lint`, `format`) so Turbo can pick them up.

## Per-Package Docs

Each workspace has its own `AGENTS.md` (with `CLAUDE.md` as a symlink) covering package-specific entry points, scripts, and conventions. Start there when working inside a single package.

## Security & Secrets

- Secrets go in `.env` (bot) or GitHub Actions secrets. Never commit tokens.
- `apps/bot/src/config.ts` validates `BOT_TOKEN` at startup via `requireEnv`; missing env vars throw early.
- Do not disable Husky/commitlint hooks to land work — fix the root cause.
