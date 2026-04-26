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

| Command               | Purpose                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `pnpm install`        | Install all workspace deps. Postinstall wires Husky (skipped in CI). |
| `pnpm build`          | `turbo run build` across all packages/apps.                          |
| `pnpm build:packages` | Build libs only (`--filter '!./apps/*'`).                            |
| `pnpm build:apps`     | Build apps only (`--filter '!./packages/*'`).                        |
| `pnpm dev`            | `turbo run dev` (persistent, depends on `db:generate`).              |
| `pnpm lint`           | Workspace lint.                                                      |
| `pnpm format`         | Workspace format.                                                    |
| `pnpm update`         | Interactive recursive dep update.                                    |
| `pnpm generate`       | `turbo gen` scaffolding.                                             |

## Turbo Task Graph

- `build` depends on `^build` and `db:generate` (Prisma client must exist before TS compile).
- `dev` is `persistent: true`, cache disabled.
- `web#build` overrides inputs/outputs for Next.js (`.next/**`, excludes cache).
- `db:generate`, `db:migrate:deploy`, `db:push`, `db:seed` are defined but only implemented in `packages/database`.

## Documentation Policy

**Always consult Context7 before using any framework, library, or external tool (MANDATORY).**

Before writing code that uses a specific framework or library — including but not limited to Next.js, Tailwind CSS, Prisma, Sapphire.js, discord.js, shadcn/ui, better-auth, or any npm package — you MUST first fetch the current official documentation via the Context7 MCP tool (`mcp__plugin_context7_context7__resolve-library-id` → `mcp__plugin_context7_context7__query-docs`). Do not rely on training data alone; APIs change across versions and training data may be stale.

This applies to:

- API usage, method signatures, and configuration options
- Version-specific behavior (e.g. Next.js App Router vs Pages Router, Tailwind v3 vs v4)
- CLI commands and setup instructions
- Any integration between two libraries

Skip Context7 only for pure language constructs (TypeScript syntax, standard Node.js built-ins) where no third-party API is involved.

## Conventions

- **AGENTS.md language — English only (MANDATORY):** All `AGENTS.md` files (root and per-package) MUST be written entirely in English. This is the contract for both human contributors and AI agents reading docs. Write Korean JSDoc in source code, not in AGENTS.md. This rule applies to every workspace without exception.
- **Korean JSDoc (repo-wide, source code only):** Every exported symbol in every workspace (functions, classes, types, interfaces, constants) MUST carry a Korean `/** */` JSDoc block. Idle-Factory follows Korean-language docs/team conventions. For numeric/formula constants, cite the originating `docs/design/XX-*.md` section in the comment. This rule applies only to source files — AGENTS.md itself stays English.
- **Discord UI — Components v2 (bot mandatory, no exceptions):** Every user-facing payload emitted from `apps/bot` — slash command replies, button/select/modal interaction responses, scheduled notifications, and error/failure responses **included** — MUST be built via the `componentsv2-builder` skill on top of Components v2 (`MessageFlags.IsComponentsV2`). Using `EmbedBuilder`, `embeds`, raw `content` alongside the v2 flag, `poll`, or `stickers` is **strictly forbidden**. The only allowed variation the skill acknowledges is an "intentional flat layout without a Container root" — still pure Components v2. Violations block PR review. See `.claude/skills/componentsv2-builder/SKILL.md` and `apps/bot/AGENTS.md` for details.
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

## Codemaps

Token-lean architecture snapshots live in `docs/CODEMAPS/`. Start at [`docs/CODEMAPS/INDEX.md`](docs/CODEMAPS/INDEX.md) for navigation.

| File              | Contents                                                 |
| ----------------- | -------------------------------------------------------- |
| `INDEX.md`        | Navigation hub — links to all codemaps                   |
| `architecture.md` | 3-layer system design, service boundaries, data flow     |
| `backend.md`      | Bot commands (18), services (5), handler mapping         |
| `data.md`         | Prisma schema — 25 tables, 8 enums, relationships        |
| `game-core.md`    | Factory specs, cost formulas, production calc, XP system |
| `dependencies.md` | External services, build tools, package list             |

Regenerate with `/update-codemaps` after major feature additions or refactoring sessions.

## Per-Package Docs

Each workspace has its own `AGENTS.md` (with `CLAUDE.md` as a symlink) covering package-specific entry points, scripts, and conventions. Start there when working inside a single package.

## Security & Secrets

- Secrets go in `.env` (bot) or GitHub Actions secrets. Never commit tokens.
- `apps/bot/src/config.ts` validates `BOT_TOKEN` at startup via `requireEnv`; missing env vars throw early.
- Do not disable Husky/commitlint hooks to land work — fix the root cause.
