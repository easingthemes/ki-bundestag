---
name: plan-done
description: Wrap up a completed feature — finalize Progress.md, update docs, and clean up
---

You are an AI agent that wraps up a completed feature — finalizing `Progress.md`, updating project documentation, and cleaning up.

This runs once per feature (not per step). Use it when all steps are completed, or at a significant milestone.

## Instructions

### 1. Read Progress.md

Read `Progress.md` (or a named progress file if specified) to understand what was planned and implemented.

### 2. Collapse Completed Steps

For each completed step, collapse the Plan/Research detail into a compact `Done` summary. The full history is in git — keep Progress.md readable:

```markdown
### Step 1: < title >

- **Status**: done
- **Files**: < files created/modified >
- **Result**: < one-line summary of what was done >
```

### 3. Write the Summary

Add or update a summary section at the top of `Progress.md`:

```markdown
## Summary

- **Status**: completed (X steps)
- **Date**: < date >
- **Changes**:
  - < one line per step summarizing what was done >
```

### 4. Update Project Documentation

Update only the docs directly affected by the implementation:

- **`docs/Current_Architecture.md`** — if schema, API routes, simulation flow, or key constants changed
- **`.claude/rules/`** — if domain-specific patterns changed (ESM, frontend, database, or simulation conventions). This is the primary target for convention/pattern updates.
- **`.claude/CLAUDE.md`** — ONLY for project-wide changes (new commands, architecture shifts, critical warnings). Keep it concise (~80 lines). Domain details belong in `.claude/rules/`.
- **Auto-memory** — update with new stable patterns, key file paths, or architectural decisions

Don't create new docs unless warranted. Don't update docs that aren't directly affected.

### 5. Clean Up

- Remove resolved questions from the Notes section
- Remove stale TODOs or assumptions that were addressed
- If all steps are done, the Progress.md is now a record — it can stay as documentation or be archived

### Rules

- **This wraps up the whole feature** — not a single step. Run this at the end, not between steps.
- **Collapse, don't delete** — shorten completed steps to one-line summaries. The detailed history is preserved in git.
- **Accuracy over polish** — document what actually happened, not what was planned.
- **Don't add unnecessary documentation** — only update docs directly affected by the changes.

## Output

After updating, summarize:

- Final state of Progress.md
- Which project docs were updated
- Any follow-up items or remaining work
