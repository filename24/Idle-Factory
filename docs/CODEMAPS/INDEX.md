<!-- Generated: 2026-04-22 | Files scanned: 50+ | Token estimate: ~400 -->

# Idle-Factory Codemaps Index

Quick navigation to all system architecture documentation. Each codemap is token-lean (under 1000 tokens) and designed for reference during development.

## Quick Start

Start here for your task:

- **"What does the bot do?"** → [backend.md](backend.md)
- **"How is data stored?"** → [data.md](data.md)
- **"Where does game logic live?"** → [game-core.md](game-core.md)
- **"How do systems interact?"** → [architecture.md](architecture.md)
- **"What dependencies do we use?"** → [dependencies.md](dependencies.md)

## Codemap Descriptions

### architecture.md

System-level overview: service boundaries, data flow, integration points.

**Contains:**

- 3-layer architecture diagram (Bot → Database → Postgres/Redis)
- Service boundary definitions (Bot, Services, Database, Game-Core)
- Data flow example (Factory Build)
- Build & configuration flow
- Cross-package dependency matrix

**Use when:** Understanding how major components communicate, planning new features, onboarding.

### backend.md

Bot commands, services, interaction handlers, and transaction patterns.

**Contains:**

- Command structure (game, info, dev commands with file:line references)
- Service layer API (FactoryService, HarvestService, WarehouseService, LandService, UserService)
- Interaction handlers (buttons, selects, modals)
- Utility modules (landNav, ComponentsV2, Logger, etc.)
- Bot client & listener structure
- Transaction pattern example

**Use when:** Implementing/modifying commands, adding services, debugging interactions.

### data.md

Prisma schema: tables, relationships, constraints, enums, BigInt handling.

**Contains:**

- Entity relationship diagram (User → Factory → Slot → Land)
- Table-by-domain reference (production, markets, stocks, settlement)
- Unique constraints & indexes for performance
- Enum definitions (FactoryType, MaterialType, SlotType, etc.)
- BigInt field list (precision requirements)
- Migration workflow

**Use when:** Adding/modifying DB schema, querying models, understanding relationships.

### game-core.md

Pure domain logic: factories, land, warehouse, XP calculations (zero I/O).

**Contains:**

- Module structure & purpose
- Type contracts (FactoryState, SlotState, MaterialBag)
- Factory catalog spec
- Cost formulas (build, upgrade, move, demolish, land expansion)
- Production calculation with boosters & shortage modes
- Warehouse capacity formula
- Land layout & special slots (bonuses)
- XP & leveling system
- Test coverage
- Design document references

**Use when:** Implementing game mechanics, adjusting formulas, using domain functions in bot/web.

### dependencies.md

External packages, services, build tools, and security configuration.

**Contains:**

- Production dependencies by package (with versions & purpose)
- External services (Discord API, PostgreSQL, Redis, GitHub)
- Build & dev tools (Turbo, tsup, vitest, husky, etc.)
- Monorepo integration (pnpm workspace, Turbo config)
- Security & secret management (env vars, GitHub secrets)
- Compatibility matrix (Node ≥20.19, platform support)

**Use when:** Adding a dependency, deploying, auditing security, troubleshooting build issues.

## Relationships

```
┌─────────────────┐
│ architecture.md │ ← Start here for system overview
└────────┬────────┘
         │
    ┌────┼────┬──────────────┬──────────────┐
    │    │    │              │              │
    │    ▼    ▼              ▼              ▼
    │ backend.md         data.md      game-core.md
    │  Commands &         Tables &       Pure Logic
    │  Services          Relations       Formulas
    │
    │  ┌──────────────────────────────────┐
    └─→│ dependencies.md                   │
       │ Packages, Services, Tools, Security│
       └──────────────────────────────────┘
```

## Key Files Referenced

### Architecture

- `apps/bot/src/config.ts` — Configuration validation
- `apps/bot/src/bot.ts` — Bot initialization
- `turbo.json` — Build orchestration
- `pnpm-workspace.yaml` — Workspace layout

### Backend

- `apps/bot/src/commands/game/` — Slash command handlers
- `apps/bot/src/services/` — Business logic layer
- `apps/bot/src/interaction-handlers/` — Button/select/modal handlers
- `apps/bot/src/structures/BotClient.ts` — Client extension

### Data

- `packages/database/prisma/schema.prisma` — Master schema
- `packages/database/src/structures/Client.ts` — DatabaseClient wrapper
- `packages/database/src/generated/` — Prisma-generated types (auto)

### Game-Core

- `packages/game-core/src/index.ts` — Barrel exports
- `packages/game-core/src/types.ts` — Type contracts
- `packages/game-core/src/factories/catalog.ts` — Factory specs
- `packages/game-core/src/factories/cost.ts` — Cost formulas
- `packages/game-core/src/factories/production.ts` — Tick calculation
- `packages/game-core/src/land/layout.ts` — Spatial validation
- `packages/game-core/src/xp/level.ts` — Leveling system

### Dependencies

- `apps/bot/package.json` — Bot dependencies
- `packages/database/package.json` — Database dependencies
- `packages/game-core/package.json` — Game-core (none listed)
- `.github/workflows/` — CI/CD secret usage

## Conventions

**Korean JSDoc:** All exported symbols in source code carry Korean `/** */` JSDoc blocks per repo rule. AGENTS.md files are English only.

**Design Document Citations:** Game formulas reference `docs/design/XX-*.md` in JSDoc comments.

**BigInt Precision:** All monetary/resource amounts use `bigint` to prevent precision loss.

**Immutability:** Values are never mutated; functions return new objects.

**Components v2:** All Discord bot responses use Components v2 API (mandatory).

## Discovery Workflow

If you need to find something:

1. **Understand the question:**
   - Data model? → [data.md](data.md)
   - Bot command? → [backend.md](backend.md)
   - How things connect? → [architecture.md](architecture.md)
   - Game mechanic? → [game-core.md](game-core.md)
   - Dependency version? → [dependencies.md](dependencies.md)

2. **Use file:line references:** Every codemap includes file paths and line numbers so you can jump straight to source.

3. **Follow the design docs:** Numeric formulas in [game-core.md](game-core.md) link back to `docs/design/XX-*.md` for rationale.

## Maintenance

These codemaps are **generated** from the live codebase and should be regenerated when:

- **New major features** land (commands, services, schema changes)
- **Packages added/removed** (workspace layout changes)
- **Design formulas updated** (game-core calculations)
- **API routes added** (if web dashboard launches)

To regenerate:

```bash
# Future: automated codemap generation script
# For now, manually review changes and update files
npx tsx scripts/codemaps/generate.ts
```

Last updated: **2026-04-22**

---

**Related:** [AGENTS.md](/AGENTS.md) | [README.md](/README.md)
