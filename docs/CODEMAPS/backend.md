<!-- Generated: 2026-04-22 | Files scanned: 28 | Token estimate: ~900 -->

# Backend Codemap: Bot Commands & Services

## Command Structure

Root: `apps/bot/src/commands/`

### Game Commands

| Command      | File                    | Handler                                      | Purpose                                    |
| ------------ | ----------------------- | -------------------------------------------- | ------------------------------------------ |
| `/factory`   | `game/factory.ts:515`   | buildHandler, upgradeHandler, setModeHandler | Build, upgrade, change shortage mode       |
| `/land`      | `game/land.ts:662`      | viewHandler, buildHandler, expandHandler     | View land, place/destroy factories, expand |
| `/warehouse` | `game/warehouse.ts:158` | viewHandler, upgradeHandler                  | View inventory, upgrade capacity           |
| `/harvest`   | `game/harvest.ts:100`   | harvestHandler                               | Claim production (tick elapsed)            |
| `/profile`   | `game/profile.ts:75`    | profileHandler                               | View user level, XP, money, stats          |

### Info/Dev Commands

| Command         | File                      | Purpose                           |
| --------------- | ------------------------- | --------------------------------- |
| `/ping`         | `info/ping.ts:57`         | Latency check                     |
| `/announcement` | `info/announcement.ts:34` | Fetch notices from DB             |
| `/notice`       | `dev/notice.ts:68`        | [DEV] Post announcements          |
| `/attributes`   | `dev/Attributes.ts:129`   | [DEV] Inspect user/factory/worker |

## Service Layer

Root: `apps/bot/src/services/`

### BaseService

**File:** `base.ts`

Core abstractions:

- `ServiceError` (custom error with code, message)
- `Tx` type alias for Prisma transaction
- `runInTx(db, callback)` — ACID transaction wrapper

### FactoryService

**File:** `factory.ts:515`

Key methods:

- `build(params: BuildParams)` — Validate, cost check, create Factory + Slots
- `upgrade(params: UpgradeParams)` — Grade 1→10, select booster at tier thresholds
- `setMode(params: SetModeParams)` — Switch shortage mode (PAUSE/AUTO_BUY/PARTIAL)
- `destroy(params: DestroyParams)` — Demolish, partial refund

Constants:

- `MAX_GRADE = 10`
- `DEFAULT_LAND_INDEX = 1`

Dependency chain:

```
build()
  ├─ canPlace() [game-core] ✓ spatial validation
  ├─ buildCost() [game-core] ✓ money + materials
  └─ tx { Factory.create, Slot.update }
```

### HarvestService

**File:** `harvest.ts`

Key method:

- `harvestOne(factoryId)` — Tick elapsed → production/consumption, update warehouse, add XP

Tick formula:

```
ticks = (now - lastHarvestAt) / 10_minutes
production = tick_output × ticks × grade_multiplier × booster_effects
```

### WarehouseService

**File:** `warehouse.ts:158`

Key methods:

- `ensure(userId)` — Create warehouse if missing (grade 1)
- `upgrade(userId)` — Increase capacity, costs material + money

Capacity formula:

```
capacity = 1000 × (1.5 ^ (grade - 1))
```

### LandService

**File:** `land.ts`

Key methods:

- `ensure(userId)` — Create default 4×4 land (index 1)
- `buy(userId, index)` — Purchase land 2–5 (escalating cost)
- `expandFactory(factoryId, direction)` — Grow factory footprint (Phase 2)

Land rules:

- Max 5 lands per user (indices 1–5)
- Default: 4×4; T3 factories: 2×2 footprint
- Special slots: ORE, FERTILE, FOREST, OIL, WATER

### UserService

**File:** `user.ts`

Key methods:

- `ensure(userId, lang?)` — Lazy-init user with warehouse + default land
- `addXP(userId, amount, event)` — Award XP, check level-up, apply tier bonuses

Level formula:

```
level = floor(log_2(1 + xp / 100))
```

