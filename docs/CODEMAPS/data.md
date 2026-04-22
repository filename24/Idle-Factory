<!-- Generated: 2026-04-22 | Files scanned: 1 | Token estimate: ~950 -->

# Data Model Codemap: Prisma Schema

**Schema location:** `packages/database/prisma/schema.prisma`

## Core Entity Relationships

```
User (id: snowflake)
  ├─ 1:1 Warehouse (grade 1..10, capacity formula)
  ├─ 1:N Land (max 5, index 1..5)
  │   └─ 1:N Slot (4×4 default = 16 cells per land)
  │       └─ ?:1 Factory (factoryId null = empty)
  ├─ 1:N Factory (owned, on lands)
  │   ├─ 1:N Worker (staff)
  │   └─ 1:1 Stock (if listed)
  ├─ 1:N MarketListing (user shop)
  ├─ 1:N StockHolding (portfolio)
  └─ 1:N TradeLog (audit trail)

Guild (id: snowflake)
  ├─ 1:N Factory (guild affiliations)
  ├─ 1:N Stock (SERVER market)
  └─ 1:N WeeklySettlement (tax records)
```

## Tables by Domain

### Users & Auth

| Table     | Key Fields                                   | Purpose                             |
| --------- | -------------------------------------------- | ----------------------------------- |
| **User**  | `id`, `level`, `xp`, `money`, `flag`, `lang` | Player account, wallet, progression |
| **Guild** | `id`, `credit`, `vault`, `taxSurcharge`      | Server config, tax rate (0–20%)     |

### Production System

| Table              | Key Fields                                               | Purpose                                                    |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| **Factory**        | `id`, `type`, `tier`, `grade`, `landId`, `lastHarvestAt` | Core factory state                                         |
| **Worker**         | `id`, `factoryId`, `athletics`, `strength`, `machinery`  | Staff with 3 stat tracks                                   |
| **Warehouse**      | `userId`, `grade`                                        | Unified inventory (capacity = 1000 × 1.5^(g-1))            |
| **WarehouseStack** | `warehouseId`, `material`, `count`                       | Per-material inventory (BigInt)                            |
| **Land**           | `userId`, `index`, `width`, `height`                     | 1–5 lands per user, default 4×4                            |
| **Slot**           | `landId`, `x`, `y`, `type`, `factoryId`                  | Grid cell; types: NORMAL, ORE, FERTILE, FOREST, OIL, WATER |

### Markets & Trading

| Table                 | Key Fields                                                  | Purpose                                                   |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| **GlobalMarketPrice** | `material` (PK), `currentPrice`, `recentSales`, `updatedAt` | Global commodity prices (30-min refresh)                  |
| **MarketListing**     | `id`, `material`, `qty`, `price`, `taxRate`, `expiresAt`    | User shop entries (1–30 day duration)                     |
| **DailyPurchase**     | `userId`, `date`                                            | Track direct-buy allowance (100/500/2000/10000 by level)  |
| **TradeLog**          | `fromUserId`, `toUserId`, `kind`, `amount`                  | Audit: MARKET_SELL, USER_TRADE, STOCK_BUY, DIVIDEND, etc. |

### Stock Market

| Table              | Key Fields                                                                 | Purpose                           |
| ------------------ | -------------------------------------------------------------------------- | --------------------------------- |
| **Stock**          | `factoryId`, `market` (SERVER/GLOBAL), `currentPrice`, `sharesOutstanding` | IPO + price history               |
| **StockHolding**   | `userId`, `stockId`, `shares`                                              | Portfolio snapshot                |
| **StockPriceTick** | `stockId`, `price`, `tickAt`                                               | 1-hour history ticks for charting |

### Governance & Settlement

| Table                  | Key Fields                                             | Purpose                                     |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------- |
| **WeeklySettlement**   | `userId`, `guildId`, `weekStart`, `taxPaid`            | Tax audit trail (Sun UTC)                   |
| **InactiveServerPool** | `guildId`, `frozenAmount`, `exitedAt`, `distributedAt` | 30-day hold, monthly distribute             |
| **Notice**             | `id` (uuid), `title`, `postedAt`, `updatedAt`          | Game announcements; indexed on title + date |

