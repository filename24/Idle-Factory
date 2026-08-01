<!-- Generated: 2026-04-22 | Files scanned: 10 | Token estimate: ~700 -->

# External Dependencies & Integrations

## Production Dependencies by Package

### apps/bot

| Package                    | Version   | Purpose                                             | Status        |
| -------------------------- | --------- | --------------------------------------------------- | ------------- |
| `@sapphire/framework`      | 5.3.7     | Discord bot framework (commands, listeners, pieces) | ✓ Active      |
| `@sapphire/pieces`         | 4.3.9     | Plugin system for modular loaders                   | ✓ Active      |
| `@sapphire/plugin-i18next` | 8.0.0     | i18n integration for multi-language                 | ✓ Active      |
| `@sapphire/snowflake`      | 3.5.4     | Discord snowflake utilities                         | ✓ Active      |
| `discord.js`               | 14.26.3   | Discord API client                                  | ✓ Active      |
| `@idle/database`           | workspace | Prisma + Redis wrapper                              | ✓ Internal    |
| `@idle/game-core`          | workspace | Pure domain logic                                   | ✓ Internal    |
| `i18next`                  | 26.0.5    | i18n core (plugin dep)                              | ✓ Active      |
| `chalk`                    | 5.6.2     | Terminal color output                               | ✓ Active      |
| `winston`                  | 3.19.0    | Structured logging                                  | ✓ Active      |
| `dotenv`                   | 16.0.0    | .env file loading                                   | ✓ Active      |
| `uuid`                     | 9.0.0     | UUID generation                                     | ✓ Active      |
| `strip-ansi`               | 7.1.0     | ANSI color stripping                                | ✓ Active      |
| `dokdo`                    | 1.1.0     | REPL utility for eval                               | ✓ Dev utility |

### packages/database

| Package              | Version | Purpose                         | Status           |
| -------------------- | ------- | ------------------------------- | ---------------- |
| `@prisma/client`     | 7.0.0   | Type-safe DB client (generated) | ✓ Core           |
| `@prisma/adapter-pg` | 7.0.0   | PostgreSQL driver adapter       | ✓ Core           |
| `prisma`             | 7.0.0   | CLI + migration tools           | ✓ Dev            |
| `ioredis`            | 5.10.1  | Redis client (optional)         | ✓ Optional cache |
| `dotenv`             | 16.4.5  | Env config loading              | ✓ Dev            |

### packages/game-core

| Package  | Version | Purpose                    | Status       |
| -------- | ------- | -------------------------- | ------------ |
| **None** | —       | Pure domain, zero I/O deps | ✓ Guaranteed |

### packages/api-types

| Package  | Version | Purpose                | Status       |
| -------- | ------- | ---------------------- | ------------ |
| **None** | —       | Shared type stubs only | ✓ Guaranteed |

### apps/web

| Package           | Version   | Purpose                           | Status     |
| ----------------- | --------- | --------------------------------- | ---------- |
| `next`            | 16.2.4    | React framework                   | ✓ Active   |
| `react`           | 19.2.5    | UI library                        | ✓ Active   |
| `react-dom`       | 19.2.5    | React DOM renderer                | ✓ Active   |
| `tailwindcss`     | ^4.2.2    | CSS utility framework (dev dep)   | ✓ Active   |
| `typescript`      | ^6.0.3    | Type checking (dev dep, hoisted)  | ✓ Active   |
| `better-auth`     | 1.6.9     | Discord OAuth authentication      | ✓ Active   |
| `fumadocs-core`   | 16.8.3    | Docs site engine (`/docs` route)  | ✓ Active   |
| `fumadocs-ui`     | 16.8.3    | Docs UI components                | ✓ Active   |
| `next-intl`       | 4.13.4    | i18n (ko/en, cookie-based locale) | ✓ Active   |
| `@sentry/nextjs`  | ^10.68.0  | Error monitoring                  | ✓ Active   |
| `@idle/database`  | workspace | Prisma + Redis wrapper            | ✓ Internal |
| `@idle/game-core` | workspace | Pure domain logic                 | ✓ Internal |

Table above is representative, not exhaustive — `apps/web/package.json` declares 24
production dependencies and 16 dev dependencies in total.

> **Code reference**: `apps/web/src/app/page.tsx` assembles the real landing page
> from `HeroSection`/`CoreLoopSection`/`FactoryShowcase`/`EconomySection`/`CtaSection`,
> `apps/web/src/lib/auth.ts` wires `better-auth` with Discord OAuth, and
> `next.config.js` (`output: 'standalone'`) plus `apps/web/Dockerfile` build a
> deployable production image.

## External Services

### Discord API

**Endpoint:** `https://discord.com/api/v10` (via discord.js v14)

**Used for:**

- Slash command registration (global + dev guild)
- Interaction dispatch (button, select, modal)
- Message content (Component v2 rendering)
- Guild/user metadata fetch

