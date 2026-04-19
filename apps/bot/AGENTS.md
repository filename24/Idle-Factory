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
├─ locales/              i18next resources (en, ko)
├─ types/                IConfig + shared types
└─ utils/                Logger, Embed, Constants, Algorithms, SnowFlake
```

Path aliases (`@utils`, `@structures`, `@types`, `@locales`) are declared in `tsconfig.json` and must be kept in sync when directories move.

## Configuration

All config flows through `src/config.ts`:

- `requireEnv('BOT_TOKEN')` — throws on startup if missing.
- Optional env: `BOT_NAME`, `BOT_PREFIX`, `BOT_OWNERS` (comma list), `BOT_COOLDOWN`, `BOT_SHARDING`, `DEV_GUILD_ID`, `GITHUB_TOKEN`.
- Reporting: `REPORT_TYPE` (`webhook` | `text`), `REPORT_WEBHOOK_URL`, `REPORT_TEXT_GUILD_ID`, `REPORT_TEXT_CHANNEL_ID`.
- Logging: `LOG_LEVEL`, `LOG_DEV`.
- i18n: `I18N_LNG` (defaults to `en`). Resources are loaded from `@locales`.
- `BUILD_NUMBER` falls back to `git rev-parse --short HEAD` when unset.

Copy `.env.example` to `.env` for local development. Never commit `.env`.

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | `tsx` watch-run of `src/index.ts`. |
| `pnpm build` | `tsup` bundle into `build/`. |
| `pnpm start` | Run the built `build/index.js`. |
| `pnpm generate` | `prisma generate` (bot depends on `@prisma/client`). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm lint` | ESLint over `.ts` files. |
| `pnpm lint:fix` | Prettier + ESLint `--fix`. |

Prisma client generation is a prerequisite for `build`/`dev` and is declared in the root `turbo.json` via `db:generate`.

## Intents

Current default (see `config.ts`): `GuildMessages` + `Guilds` only. Add intents intentionally and document privileged ones in the Discord developer portal.

## Logging & Errors

- `utils/Logger.ts` wraps `winston` + `chalk` with namespaced loggers (`new Logger('ShardManager')`).
- `managers/ErrorManager.ts` funnels unexpected errors. Process-level `uncaughtException` / `unhandledRejection` are hooked in `bot.ts`.

## Docker

`Dockerfile` is present for container builds. Provide `BOT_TOKEN` and `DATABASE_URL` at runtime (env or secret mount).

## Conventions

- Prefer Sapphire's piece abstractions (`Command`, `Listener`, `InteractionHandler`) over raw discord.js handlers.
- Keep user-facing strings in `src/locales/*` and resolve via i18next.
- Do not import from `@prisma/client` directly; use `@idle/database` when it is added as a dependency.