## Key Constraints & Indexes

### Unique Constraints

| Constraint                              | Tables    | Rationale                      |
| --------------------------------------- | --------- | ------------------------------ |
| `User.id`                               | Single    | Discord snowflake              |
| `Guild.id`                              | Single    | Discord snowflake              |
| `Land(userId, index)`                   | Composite | Max 5 lands per user           |
| `Slot(landId, x, y)`                    | Composite | Grid uniqueness                |
| `Warehouse.userId`                      | Single    | 1:1 per user                   |
| `WarehouseStack(warehouseId, material)` | Composite | 1 stack per material type      |
| `StockHolding(userId, stockId)`         | Composite | 1 holding per user per stock   |
| `MarketListing(material, status)`       | Indexed   | Fast active-listing scans      |
| `WeeklySettlement(userId, weekStart)`   | Composite | 1 settlement per week per user |

### Indexes for Performance

```
User: @@index([id])
Factory: @@index([userId]), @@index([landId]), @@index([guildId])
Slot: @@index([factoryId])
Worker: @@index([factoryId])
MarketListing: @@index([material, status]), @@index([expiresAt])
Stock: @@index([market])
TradeLog: @@index([fromUserId, createdAt]), @@index([kind, createdAt])
WeeklySettlement: @@index([guildId, weekStart])
```

## Enums (Mirrored in @idle/game-core)

### FactoryType (11 types, 3 tiers)

```
T1 (1×1, raw): FARM, MINE, LUMBER, OIL_WELL
T2 (1×1, process): STEEL_MILL, REFINERY, FLOUR_MILL, FURNITURE_FACTORY
T3 (2×2, finished): CAR_FACTORY, ELECTRONICS_FACTORY, FOOD_FACTORY
```

### MaterialType (13 types)

```
T1: GRAIN, ORE, WOOD, CRUDE_OIL
T2: STEEL, FUEL, PLASTIC, PROCESSED_FOOD, FURNITURE
T3: CAR, ELECTRONIC, FINISHED_FOOD
Special: RAW_BOOSTER (Lv50+ rare drop)
```

### SlotType (6 types)

```
NORMAL           → base slot
ORE              → MINE +20% production
FERTILE          → FARM +20%
FOREST           → LUMBER +20%
OIL              → OIL_WELL +30%
WATER            → adjacent FARM/FLOUR_MILL +10%
```

### UpgradeBooster (4 types, chosen at grades 3/5/7/10)

```
SAVING           → -20% input materials
RARE             → rare drop +1%
SPEED            → tick output +15%
PROFIT           → revenue +10%
```

### ShortageMode (3 types)

```
PAUSE            → production halts (default)
AUTO_BUY         → auto-purchase shortfall (Phase 2)
PARTIAL          → proportional output (Phase 2)
```

## BigInt Fields (Precision)

All monetary/resource amounts use `BigInt` to prevent precision loss:

| Field   | Table             | Units              | Range                 |
| ------- | ----------------- | ------------------ | --------------------- |
| `money` | User              | Discord Bot Points | 0–9223372036854775807 |
| `xp`    | User              | Experience         | 0–9223372036854775807 |
| `price` | GlobalMarketPrice | Currency           | 1–9223372036854775807 |
| `count` | WarehouseStack    | Resources          | 0–9223372036854775807 |
| `exp`   | Factory, Worker   | Experience         | 0–9223372036854775807 |

All database clients must handle `BigInt` → `string` → `BigInt` round-trips for JSON serialization.

## Timestamps

All datetime fields use Prisma `DateTime` (ISO 8601 on wire):

```
User: createdAt, lastActiveAt
Factory: lastHarvestAt, createdAt
MarketListing: registeredAt, expiresAt
Stock: lastTickAt, listedAt
TradeLog: createdAt
Notice: postedAt, updatedAt
```

## Generated Client

After schema edits:

```bash
pnpm db:generate        # Emit src/generated/client.js + types
pnpm db:format          # Canonicalize schema.prisma
pnpm db:push            # Validate against DB (dev-only)
pnpm db:migrate:dev     # Create migration file + apply
```

---

**Related codemaps:** [architecture.md](architecture.md) | [backend.md](backend.md)
