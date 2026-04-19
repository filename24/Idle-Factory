# tsconfig — Shared TypeScript Presets

Holds the shared `tsconfig` presets used across every TS workspace.

## Files

```
base.json     Common compilerOptions for libraries and apps
node16.json   Overlay for Node16 module resolution (Node runtimes)
```

### `base.json`

```json
{
  "display": "Main",
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
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

Used by packages that ship Node ESM/CJS dual builds and need `module: node16` / `moduleResolution: node16` resolution semantics.

## Usage

From any workspace `tsconfig.json`:

```json
{ "extends": "tsconfig/base.json" }
```

Add the dep as `"tsconfig": "workspace:^"` in `devDependencies`.

## Conventions

- **Single source of truth.** Do not copy these options into individual workspaces — always extend.
- **Strict is non-negotiable.** `strict: true` stays on. Add per-package `compilerOptions` only for framework-specific needs (e.g., Next.js `jsx: preserve`, path aliases).
- **No build step.** This package ships the `.json` files as-is; nothing to compile.
