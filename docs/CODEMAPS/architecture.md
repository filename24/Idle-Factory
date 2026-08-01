<!-- Generated: 2026-04-22 | Files scanned: 35 | Token estimate: ~800 -->

# System Architecture Codemap

## Overview

Idle-Factory is a Discord-based idle game monorepo with three architectural layers:

```
┌─────────────────────────────────────────────────────────────┐
│ apps/bot (Discord Bot — Sapphire.js + discord.js v14)        │
│ ├─ Commands: /factory, /land, /warehouse, /harvest, /profile │
│ ├─ Interactions: buttons, selects, modals (land build/nav)    │
│ └─ Services: Factory, Harvest, Land, Warehouse, User         │
└────────────────────┬────────────────────────────────────────┘
                     │ imports @idle/database, @idle/game-core, @idle/game-services
┌────────────────────▼────────────────────────────────────────┐
│ packages/database (Prisma + Redis wrapper)                   │
│ ├─ Prisma schema: User, Guild, Factory, Land, Slot          │
│ ├─ Re-exports @prisma/client + DatabaseClient               │
│ └─ Redis optional (ioredis integration)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ├──────────────┬──────────────────────────┐
                     │              │                          │
        ┌────────────▼──────┐  ┌────▼─────────────┐  ┌────────▼──────┐
        │ PostgreSQL        │  │ packages/        │  │ packages/     │
        │ (User, Factory,   │  │ game-core        │  │ game-services │
        │  Land, Stock...)  │  │ (Pure domain)    │  │ (Shared logic)│
        └───────────────────┘  └──────────────────┘  └───────────────┘
```

### Service Boundaries

| Layer         | Responsibility                                                                                                       | Key Files                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Bot**       | Discord interactions, user UI, command routing                                                                       | `src/commands/game/*`, `src/interaction-handlers/*` |
| **Services**  | Business logic (build, harvest, land, quest, upgrade)                                                                | `packages/game-services/src/*.ts`                   |
| **Database**  | Prisma schema + client wrapper                                                                                       | `packages/database/prisma/schema.prisma`            |
| **Game-Core** | Pure calculations (cost, production, XP)                                                                             | `packages/game-core/src/*`                          |
| **Web**       | Next.js 16 app — dashboard, market, ranking, better-auth login, Fumadocs docs; shares game transactions with the bot | `apps/web/src/`                                     |

> **Code reference**: `packages/game-services/src/*.ts` holds the real business logic (`factory.ts`, `harvest.ts`, `land.ts`, `quest.ts`, `guild.ts`, `user.ts`, `reward.ts`), shared by both `apps/bot` and `apps/web` (both depend on `@idle/game-services`). Only part of `apps/bot/src/services/*.ts` has been migrated: `base.ts`, `factory.ts`, `harvest.ts`, `land.ts`, `quest.ts`, `guild.ts`, and `reward.ts` are thin re-export shells, and `user.ts` is a hybrid (re-exports `createLandWithSlots`, keeps `updateLang` local because locale lists differ between bot and web). The market, stock, settlement, and operator domains remain bot-local implementations — `market.ts`, `stock.ts`, `weeklySettlement.ts`, `tradeLog.ts`, `admin.ts`, `directBuy.ts`, `marketSell.ts`, `stockDividend.ts`, `stockPrice.ts`, `marketPrice.ts`, `warehouse.ts`, `announce.ts`, `guildActivity.ts` (~94% of the directory's 4,583 lines). `apps/web` is a working app (`apps/web/src/app/{dashboard,market,ranking,login,docs}`) whose `apps/web/src/lib/mutations/{game-loop.ts,quest-claim.ts,guild-settings.ts}` call the same shared service layer.

## Data Flow: Factory Build Example

```
1. User: /factory build [type] [x] [y]
         ↓
2. Command: factory.ts:buildHandler()
         ↓
3. Service: FactoryService.build()
   ├─ Validate: canPlace() [game-core]
   ├─ Cost: buildCost() [game-core]
   ├─ TX: lock user, deduct money, create Factory + Slots
   └─ return { factoryId, refund? }
         ↓
4. Response: Components v2 (mandatory)
         ↓
5. DB: Prisma tx commits
   ├─ User.money -=
   ├─ Factory.created
   └─ Slot[4].factoryId = factoryId (for T3)
```

## Key Integrations

- **PostgreSQL**: Single source of truth for all game state
- **Redis** (optional): Backing queue for `@sapphire/plugin-scheduled-tasks` (BullMQ), not a data cache. `DatabaseClient.redis` connects but is never read from or written to elsewhere in the codebase — GlobalMarketPrice and other frequently-read data go straight to Postgres via Prisma.
- **Discord.js v14**: Message/interaction dispatch
- **Prisma 7**: Type-safe DB client with migrations
- **Components v2**: Discord embed-like UI (mandatory for all bot responses)

## Cross-Package Dependencies

```
apps/bot/
  imports → packages/database (Prisma + DatabaseClient)
  imports → packages/game-core (FACTORY_CATALOG, buildCost, etc.)
  imports → packages/game-services (FactoryService, HarvestService, LandService, QuestService, etc.)

apps/web/
  imports → packages/database (Prisma + DatabaseClient)
  imports → packages/game-core (FACTORY_CATALOG, buildCost, etc.)
  imports → packages/game-services (same service layer as apps/bot, via apps/web/src/lib/mutations/*)

packages/database/
  imports → @prisma/client (Prisma-generated)
  imports → ioredis (optional)
  Re-exports both

packages/game-services/
  imports → packages/database (Prisma types, DatabaseClient)
  imports → packages/game-core (pure calculations)
  Consumed by both apps/bot and apps/web

packages/game-core/
  ✓ NO external imports (pure domain, safe for bot + web)
  ✓ Mirrors Prisma enums in types.ts

packages/api-types/
  △ external dependency: @sapphire/snowflake (used in SnowFlake.ts)
  ✗ currently unused — no workspace package imports @idle/api-types
```

## Build & Run

- **Local dev**: `pnpm dev` → `turbo run dev` (bot watches, Prisma auto-generated)
- **Build**: `pnpm build` → `turbo run build` (tsup for packages, tsup + copy for bot)
- **Test**: `pnpm test` → `turbo run test` runs vitest across the workspace — bot (`apps/bot/tests/**`, includes integration tests against a real DB), web, game-services, and game-core all have their own vitest suites
- **DB init**: `pnpm db:dev:reset` → Docker PostgreSQL + seed

## Configuration Flow

```
.env.example
    ↓ (copy to .env)
    ↓
config.ts (requireEnv validates at startup)
    ├─ BOT_TOKEN, DATABASE_URL, REDIS_URL
    ├─ I18N_FALLBACK_LNG (i18next)
    ├─ LOG_LEVEL (winston)
    └─ REPORT_TYPE (webhook/text)
```

---

**Related codemaps:** [backend.md](backend.md) | [data.md](data.md) | [game-core.md](game-core.md)
