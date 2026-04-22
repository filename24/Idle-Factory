<!-- Generated: 2026-04-22 | Files scanned: 15 | Token estimate: ~850 -->

# Game-Core Codemap: Pure Domain Logic

**Package:** `packages/game-core`

**Purpose:** Pure TypeScript calculation logic, zero I/O dependencies. Shared by both bot and future web app.

## Module Structure

```
src/
├─ index.ts                  ← Barrel re-exports + version
├─ types.ts                  ← Shared enums & interfaces
├─ factories/
│   ├─ catalog.ts            Factory specs & lookup
│   ├─ cost.ts               Build, upgrade, move, demolish costs
│   └─ production.ts         Tick → production/consumption calculation
├─ warehouse/
│   └─ capacity.ts           Capacity formula & upgrade cost
├─ land/
│   ├─ layout.ts             Spatial validation, cell occupation
│   └─ specialSlots.ts       Bonus probability generator
└─ xp/
    └─ level.ts              XP accumulation & level-up math
```

## Type Contracts

**File:** `src/types.ts`

### Domain Types

```ts
// Factory variants (enum-like string unions, must sync with Prisma)
type FactoryType = 'FARM' | 'MINE' | ... | 'CAR_FACTORY'
type FactoryTier = 'T1' | 'T2' | 'T3'
type MaterialType = 'GRAIN' | 'ORE' | ... | 'RAW_BOOSTER'
type SlotType = 'NORMAL' | 'ORE' | 'FERTILE' | 'FOREST' | 'OIL' | 'WATER'
type UpgradeBooster = 'SAVING' | 'RARE' | 'SPEED' | 'PROFIT'
type ShortageMode = 'PAUSE' | 'AUTO_BUY' | 'PARTIAL'

// Value object: resources by type
type MaterialBag = Partial<Record<MaterialType, bigint>>

// Factory layout
interface FactorySize {
  readonly width: number   // 1 for T1/T2, 2 for T3
  readonly height: number  // 1 for T1/T2, 2 for T3
}

// Minimal state needed for production calculation
interface FactoryState {
  readonly type: FactoryType
  readonly grade: number               // 1..10
  readonly lastHarvestAt: Date
  readonly shortageMode: ShortageMode
  readonly upgradeBooster: UpgradeBooster | null
  readonly hasRawBooster: boolean      // Lv50+ permanent
}

// Land grid cell state
interface SlotState {
  readonly x: number
  readonly y: number
  readonly type: SlotType
  readonly factoryId: string | null
}
```

## Factory Catalog

**File:** `src/factories/catalog.ts`

```ts
interface FactoryCatalogEntry {
  readonly type: FactoryType
  readonly tier: FactoryTier
  readonly size: FactorySize // { width: 1, height: 1 } or { 2, 2 }
  readonly baseProduction: bigint // per tick (10 min)
  readonly inputMaterial: MaterialType
  readonly outputMaterial: MaterialType
  readonly baseConsumption: bigint // input per tick
}

export const FACTORY_CATALOG: Readonly<Record<FactoryType, FactoryCatalogEntry>>
```

Example:

```
FARM: {
  type: 'FARM',
  tier: 'T1',
  size: { width: 1, height: 1 },
  baseProduction: 5n,          // 5 grain per tick
  inputMaterial: 'WATER',      // consumes water if partial mode
  outputMaterial: 'GRAIN'
}

CAR_FACTORY: {
  type: 'CAR_FACTORY',
  tier: 'T3',
  size: { width: 2, height: 2 },
  baseProduction: 1n,          // 1 car per 10 ticks
  inputMaterial: 'STEEL'       // + FUEL + PLASTIC
  outputMaterial: 'CAR'
}
```

Exports:

- `FACTORY_CATALOG` — Full lookup table
- `getFactorySize(type)` — Return { width, height }

## Cost Calculations

**File:** `src/factories/cost.ts`

```ts
// Build: T1=100, T2=500, T3=2000 money
buildCost(type: FactoryType): bigint

// Upgrade: escalating cost per grade
// Tier-based material multiplier; see docs/design/XX
upgradeMoneyCost(type: FactoryType, currentGrade: number): bigint
upgradeMaterialCost(type: FactoryType, currentGrade: number): MaterialBag

// Move (Phase 2): fraction of build cost
moveCost(type: FactoryType): bigint

// Demolish: 50% refund of build cost (floor)
demolishRefund(type: FactoryType): bigint

// Land expansion (Phase 2): escalating per purchase
landExpansionCost(userLevel: number, nextLandIndex: 1..4): bigint
```

All costs return `bigint` for precision.

## Production Calculation

**File:** `src/factories/production.ts`

```ts
interface ProductionResult {
  produced: MaterialBag // output materials
  consumed: MaterialBag // input materials (if partial/auto-buy)
  available: MaterialBag // current inventory check
  status: 'ACTIVE' | 'PAUSED' // shortage mode result
}

function calculateProduction(
  factory: FactoryState,
  warehouse: MaterialBag, // current inventory
  ticks: number, // elapsed ticks since lastHarvestAt
  level: number, // user level (for booster effects)
): ProductionResult
```

Core formula:

