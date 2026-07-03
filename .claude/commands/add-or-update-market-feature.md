---
name: add-or-update-market-feature
description: Workflow command scaffold for add-or-update-market-feature in Idle-Factory.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-market-feature

Use this workflow when working on **add-or-update-market-feature** in `Idle-Factory`.

## Goal

Implements or enhances features related to the 'market' system in the bot, including new commands, UI flows, and backend logic.

## Common Files

- `apps/bot/src/commands/game/market.ts`
- `apps/bot/src/interaction-handlers/buttons/market*.ts`
- `apps/bot/src/interaction-handlers/modals/market*.ts`
- `apps/bot/src/interaction-handlers/selects/market*.ts`
- `apps/bot/src/locales/en-US/game.json`
- `apps/bot/src/locales/ko/game.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Modify or create command handler in apps/bot/src/commands/game/market.ts
- Update or add interaction handlers in apps/bot/src/interaction-handlers/buttons/, modals/, or selects/ related to market
- Update locale files for i18n in apps/bot/src/locales/en-US/game.json and apps/bot/src/locales/ko/game.json
- Modify or add service logic in apps/bot/src/services/market.ts or related service files
- Update or add utility files in apps/bot/src/utils/ if needed

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.