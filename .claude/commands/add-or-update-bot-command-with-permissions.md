---
name: add-or-update-bot-command-with-permissions
description: Workflow command scaffold for add-or-update-bot-command-with-permissions in Idle-Factory.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-bot-command-with-permissions

Use this workflow when working on **add-or-update-bot-command-with-permissions** in `Idle-Factory`.

## Goal

Adds a new bot command or updates an existing one, including implementing permission checks (e.g., owner-only commands).

## Common Files

- `apps/bot/src/commands/dev/*.ts`
- `apps/bot/src/commands/game/*.ts`
- `apps/bot/src/preconditions/*.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or modify command file in apps/bot/src/commands/dev/ or apps/bot/src/commands/game/
- Implement or update permission/precondition logic in apps/bot/src/preconditions/
- Optionally update related logic or service files

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.