## Interaction Handlers

Root: `apps/bot/src/interaction-handlers/`

### Buttons

| Handler        | File                        | CustomId Pattern              | Purpose                          |
| -------------- | --------------------------- | ----------------------------- | -------------------------------- |
| landView       | `buttons/landView.ts`       | `land_view_{landId}`          | Render land grid UI              |
| landCell       | `buttons/landCell.ts`       | `land_cell_{slotId}`          | Show slot context menu           |
| factoryAction  | `buttons/factoryAction.ts`  | `factory_action_{factoryId}`  | Factory menu (upgrade/mode/info) |
| factoryDestroy | `buttons/factoryDestroy.ts` | `factory_destroy_{factoryId}` | Confirm demolish                 |

### Selects

| Handler   | File                   | CustomId Pattern      | Purpose                      |
| --------- | ---------------------- | --------------------- | ---------------------------- |
| landBuild | `selects/landBuild.ts` | `land_build_{slotId}` | Choose factory type to build |

### Modals

| Handler | File                | CustomId Pattern | Purpose |
| ------- | ------------------- | ---------------- | ------- |
| (stub)  | `modals/example.ts` | (placeholder)    | TBD     |

## Utility Modules

| Module       | File                    | Purpose                                              |
| ------------ | ----------------------- | ---------------------------------------------------- |
| landNav      | `utils/landNav.ts`      | Land grid navigation helpers (pagination, cell calc) |
| ComponentsV2 | `utils/ComponentsV2.ts` | Discord Components v2 builder (mandatory)            |
| Constants    | `utils/Constants.ts`    | Game constants (emoji, limits, defaults)             |
| Logger       | `utils/Logger.ts`       | Winston-based logger with chalk                      |
| SnowFlake    | `utils/SnowFlake.ts`    | Discord Snowflake parsing                            |
| Algorithms   | `utils/Algorithms.ts`   | Misc helpers (probabilities, formatting)             |

## Bot Client Structure

**File:** `structures/BotClient.ts`

Extends Sapphire.Client with:

- Load commands, listeners, interaction handlers
- i18next integration for multi-language responses
- Error manager hooks

**File:** `bot.ts`

Bootstrap:

- Initialize BotClient with intents (GuildMessages, Guilds)
- Hook process-level error handlers
- Call `client.login(BOT_TOKEN)`

**File:** `index.ts`

Runtime entry:

- Dev: direct import → `./bot.ts`
- Prod: optional ShardingManager if `BOT_SHARDING=true`

## Listeners

Root: `apps/bot/src/listeners/`

| Listener      | File               | Event                  | Purpose                                 |
| ------------- | ------------------ | ---------------------- | --------------------------------------- |
| ready         | `ready.ts`         | `client#ready`         | Log login, register global/dev commands |
| guildCreate   | `guildCreate.ts`   | `client#guildCreate`   | Track guild join, init guild record     |
| messageCreate | `messageCreate.ts` | `client#messageCreate` | Dokdo REPL (dev-only)                   |

Error listeners:

- `errors/chatInputCommand.ts` — Slash command error handler
- `errors/interaction.ts` — Interaction error dispatch
- `errors/message.ts` — Message command error (none currently)

## Transaction Pattern

All mutation operations wrap in Prisma tx:

```ts
export async function build(params: BuildParams): Promise<BuildResult> {
  return runInTx(db, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: params.userId } })
    if (!user) throw new ServiceError('USER_NOT_FOUND', '...')

    // Validate, cost check
    const cost = buildCost(type)
    if (user.money < cost) throw new ServiceError('INSUFFICIENT_FUNDS', '...')

    // Atomic update
    const factory = await tx.factory.create({ data: { ... } })
    await tx.user.update({
      where: { id: params.userId },
      data: { money: { decrement: cost } }
    })

    return { factoryId: factory.id }
  })
}
```

---

**Related codemaps:** [architecture.md](architecture.md) | [data.md](data.md)