**Authentication:** `BOT_TOKEN` environment variable

**Rate limits:**

- Global: 50 reqs/sec
- Per-route: varies (typically 5–10 reqs/sec)
- Sapphire/discord.js handle backoff automatically

### PostgreSQL

**Connection:** `DATABASE_URL` (env variable)

**Schema:** 25 tables (User, Guild, Factory, Stock, Market, etc.)

**Used for:**

- Primary data store (Prisma ORM)
- Transactions (ACID isolation)
- Indexing (created_at, user_id, etc.)
- Web auth session storage (`AuthSession` model via `better-auth`'s Prisma adapter)

**Driver:** `@prisma/adapter-pg` (native)

**Pool config:** Managed by Prisma (default 10 connections)

### Redis (Optional)

**Connection:** `REDIS_URL` (env variable, optional)

**Used for:**

- GlobalMarketPrice cache (30-min TTL)
- Rate limit tracking (sliding window)

Web auth session state is **not** stored in Redis — it lives in PostgreSQL (see
above). `apps/web/src/lib/db.ts` constructs its `DatabaseClient` with
`useRedis: false`.

**Client:** `ioredis` 5.10.1

**Integration:** `DatabaseClient` constructor accepts `useRedis: boolean`

### GitHub API (Dev-only)

**Endpoint:** `https://api.github.com`

**Used for:**

- Fetch repo metadata (optional `GITHUB_TOKEN`)
- Build number fallback: `git rev-parse --short HEAD` if `BUILD_NUMBER` env unset

**Rate limits:**

- Unauthenticated: 60 reqs/hour
- Authenticated: 5000 reqs/hour

## Build & Dev Tools

| Tool          | Version | Purpose                            | Workspace     |
| ------------- | ------- | ---------------------------------- | ------------- |
| `tsup`        | 8.5.1   | Fast TypeScript bundler            | All packages  |
| `tsx`         | 4.19.4  | TypeScript runtime (dev)           | bot, database |
| `turbo`       | 2.9.6   | Task orchestration                 | Root          |
| `typescript`  | 6.0.3   | Type checker                       | All           |
| `eslint`      | 9.0.0   | Linter (flat config)               | All           |
| `prettier`    | 3.8.3   | Code formatter                     | All           |
| `vitest`      | 2.1.8   | Unit test runner                   | game-core     |
| `commitlint`  | 20.5.0  | Git hook validator                 | Root          |
| `husky`       | 9.1.7   | Git hooks (pre-commit, commit-msg) | Root          |
| `lint-staged` | 16.4.0  | Staged file formatter/linter       | Root          |

### Dev Dependencies (Root)

```json
{
  "@turbo/gen": "^2.9.6",
  "@types/node": "^22.0.0",
  "eslint": "^9.0.0",
  "husky": "^9.1.7",
  "is-ci": "^4.1.0",
  "lint-staged": "^16.4.0",
  "prettier": "^3.8.3",
  "tsup": "^8.5.1",
  "turbo": "^2.9.6",
  "typescript": "^6.0.3"
}
```

## Monorepo Integration

### Turbo Configuration

**File:** `turbo.json`

```json
{
  "globalEnv": ["DATABASE_URL", "REDIS_URL", "BOT_TOKEN", "NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build", "db:generate"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

### pnpm Workspace

**File:** `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

All internal dependencies use `workspace:^` protocol.

## Security & Secret Management

### Environment Variables

**Required (production):**

- `BOT_TOKEN` — Discord bot secret
- `DATABASE_URL` — PostgreSQL connection string
- `NODE_ENV` — Should be `production`

**Optional (production):**

- `REDIS_URL` — Redis connection string

**Development:**

- Copy `.env.example` → `.env` (gitignored)
- Local PostgreSQL via Docker: `pnpm db:dev:up`

### GitHub Secrets

Used in CI workflows (`.github/workflows/`):

- `DISCORD_BOT_TOKEN` → Deploys, tests
- `DATABASE_URL` → Migration, seed
- `REDIS_URL` → Caching tests (optional)

Never commit secrets; use Actions secrets exclusively.

### Dependency Auditing

```bash
# Check for known vulnerabilities
npm audit --production
# or
pnpm audit
```

High/Critical findings block deploy in CI.

## Compatibility Matrix

| Component          | Node    | Platform              | Status   |
| ------------------ | ------- | --------------------- | -------- |
| apps/bot           | ≥ 20.19 | Linux, macOS, Windows | ✓ Tested |
| packages/database  | ≥ 20.19 | Linux, macOS, Windows | ✓ Tested |
| packages/game-core | ≥ 18    | Any (pure JS)         | ✓ Tested |
| apps/web           | ≥ 18    | Any (Next.js)         | ✓ Tested |

---

**Related codemaps:** [architecture.md](architecture.md)
