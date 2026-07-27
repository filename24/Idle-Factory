# apps/web — Next.js Web App

The public web surface for Idle Factory. Currently a thin Next.js 15 scaffold; treat this as the landing/dashboard target.

## Stack

- **Framework:** Next.js 15.3 (App Router).
- **UI:** React 19 + React DOM 19.
- **Styling:** Tailwind CSS v4 (`@tailwindcss/postcss`), Prettier Tailwind plugin, Autoprefixer, PostCSS.
- **Lint:** ESLint 9 flat config via `eslint-config-idle` + `eslint-config-next`.
- **TypeScript:** extends `tsconfig/base.json`.

## Directory Layout

```
src/app/
├─ layout.tsx      Root layout
├─ page.tsx        Home page (default create-next-app scaffold)
├─ globals.css     Tailwind entry
└─ favicon.ico
public/            Static assets (shipped as-is)
next.config.js     Next.js config
tailwind.config.ts Tailwind content globs + theme
postcss.config.js  PostCSS pipeline (Tailwind v4)
```

The current `page.tsx` is an untouched `create-next-app` template — replace it rather than layering on top when starting real UI work.

## Scripts

| Command      | Purpose                                     |
| ------------ | ------------------------------------------- |
| `pnpm dev`   | `next dev`.                                 |
| `pnpm build` | `next build` (outputs `.next/`).            |
| `pnpm start` | `next start` (serves the built app).        |
| `pnpm lint`  | `next lint` (wraps the flat ESLint config). |

Turbo overrides `web#build` inputs/outputs in the root `turbo.json` so Next's `.next/cache/**` is excluded from the cache artifact set.

## shadcn/ui Components

**Always install shadcn components via the CLI — never write them by hand (MANDATORY).**

When a shadcn/ui component is needed, run the CLI from the `apps/web` directory:

```bash
pnpm dlx shadcn@latest add <component-name>
```

Examples:

```bash
pnpm dlx shadcn@latest add dropdown-menu
pnpm dlx shadcn@latest add dialog tooltip select
```

Rules:

- Do not manually create files under `src/components/ui/` for components that shadcn provides.
- Use `--overwrite` if a component file already exists and needs to be refreshed.
- After installation, all required peer dependencies (e.g. `@base-ui/react`, `class-variance-authority`) are automatically resolved — run `pnpm install` from the repo root if missing packages are reported.
- The active style is `base-nova` (configured in `components.json`). Do not change the style without explicit instruction.

## Conventions

- **App Router only.** Keep route segments, layouts, loading/error boundaries, and server components under `src/app/`. Use `"use client"` sparingly and only at leaves.
- **Server components by default.** Move data fetching to server components / route handlers; pass minimal props to client islands.
- **Styling:** Tailwind v4 utility classes. Centralize tokens in `tailwind.config.ts` / `globals.css` (`@theme`); avoid hardcoded colors and magic spacing.
- **Accessibility:** Use semantic HTML; hero/landing surfaces should meet the web design-quality bar (intentional hierarchy, real hover/focus states, no template-looking defaults).
- **Performance targets:** LCP < 2.5s, INP < 200ms, CLS < 0.1. Images must declare explicit `width`/`height` and use `next/image`.
- **Imports:** Use `@idle/api-types` for shared DTOs; do not duplicate types from the bot.

## Environment

No app-specific env is wired yet. When adding env access, prefer `process.env.NEXT_PUBLIC_*` for browser-exposed values and validate server-only env at module load.

## Build/Deploy

`next.config.js` sets `output: 'standalone'` plus `outputFileTracingRoot` pointed at
the workspace root, so `next build` emits a self-contained server at
`.next/standalone/apps/web/server.js`. File tracing pulls in `@prisma/client`, `pg`,
and `ioredis`; the `@idle/*` workspace packages are inlined into the server bundle.

`Dockerfile` builds the production image. **The build context is the repository
root** — the image runs `turbo prune web --docker` inside the container:

```bash
docker build -f apps/web/Dockerfile -t idle-factory-web .
```

Notes:

- `.next/static` and `public/` are **not** traced. The Dockerfile copies them
  explicitly; omitting them yields a page that renders with every asset 404ing.
- The build needs a dummy `DATABASE_URL`. `src/lib/db.ts` constructs
  `DatabaseClient` at module load and `src/lib/env.ts`'s build-phase escape hatch
  does not cover `DATABASE_URL`.
- `NEXT_PUBLIC_*` values are substituted into the client bundle at build time and
  cannot be injected at runtime. `NEXT_PUBLIC_APP_URL` is exposed as a build arg
  and left empty by default, which makes better-auth's client fall back to the
  relative `/api/auth` path (correct for same-origin deployments).
- Runtime env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

`GET /api/health` is a liveness probe (see `src/lib/health.ts`) used by the
container healthcheck. It deliberately does not touch the database — a DB blip must
not push web into a restart loop.

See [docs/ops/deployment.md](../../docs/ops/deployment.md) for the deploy,
rollback, and recovery runbook.
