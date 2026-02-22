---
name: plan-commit
description: Stage all changes and create a concise git commit for a plan step. Uses the current Progress.md step as the commit message source.
argument-hint: "[feat|fix|refactor|chore]"
disable-model-invocation: false
---

You are an AI agent that commits the current working changes to git with a clear, concise message.

## Instructions

### 1. Check there is something to commit

```bash
git status --short
```

If the working tree is clean, report "Nothing to commit" and stop.

### 2. Determine the commit message

Read `Progress.md` to find the most recently completed step (status: `done` or `in-progress`).

Build the message in this format:
```
<prefix>(<scope>): <what was done>
```

Where:
- `<prefix>` is `refactor` by default. If a different prefix is provided as argument (e.g. `plan-commit feat`), use that instead. Valid prefixes: `feat`, `fix`, `refactor`, `chore`, `docs`.
- `<scope>` is the package or area affected: `api`, `web`, `engine`, `types`, `web/dashboard`, etc.
- `<what was done>` is the step title, lowercased, max 60 chars

Examples:
```
refactor(api): split index.ts into domain routers
feat(web): add budget page with ministry allocation bars
fix(engine): correct sentiment mean-reversion calculation
chore(types): split index.ts into domain type files
```

If Progress.md is not available, use a generic message based on `git diff --stat`.

### 3. Stage and commit

```bash
git add -A
git commit -m "<message>"
```

### 4. Report

```
✓ committed: <full commit message>
  Files changed: N
```

## Rules

- **Always use `git add -A`** — stage everything, don't cherry-pick files
- **One commit per step** — called once after each plan step completes and review passes
- **No long descriptions** — single line commit message only, no body
- **No co-author lines**, no issue references
- **If commit fails** — report the error, do not retry automatically
