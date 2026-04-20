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

`Dockerfile` is present for container builds. Provide `BOT_TOKEN` and `DATABASE_URL` at runtime (env or secret mount).

## Conventions

- Prefer Sapphire's piece abstractions (`Command`, `Listener`, `InteractionHandler`) over raw discord.js handlers.
- Keep user-facing strings in `src/locales/*` and resolve via i18next.
- Do not import from `@prisma/client` directly; use `@idle/database` when it is added as a dependency.

## Discord UI — Components v2 (필수 규칙)

**모든 봇 응답 UI는 반드시 `componentsv2-builder` 스킬을 통해 구성해야 한다.**

- 유저에게 노출되는 모든 메시지 페이로드(슬래시 커맨드 응답, 버튼/셀렉트 인터랙션 응답, 모달 제출 응답, 정기 알림 등)는 Components v2 (`MessageFlags.IsComponentsV2`) 기반으로 빌드한다.
- 신규 커맨드/핸들러/렌더러를 작성하거나 기존 UI를 수정할 때는 **항상 먼저 `componentsv2-builder` 스킬을 호출**하여 가이드라인·컴포넌트 조합·접근성 규칙을 따른다.
- 레거시 `EmbedBuilder` / 단순 `content` 문자열 페이로드는 기본적으로 금지한다. Components v2 컨테이너/섹션/텍스트 디스플레이/미디어 갤러리 구성만 사용한다.

### 예외 (Components v2를 쓰지 않아도 되는 경우)

다음 상황에 한해서만 일반 `content` / 레거시 Embed 응답이 허용된다:

- Discord API 제약으로 Components v2가 지원되지 않는 컨텍스트.
- 인터랙션 실패 복구 경로(`InteractionHandlerError` 등) — Components v2 빌드 자체가 실패한 fallback.
- 관리자 전용 디버그/로그 출력 채널로 보내는 짧은 plain text.

위 예외에 해당하지 않으면 **무조건 `componentsv2-builder` 스킬을 사용한다.** PR 리뷰 시 이 규칙 위반은 blocker로 간주한다.
