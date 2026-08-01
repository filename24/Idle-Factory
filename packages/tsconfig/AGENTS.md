# tsconfig — Shared TypeScript Presets

Holds the shared `tsconfig` presets used across every TS workspace.

## Files

```
base.json     Common compilerOptions for libraries and apps
node16.json   CommonJS/ES2020 overlay extending base.json (unused by any workspace today)
```

### `base.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "Main",
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "outDir": "dist",
    "removeComments": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "newLine": "lf",
    "resolveJsonModule": true
  }
}
```

### `node16.json`

Extends `base.json` and pins `module: commonjs`, `target: ES2020`, `lib: ["ES2020"]` (module resolution stays `node`, inherited from `base.json` — this preset does not set `node16` anywhere). No workspace currently extends this preset; it exists as a candidate for packages that need a CommonJS/ES2020 target lower than the `ES2022` default in `base.json`.

## Usage

From any workspace `tsconfig.json`:

```json
{ "extends": "tsconfig/base.json" }
```

Add the dep as `"tsconfig": "workspace:^"` in `devDependencies`.

## Conventions

- **Single source of truth.** Do not copy these options into individual workspaces — always extend.
- **Strict is non-negotiable.** `strict: true` stays on. Packages that extend `base.json` (`apps/bot`, `packages/database`, `packages/game-core`, `packages/game-services`, `packages/api-types`) should add per-package `compilerOptions` only for framework-specific needs (path aliases, module target, etc.) — `apps/bot/tsconfig.json` is the reference example. `apps/web` is the one exception: as a Next.js app it ships a fully standalone `tsconfig.json` (own `jsx`, `moduleResolution: bundler`, etc.) rather than extending this preset.
- **No build step.** This package ships the `.json` files as-is; nothing to compile.
