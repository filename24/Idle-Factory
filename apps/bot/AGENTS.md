# apps/bot — Discord Bot

The Idle Factory Discord bot, built on **Sapphire.js v5** over **discord.js v14**.

## Runtime

- **Node:** >= 20.19 (see `engines` in `package.json`).
- **Module system:** ESM (`"type": "module"`).
- **Entrypoint (dev):** `src/index.ts` (via `tsx`).
- **Entrypoint (prod):** `build/index.js` (bundled by `tsup`).
- **Sharding:** Opt-in via `BOT_SHARDING=true`. When enabled, `src/index.ts` spawns a `ShardingManager` pointed at `./bot.js`; otherwise it imports `./bot` directly.

## Directory Layout

```
src/
├─ index.ts              Entrypoint; sharding bootstrap
├─ bot.ts                Boots BotClient with config.bot.options
├─ config.ts             Env-driven IConfig (token, intents, i18n, logger, report)
├─ structures/
│   └─ BotClient.ts      Sapphire client extension
├─ commands/             Slash commands (dev, info, settings, contexts)
├─ listeners/            ready / guildCreate / messageCreate / errors/*
├─ interaction-handlers/ Component & modal handlers
├─ managers/
│   └─ ErrorManager.ts
├─ locales/              i18next JSON resources (`<lng>/<ns>.json`, e.g. `en-US/common.json`)
├─ types/                IConfig + shared types
└─ utils/                Logger, Embed, Constants, Algorithms, SnowFlake
```

Path aliases (`@utils`, `@structures`, `@types`) are declared in `tsconfig.json` and must be kept in sync when directories move.

## Configuration

All config flows through `src/config.ts`:

- `requireEnv('BOT_TOKEN')` — throws on startup if missing.
- Optional env: `BOT_NAME`, `BOT_PREFIX`, `BOT_OWNERS` (comma list), `BOT_COOLDOWN`, `BOT_SHARDING`, `DEV_GUILD_ID`, `GITHUB_TOKEN`.
- Reporting: `REPORT_TYPE` (`webhook` | `text`), `REPORT_WEBHOOK_URL`, `REPORT_TEXT_GUILD_ID`, `REPORT_TEXT_CHANNEL_ID`.
- Logging: `LOG_LEVEL`, `LOG_DEV`.
- i18n: `I18N_FALLBACK_LNG` (defaults to `en-US`). Loaded by `@sapphire/plugin-i18next` from `src/locales/<lng>/<ns>.json`; default namespace is `common`.
- `BUILD_NUMBER` falls back to `git rev-parse --short HEAD` when unset.

Copy `.env.example` to `.env` for local development. Never commit `.env`.

**Adding a new environment variable is a three-file change.** Production injects
variables explicitly — there is no `env_file` passthrough — so a value that exists
only in `.env.prod` never reaches the container:

1. read it in `src/config.ts` (or wherever it belongs)
2. add it to `apps/bot/.env.example`
3. add it to the `bot` service's `environment:` block in `compose.prod.yml`, and
   document it in `.env.prod.example`

Skipping step 3 fails silently in production. Note also that compose always
injects the listed variables, so an unset one arrives as an **empty string**, not
`undefined` — `env(key, fallback)` and `?? fallback` will not kick in. When the
source has a meaningful default, mirror it in the compose default
(`${VAR:-default}`) rather than leaving it blank.

## Scripts

| Command          | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| `pnpm dev`       | `tsx` watch-run of `src/index.ts`.                   |
| `pnpm build`     | `tsup` bundle into `build/`.                         |
| `pnpm start`     | Run the built `build/index.js`.                      |
| `pnpm generate`  | `prisma generate` (bot depends on `@prisma/client`). |
| `pnpm typecheck` | `tsc --noEmit`.                                      |
| `pnpm lint`      | ESLint over `.ts` files.                             |
| `pnpm lint:fix`  | Prettier + ESLint `--fix`.                           |

Prisma client generation is a prerequisite for `build`/`dev` and is declared in the root `turbo.json` via `db:generate`.

## Intents

Current default (see `config.ts`): `GuildMessages` + `Guilds` only. Add intents intentionally and document privileged ones in the Discord developer portal.

## Logging & Errors