```
baseTick = FACTORY_CATALOG[type].baseProduction
gradeMultiplier = 1.5 ^ (grade - 1)

if (upgradeBooster === SPEED) {
  tickOutput = baseTick × gradeMultiplier × 1.15
} else {
  tickOutput = baseTick × gradeMultiplier
}

if (hasRawBooster) {
  tickOutput = tickOutput × 1.2
}

totalProduced = tickOutput × ticks

if (shortageMode === PAUSE && notEnoughInput) {
  status = PAUSED, produced = 0
} else if (shortageMode === PARTIAL && notEnoughInput) {
  produced = proportional (ticks × availableInput / baseInput)
} else {
  produced = totalProduced
}
```

Special slots add production bonuses:

- ORE slot: MINE +20%
- FERTILE: FARM +20%
- FOREST: LUMBER +20%
- OIL: OIL_WELL +30%
- WATER: adjacent FARM/FLOUR_MILL +10%

## Warehouse

**File:** `src/warehouse/capacity.ts`

```ts
function capacityForGrade(grade: number): bigint
// Returns: 1000n × (1.5 ^ (grade - 1))
// Grade 1: 1000, Grade 2: 1500, ..., Grade 10: ~38,443

function upgradeCapacityCost(currentGrade: number): {
  money: bigint
  materials: MaterialBag
}
// Escalating cost per tier
```

## Land Layout

**File:** `src/land/layout.ts`

```ts
// Check if factory fits at (x, y) with size (width, height)
// Returns: true if all cells empty, false if collision
function canPlace(slots: SlotState[], x: number, y: number, size: FactorySize): boolean

// Get all cells occupied by a factory placed at (x, y)
function getOccupiedCells(x: number, y: number, size: FactorySize): Array<{ x: number; y: number }>

// Get bonus modifier for a factory on special slot(s)
// E.g., MINE on ORE slot = 1.2 multiplier
function getSpecialSlotBonus(
  slotTypes: SlotType[], // cells under factory
  factoryType: FactoryType,
): number
```

## Special Slots

**File:** `src/land/specialSlots.ts`

```ts
interface SpecialSlotConfig {
  readonly slots: SlotType[]
  readonly chances: number[] // Weighted probabilities
}

// Generate random slot layout for a land
// Injected RNG for determinism in tests
function generateSpecialSlots(
  width: number,
  height: number,
  rng?: () => number, // Optional custom RNG (default: Math.random)
): SlotType[][]

// Probability distribution (configurable per land index):
// Index 1: 5% ORE, 5% FERTILE, 5% FOREST, 5% OIL, 5% WATER → 80% NORMAL
// Index 2-5: scaled increases
```

## XP & Leveling

**File:** `src/xp/level.ts`

```ts
// XP required to reach next level
function xpForLevel(level: number): bigint
// Formula: xp = 100 × 2^(level - 1)
// Level 1: 0 XP, Level 2: 100 XP, Level 3: 200, Level 4: 400, ...

// Award XP for specific event
function xpForEvent(
  event: 'HARVEST' | 'UPGRADE' | 'SELL' | 'TRADE' | 'DISCOVER',
  context?: { itemCount?: number; priceUSD?: number },
): bigint

// Check if user levels up
function checkLevelUp(
  currentXP: bigint,
  level: number,
): {
  leveledUp: boolean
  newLevel?: number
  remainderXP?: bigint
}

// Get tier bonus multiplier (applied at level thresholds)
function getTierBonus(level: number): number
// Level 10: 1.1x, Level 20: 1.2x, Level 30: 1.3x, ...
```

Example XP rewards (Phase 1):

```
Harvest: 5 XP per factory
Upgrade: 20 XP
Sell: 1 XP per 100 money
Discover (rare drop): 50 XP
```

## Testing

**File:** `tests/`

Unit tests using Vitest, all formulas covered:

- `capacity.test.ts` — Warehouse capacity formula
- `catalog.test.ts` — Factory lookups & sizes
- `cost.test.ts` — Build, upgrade, move, demolish costs
- `production.test.ts` — Tick calculation with boosters & shortage modes
- `level.test.ts` — XP accumulation & level-up detection
- `land.test.ts` — Spatial validation, special slot bonus
- `smoke.test.ts` — Integration smoke tests

Run via: `pnpm test` (watch: `pnpm test:watch`)

## Build & Exports

**File:** `package.json`, `tsup.config.ts`

Bundler: `tsup`

- Outputs: `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts`
- Zero runtime deps
- Pure domain logic, safe for tree-shaking

Consumers import:

```ts
import {
  buildCost,
  calculateProduction,
  canPlace,
  FACTORY_CATALOG,
  xpForLevel,
  type FactoryState,
  type MaterialBag,
} from '@idle/game-core'
```

## Design Documents

Every numeric constant is cited to `docs/design/XX-*.md`:

| Module                       | Design Doc                                                   |
| ---------------------------- | ------------------------------------------------------------ |
| Factories, costs, production | `docs/design/03-factories.md`, `docs/design/04-materials.md` |
| Warehouse                    | `docs/design/05-warehouse.md`                                |
| Land, slots                  | `docs/design/11-land.md`                                     |
| XP, leveling                 | `docs/design/09-level-xp.md`                                 |

---

**Related codemaps:** [architecture.md](architecture.md) | [data.md](data.md)
