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
                     │ imports @idle/database, @idle/game-core
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
        │ (User, Factory,   │  │ game-core        │  │ api-types     │
        │  Land, Stock...)  │  │ (Pure domain)    │  │ (Shared types)│
        └───────────────────┘  └──────────────────┘  └───────────────┘
```

### Service Boundaries

| Layer         | Responsibility                                 | Key Files                                           |
| ------------- | ---------------------------------------------- | --------------------------------------------------- |
| **Bot**       | Discord interactions, user UI, command routing | `src/commands/game/*`, `src/interaction-handlers/*` |
| **Services**  | Business logic (build, harvest, upgrade)       | `src/services/*.ts`                                 |
| **Database**  | Prisma schema + client wrapper                 | `packages/database/prisma/schema.prisma`            |
| **Game-Core** | Pure calculations (cost, production, XP)       | `packages/game-core/src/*`                          |
| **Web**       | Future dashboard (Next.js 15 stub)             | `apps/web/src/`                                     |

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
- **Redis** (optional): Cache layer for frequently read data (GlobalMarketPrice, etc.)
- **Discord.js v14**: Message/interaction dispatch
- **Prisma 7**: Type-safe DB client with migrations
- **Components v2**: Discord embed-like UI (mandatory for all bot responses)

## Cross-Package Dependencies

```
apps/bot/
  imports → packages/database (Prisma + DatabaseClient)
  imports → packages/game-core (FACTORY_CATALOG, buildCost, etc.)
  imports → packages/api-types (shared TS enum types)

packages/database/
  imports → @prisma/client (Prisma-generated)
  imports → ioredis (optional)
  Re-exports both

packages/game-core/
  ✓ NO external imports (pure domain, safe for bot + web)
  ✓ Mirrors Prisma enums in types.ts

packages/api-types/
  ✓ NO external imports (shared type stubs)
```

## Build & Run

- **Local dev**: `pnpm dev` → `turbo run dev` (bot watches, Prisma auto-generated)
- **Build**: `pnpm build` → `turbo run build` (tsup for packages, tsup + copy for bot)
- **Test**: `pnpm test` → vitest on game-core package
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
