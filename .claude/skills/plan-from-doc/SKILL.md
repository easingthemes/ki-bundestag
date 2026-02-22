---
name: plan-from-doc
description: Convert an existing docs/plans/*.md plan document into a structured Progress.md ready for plan-do and plan-exe
disable-model-invocation: true
---

You are an AI agent that reads a fully-written plan document and produces a structured `Progress.md` (or named progress file) with numbered steps, ready for `/plan-do` and `/plan-exe`.

Use this when the plan already exists as a document (e.g. `docs/plans/01-api-refactor.md`) rather than as rough ideas. It bridges the gap between a written plan doc and the `plan-do → plan-exe` workflow.

## Instructions

### 1. Determine the Source Document

- If a **file path** is provided (e.g. `docs/plans/01-api-refactor.md`), use that file.
- If an **overview/index file** is provided (e.g. `docs/plans/00-overview.md`), read it and ask the developer which group to execute first, or generate a multi-group Progress.md if they say "all".
- If no path is provided, list files in `docs/plans/` and ask which one to use.

### 2. Read the Plan Document

Read the source document and identify:
- The **goal** (usually in TL;DR or opening paragraph)
- The **numbered steps** (look for `## Steps` sections or numbered lists)
- Any **verification/validation commands** (look for `## Verification` or code blocks with `npm run ...`)
- Any **target file structure** details
- Any **risks or notes**

### 3. Determine the Progress File

- Default: `Progress.md` in the project root
- If a **named output file** is provided (e.g. `refactor-api-progress.md`), use it
- If `Progress.md` already exists with content, ask whether to overwrite or create a named file

### 4. Generate Progress.md

Write the progress file in this exact format:

```markdown
# Progress

## Goal

< One-sentence summary from the plan doc's TL;DR >

## Source

< relative path to the plan document this was generated from >

## Steps

### Step 1: < step title from plan doc >

- **Status**: pending
- **Description**: < 2-3 sentence summary of this step >
- **Ref**: < section heading or line reference in the source plan doc >

### Step 2: < title >

- **Status**: pending
- **Description**: < summary >
- **Ref**: < reference >

... (all steps)

## Notes

< copy any risks, open questions, or constraints from the source plan doc >
```

### 5. Handle Multi-Group Plans

If the source is the overview file (`00-overview.md`) and the developer wants all groups:

- Create one step per plan document (group)
- Each step description is the group's TL;DR
- Each step `Ref` points to the corresponding `docs/plans/XX-*.md` file
- When `/plan-exe` executes a group step, it should itself read the referenced plan doc for implementation details

Example for multi-group:
```markdown
### Step 1: API Refactor

- **Status**: pending
- **Description**: Split packages/api/src/index.ts (2826L) into 10 domain Express routers, middleware, and mapper modules.
- **Ref**: docs/plans/01-api-refactor.md
```

### Rules

- **Don't read the codebase** — that's for `/plan-do`. This skill only reads the plan document.
- **Preserve intent exactly** — don't add or remove scope from what the plan doc says.
- **All steps start as `pending`** — no assumptions about what's already done.
- **Keep descriptions short** — 2-3 sentences. The full detail is in the source plan doc (linked via `Ref`).
- **One step = one numbered item** in the source doc's Steps section. If the plan has sub-steps, keep them as a group under one Progress.md step.
- **Include validation** — if the plan doc has a Verification section, add the commands to the relevant steps.
- **Overwrite Progress.md silently** if all existing steps are `done` — the feature is complete and git preserves the history.
- **Ask before overwriting** only if Progress.md has `pending` or `in-progress` steps — live work in progress could be lost.

## Output

After creating the progress file, summarize:
- Number of steps generated
- Path to the progress file created
- Next suggested command: `plan-do` (to research + detail each step) or `plan-exe` (if steps are already detailed enough to implement directly from the plan doc)
- Note: if the plan doc steps are already very detailed (have explicit file paths and actions), `/plan-exe` can run directly without `/plan-do` first
