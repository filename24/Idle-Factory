# eslint-config-idle — Shared ESLint Flat Config

Shared ESLint 9 flat configuration consumed by every TS workspace in the monorepo.

## Contents

```
src/
└─ index.js       Default export: tseslint.config(...)
```

`package.json` fields:
- `"type": "module"` — config is authored as ESM.
- `"main": "src/index.js"` — consumers import the default export directly.

## What It Enables

From `src/index.js`:

- `typescript-eslint` `recommended` preset.
- `eslint-plugin-prettier/recommended` — Prettier as an ESLint rule (`prettier/prettier: warn`).
- Relaxations suited to this codebase:
  - `@typescript-eslint/no-explicit-any: off`
  - `@typescript-eslint/ban-ts-comment: off`
  - `@typescript-eslint/explicit-module-boundary-types: off`
  - `@typescript-eslint/no-non-null-assertion: off`
- Ignores `**/dist/**`.

## Usage

In a consumer workspace's `eslint.config.js`:

```js
import idle from 'eslint-config-idle'
export default idle
```

Consumers can spread and extend:

```js
import idle from 'eslint-config-idle'
import tseslint from 'typescript-eslint'
export default [...idle, { /* package-specific overrides */ }]
```

The bot additionally uses `eslint-plugin-unused-imports`; the web app layers `eslint-config-next`. Keep package-specific plugins in the consumer, not in this shared config.

## Dependencies

Bundled directly (not devDeps) so consumers inherit them transitively:
- `eslint`, `typescript-eslint`
- `prettier`, `eslint-config-prettier`, `eslint-plugin-prettier`
- `@ianvs/prettier-plugin-sort-imports`
- `typescript`

## Conventions

- **Flat config only.** Do not reintroduce legacy `.eslintrc.*` artifacts.
- **Keep it minimal.** Rules added here affect every workspace; prefer package-local overrides unless the rule is truly universal.
- **No scripts.** There is no build step — changes to `src/index.js` are immediately visible to consumers in the workspace.
