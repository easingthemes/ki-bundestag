---
name: plan-commit
description: Stage all changes and create a concise git commit for a plan step. Uses the current Progress.md step as the commit message source.
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
refactor(<scope>): <what was done>
```

Where:
- `<scope>` is the package or area affected: `api`, `web`, `engine`, `types`, `web/dashboard`, etc.
- `<what was done>` is the step title, lowercased, max 60 chars

Examples:
```
refactor(api): split index.ts into domain routers
refactor(web): extract VoteBar and FilterPills components
refactor(engine): move bill pipeline logic to bill-pipeline.ts
refactor(types): split index.ts into domain type files
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
