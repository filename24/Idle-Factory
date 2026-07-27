# @idle/database — Prisma + Redis Client

Thin wrapper around Prisma Client with optional Redis via ioredis. Re-exports the full Prisma namespace so consumers don't depend on `@prisma/client` directly.

## Contents

```
src/
├─ index.ts                Re-exports: `export * from '@prisma/client'` + `DatabaseClient`
└─ structures/
    └─ Client.ts           `DatabaseClient extends PrismaClient` with optional Redis
prisma/
├─ schema.prisma           Prisma schema (PostgreSQL)
└─ seed.js                 Seed script
prisma.config.ts           Prisma v6 config
```

## Data Model (overview)

Defined in `prisma/schema.prisma`, provider `postgresql`, URL from `DATABASE_URL`:

- **User** `id, flag (BigInt), nickname?, lang, factory[]`
- **Guild** `id, name, lang, tax, globalExp, flag`
- **Stock** `id, name, price (BigInt), latestPrice (BigInt[]), boughtCount, soldCount`
- **Factory** `id, ownerId, owners[], exp, type (BigInt), flag (BigInt), workers[], items[]`
- **Item** `id (cuid), factoryId, name, count, price, flag, factory`
- **Worker** `id (cuid), factoryId?, flag, name, job, exp, athletics, strength, machinery`
- **Notice** `id (uuid), title, description, postedAt, updatedAt` — indexed on `title`, `postedAt`

Timestamps use Prisma `DateTime` (ISO 8601 / RFC 3339 on the wire, e.g. `2026-04-19T10:58:00.000Z`). Any schema change requires re-running `pnpm db:generate` and committing updated Prisma artifacts.

## DatabaseClient API

```ts
import { DatabaseClient } from '@idle/database'

const db = new DatabaseClient({ useRedis: true })
// db.user, db.guild, ... (from PrismaClient)
// db.redis  — ioredis instance when useRedis=true
await db.disconnect()
```

- `options.useRedis` defaults to `false`. When `true`, uses `options.redis` (RedisOptions) or falls back to `process.env.REDIS_URL`.
- Calls `this.$connect()` on construction and logs the outcome.
- Declares `globalThis.db: DatabaseClient | undefined` for optional singleton reuse in dev.

## Environment

- `DATABASE_URL` — PostgreSQL connection string (required for any Prisma task).
- `REDIS_URL` — optional; consumed when `useRedis: true` and no explicit `options.redis` is given.

## Scripts

| Command                  | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `pnpm build`             | Bundle with `tsup`.                        |
| `pnpm lint` / `format`   | Prettier check / write.                    |
| `pnpm studio`            | `prisma studio`.                           |
| `pnpm db:format`         | `prisma format` — canonicalize schema.     |
| `pnpm db:generate`       | `prisma generate` — produce client.        |
| `pnpm db:push`           | Push schema without migrations (dev-only). |
| `pnpm db:migrate:dev`    | Create + apply a migration locally.        |
| `pnpm db:migrate:deploy` | Apply migrations (prod / CI).              |

Turbo's root `db:generate` task is `cache: false` and is a dependency of `build`/`dev`.

## Migrator Image

`Dockerfile` builds a one-shot image whose only job is `prisma migrate deploy`.
**The build context is the repository root:**

```bash
docker build -f packages/database/Dockerfile -t idle-factory-migrator .
```

It exists so `compose.prod.yml` can gate app startup on migration success
(`depends_on: { migrator: { condition: service_completed_successfully } }`). If the
migration fails, bot and web never start, and the two of them never race to migrate.

Constraints discovered the hard way:

- `pnpm deploy` is run **without** `--prod`. The `prisma` CLI and `dotenv` are
  devDependencies here, and both are needed to run a migration. A `--prod` tree has
  no `prisma` binary in `node_modules/.bin`.
- `package.json`'s `files: ["dist"]` means `pnpm deploy` drops `prisma/` and
  `prisma.config.ts`. The Dockerfile copies both explicitly.
- The entrypoint calls `./node_modules/.bin/prisma` directly, never `pnpm exec`.
  pnpm runs a dependency-status check first and tries `pnpm install`, which makes
  corepack download a new pnpm and write into a root-owned `/app` as a non-root
  user — `EACCES`.
- `schema.prisma`'s datasource block has no `url`; `prisma.config.ts` injects it
  from `DATABASE_URL`. Without that file the migrator has no target.
- Prisma's schema engine links against libssl, which `node:*-slim` lacks, so the
  runner installs `openssl`.

See [docs/ops/deployment.md](../../docs/ops/deployment.md) for the deploy,
rollback, and recovery runbook — including the expand/contract rule that keeps
image rollbacks viable despite Prisma having no down migrations.

## Conventions

- **Consume only via `@idle/database`.** Do not import from `@prisma/client` in apps — this package is the single integration point so the Prisma version and client generation stay consistent.
- **Migrations over `db push`.** Use `db:migrate:dev` locally to produce migration files; `db push` is acceptable only for throwaway sandboxes.
- **Connection lifecycle.** `DatabaseClient` auto-connects; long-running processes should call `disconnect()` on shutdown. Avoid constructing multiple clients per process.
- **BigInt fields** (`flag`, `type`, `price`, `latestPrice`) must be handled with `BigInt` end-to-end; do not coerce to `Number` where precision matters.
