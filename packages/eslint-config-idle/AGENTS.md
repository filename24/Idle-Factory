# eslint-config-idle — Shared ESLint Flat Config

Shared ESLint 9 flat configuration consumed by every TS workspace in the monorepo.

## Contents

```
src/
├─ index.js                          Default export (tseslint.config(...)) + discordV2Config named export
└─ rules/
   └─ no-discord-legacy-message.js   Custom rule enforcing Discord Components v2 (used via discordV2Config)
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
- `@typescript-eslint/no-unused-vars: error` (ignores `_`-prefixed args, vars, and caught errors).
- Ignores `**/dist/**`.

`src/index.js` also has a named export, `discordV2Config` — an opt-in Discord Components v2 enforcement config backed by the custom `discord-v2/no-discord-legacy-message` rule (`src/rules/no-discord-legacy-message.js`). It is consumed by `apps/bot/eslint.config.js` via `import idleConfig, { discordV2Config } from 'eslint-config-idle'`, spread alongside the default export.

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

export default [
  ...idle,
  {
    /* package-specific overrides */
  },
]
```

`apps/bot/package.json` lists `eslint-plugin-unused-imports` as a dependency, but it is not wired into `apps/bot/eslint.config.js` — unused-variable detection is handled by this shared config's `@typescript-eslint/no-unused-vars` rule instead. The web app layers `eslint-config-next`.

Consumer-only plugins (e.g. `eslint-config-next`) stay in the consumer's own `eslint.config.js`. Repo-important but selectively-applied rules — such as the bot-only Discord Components v2 enforcement (`discordV2Config`) — are instead bundled here as opt-in named exports so consumers pull them in explicitly.

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