- `utils/Logger.ts` wraps `winston` + `chalk` with namespaced loggers (`new Logger('ShardManager')`).
- `managers/ErrorManager.ts` funnels unexpected errors. Process-level `uncaughtException` / `unhandledRejection` are hooked in `bot.ts`.

## Docker

`Dockerfile` builds the production image. **The build context is the repository
root**, not this directory — the image runs `turbo prune bot --docker` inside the
container, so it needs the whole workspace:

```bash
docker build -f apps/bot/Dockerfile -t idle-factory-bot .
```

Notes that bite if ignored:

- Base image is `node:22-slim` (glibc), never alpine. `@napi-rs/canvas` resolves
  its `linux-x64-gnu` native variant and breaks on musl.
- `tsup` leaves `dependencies` external even with `bundle: true`, so the runtime
  needs `node_modules`. The image flattens pnpm's symlink tree with
  `pnpm deploy --prod --legacy`.
- `StockChartRenderer` loads fonts from `process.cwd()/assets/fonts`, so the
  image keeps `assets/` next to `build/` and asserts the font exists at build time.
- Provide `BOT_TOKEN`, `DATABASE_URL`, and `REDIS_URL` at runtime. `BUILD_NUMBER`
  is injected as a build arg because the image has no `.git` for `git rev-parse`.

See [docs/ops/deployment.md](../../docs/ops/deployment.md) for the deploy,
rollback, and recovery runbook.

## Conventions

- **A new store directory must be added to `tsup.config.ts`.** Sapphire loads pieces
  from the filesystem, and tsup only mirrors the directories listed as entries. Omit
  one and the build still succeeds — that store is just silently empty at runtime.
  When `preconditions` was missing, every command requiring one was blocked and the
  bot answered nothing, with no error in the logs. `scripts/verify-build.mjs` runs at
  the end of `pnpm build` and fails on this, but keep the entry list in sync anyway.
- Prefer Sapphire's piece abstractions (`Command`, `Listener`, `InteractionHandler`) over raw discord.js handlers.
- **Store directories hold pieces only.** Sapphire loads _every_ file under `commands/`, `listeners/`, and `interaction-handlers/` as a piece and throws `EMPTY_MODULE` at boot on any file without a piece class. Non-piece helpers (pure functions, payload/embed builders, decision logic) MUST live in `utils/` (or another non-store dir) — never inside a store directory, even if only one command uses them. Examples: `utils/landNav.ts`, `utils/announceAction.ts`, `utils/landMove.ts`.
- Keep user-facing strings in `src/locales/*` and resolve via i18next.
- **Language resolution lives in `utils/language.ts`, wired via `config.i18n.options.fetchLanguage`.** The plugin's default `fetchLanguage` is `() => null`, which makes the language depend solely on `guild.preferredLocale` and silently ignores `User.lang` / `Guild.lang`. Never drop that wiring — the settings UI keeps working while doing nothing. Priority: `User.lang` (explicit personal choice, `'auto'` skips this tier) → `Guild.lang` (admin choice) → `interactionLocale` → `null` (plugin default). `SUPPORTED_LANGUAGES` in the same module is the single source of truth: adding a locale means adding both a `src/locales/<lng>/` directory and an entry there.
- **i18next `TFunction` typing.** Two i18next versions resolve in the tree (plugin v26 + a transitive v25). Never `import type { TFunction } from 'i18next'` — it conflicts with the type `fetchT` (from `@sapphire/plugin-i18next`) returns and breaks `tsc`. Derive it instead: `type T = Awaited<ReturnType<typeof fetchT>>`, or let it infer from the callback signature.
- **Global/server notifications go through `AnnounceService`** (`services/announce.ts`). Scheduled jobs and `/debug` dispatch server announcements to each guild's `Guild.announceChannelId` via `announce` / `announceMany`; it silently no-ops when the client or channel is unavailable, so it is safe to call from jobs and tests. Do not `channel.send` ad-hoc for global events. The channel is configured with `/server announce`.
- Do not import from `@prisma/client` directly; use `@idle/database` when it is added as a dependency.

## Operator Tooling — `/admin` vs `/debug`

Two owner-only command families, deliberately separate:

|             | `/debug`                                  | `/admin`                                               |
| ----------- | ----------------------------------------- | ------------------------------------------------------ |
| Purpose     | developer manipulates **their own** state | operator intervenes in **other users'/guilds'** assets |
| Audit trail | none                                      | every change writes `AdminAuditLog`                    |
| Subcommands | ~20 state setters                         | `credit set/adjust`, `market report/remove`            |

Both are gated twice: `preconditions: ['OwnerOnly']` plus dev-guild-only
registration when `DEV_GUILD_ID` is set.

**Every mutation in `services/admin.ts` must write an audit row.** A change that
lands without one defeats the point of the command family — the integration suite
(`tests/integration/admin.service.test.ts`) asserts this for each operation,
including that rejected input writes _no_ row.

`ADMIN_AUDIT_WEBHOOK_URL` (optional) mirrors audit rows into a Discord channel for
visibility. The DB is the source of truth: webhook delivery failures are logged
and swallowed (`utils/adminAuditWebhook.ts`) and never roll back the operation.
Channel webhooks are not application-owned, so the payload needs
`withComponents: true` alongside the Components v2 flag.

## Scheduled Tasks

`src/scheduled-tasks/` uses `@sapphire/plugin-scheduled-tasks` (BullMQ over Redis) — no `node-cron` / `setInterval`. Tasks do not run without `REDIS_URL`. Each task's delegate logic (e.g. `runWeeklySettlement`, `runDailyGlobal`, `runMonthlyRedistribution`) is exported as a pure `(prisma) => result` function so it is unit-testable and reusable outside the queue. `/debug run-scheduler` enumerates the live task store for autocomplete and dynamic dispatch, so new task pieces appear automatically; running it with no `task` runs every registered scheduler in sequence.

## Testing

- Unit tests mock services / `container` and never touch a DB. Integration tests (`tests/integration/**`) run against a REAL dev Postgres — start it with `pnpm db:dev:up` (`localhost:5433`, a `*-dev` database). `tests/integration/setup.ts` only `TRUNCATE`s tables, so the schema must already be migrated. Vitest runs `singleFork` and the dev DB is shared across processes, so integration suites are **not** safe to run in parallel.
- Vitest does not resolve TS path aliases (`@utils`, `@structures`). In tests, import source via relative paths or `vi.mock` the alias; a source file that transitively imports an alias will fail to load in a unit test unless mocked. (Cleaner fix if it keeps biting: add `vite-tsconfig-paths` to `vitest.config.ts`.)

## Discord UI — Components v2 (mandatory)

**Every bot response UI MUST be built through the `componentsv2-builder` skill. No exceptions.**

- Every user-facing message payload — slash command replies, button/select interaction responses, modal submit responses, scheduled notifications, and error/failure responses **included** — is built on top of Components v2 (`MessageFlags.IsComponentsV2`).
- When authoring or modifying any command, handler, or renderer, **invoke the `componentsv2-builder` skill first**.
- Using `EmbedBuilder`, `embeds: [...]`, raw `content: "..."` alongside the v2 flag, `poll`, or `stickers` is **strictly forbidden**.

### The only variation the skill acknowledges

- The skill checklist allows an "intentional flat layout without a Container root". Dropping the Container wrapper is permitted as a compositional choice within Components v2 — it is NOT permission to fall back to legacy Embed / plain `content`.

Violations block PR review. See `.claude/skills/componentsv2-builder/SKILL.md` for the full guide.

### Separator before interactive buttons (mandatory)

Any `ContainerBuilder` payload that contains both text content (`TextDisplayBuilder`) and at least one interactive `ActionRowBuilder` (buttons or select menus) **MUST** include a `SeparatorBuilder` between the last `TextDisplayBuilder` and the first `ActionRowBuilder`. Use `SeparatorSpacingSize.Small` as the default spacing.

```ts
// WRONG: text directly followed by buttons
container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
container.addActionRowComponents(row)

// CORRECT: separator between text and buttons
container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
container.addSeparatorComponents(
  new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
)
container.addActionRowComponents(row)
```

This applies to every builder function that produces an interactive payload — slash command replies, button update responses, and select menu responses included. `SeparatorSpacingSize.Large` is reserved for the land-view grid/control divider.
