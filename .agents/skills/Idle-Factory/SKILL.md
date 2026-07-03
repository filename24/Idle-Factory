```markdown
# Idle-Factory Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you how to contribute to the Idle-Factory TypeScript codebase, a Discord bot project with a focus on modular commands, internationalization (i18n), and robust feature workflows. You will learn the project's coding conventions, commit patterns, and step-by-step workflows for adding features, commands, and locale strings, as well as how to write and organize tests.

## Coding Conventions

- **Language:** TypeScript (no framework)
- **File Naming:** camelCase  
  Example: `marketCommands.ts`, `userProfile.ts`
- **Import Style:** Relative imports  
  ```ts
  import { getMarketItems } from '../../services/market';
  ```
- **Export Style:** Named exports  
  ```ts
  export function handleBuyCommand() { ... }
  ```
- **Commit Messages:** Conventional commits  
  Prefixes: `feat`, `fix`, `chore`, `refactor`, `docs`  
  Example:  
  ```
  feat: add buy/sell command to market system
  ```
- **Test Files:** Suffix `.test.ts`  
  Example: `marketService.test.ts`

## Workflows

### Add or Update Market Feature
**Trigger:** When adding or improving a market-related feature (e.g., buy/sell, UI, listing options) in the Discord bot.  
**Command:** `/new-market-feature`

1. **Modify or create the command handler:**  
   Edit or add `apps/bot/src/commands/game/market.ts` to implement new commands or update existing ones.
   ```ts
   // apps/bot/src/commands/game/market.ts
   export function buyItem(userId: string, itemId: string) { ... }
   ```
2. **Update or add interaction handlers:**  
   For buttons, modals, or selects related to market, update or create files in:
   - `apps/bot/src/interaction-handlers/buttons/market*.ts`
   - `apps/bot/src/interaction-handlers/modals/market*.ts`
   - `apps/bot/src/interaction-handlers/selects/market*.ts`
3. **Update locale files for i18n:**  
   Add or modify keys in:
   - `apps/bot/src/locales/en-US/game.json`
   - `apps/bot/src/locales/ko/game.json`
   ```json
   // en-US/game.json
   {
     "market": {
       "buy_success": "You bought {item}!"
     }
   }
   ```
4. **Modify or add service logic:**  
   Update `apps/bot/src/services/market.ts` or related service files for backend logic.
5. **Update or add utility files:**  
   If needed, update or create utilities in `apps/bot/src/utils/`.
6. **Write or update integration tests:**  
   Add or update tests in `apps/bot/tests/integration/market*.test.ts` to cover new or changed features.

---

### Add or Update Bot Command with Permissions
**Trigger:** When adding a new bot command or updating an existing one, especially with permission checks (e.g., owner-only).  
**Command:** `/new-bot-command`

1. **Create or modify command file:**  
   Add or update files in:
   - `apps/bot/src/commands/dev/*.ts`
   - `apps/bot/src/commands/game/*.ts`
   ```ts
   // apps/bot/src/commands/dev/debug.ts
   export function debugCommand(ctx) { ... }
   ```
2. **Implement or update permission/precondition logic:**  
   Edit or add files in `apps/bot/src/preconditions/` to enforce permissions.
   ```ts
   // apps/bot/src/preconditions/ownerOnly.ts
   export function ownerOnly(ctx) { ... }
   ```
3. **Optionally update related logic or service files** as needed.

---

### Add or Update i18n Locale Strings
**Trigger:** When adding or changing user-facing text or UI, requiring updates to locale files for multiple languages.  
**Command:** `/sync-i18n`

1. **Modify or add keys/strings in English locale:**  
   Edit `apps/bot/src/locales/en-US/game.json`.
2. **Modify or add corresponding keys/strings in Korean locale:**  
   Edit `apps/bot/src/locales/ko/game.json`.
   ```json
   // ko/game.json
   {
     "market": {
       "buy_success": "{item}을(를) 구매했습니다!"
     }
   }
   ```

---

## Testing Patterns

- **Framework:** [Vitest](https://vitest.dev/)
- **Test File Pattern:** Files end with `.test.ts`
- **Location:** Tests are placed alongside source files or in `apps/bot/tests/integration/`
- **Example:**
  ```ts
  // apps/bot/tests/integration/marketService.test.ts
  import { buyItem } from '../../src/services/market';

  test('buyItem deducts currency', () => {
    // Arrange, Act, Assert
  });
  ```

## Commands

| Command              | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| /new-market-feature  | Start workflow for adding or updating a market-related feature |
| /new-bot-command     | Add or update a bot command with permission checks             |
| /sync-i18n           | Synchronize or update i18n locale files                        |
```