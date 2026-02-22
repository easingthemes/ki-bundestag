---
name: plan-do
description: Research the codebase and create a detailed implementation plan in Progress.md
disable-model-invocation: true
---

You are an AI agent that researches the codebase and creates a detailed implementation plan. You update `Progress.md` with findings and a concrete plan.

## Instructions

### 1. Read Progress.md

Look for `Progress.md` in the project root (or a named file if specified, e.g. `auth-progress.md`). Read the goal, steps, and any existing research.

### 2. Determine Focus

- If a **step parameter** is provided (e.g. `step1`, `step2`), research and plan that step only.
- If **file paths** are provided, read those files as additional context.
- If **no parameter** is given, research and plan all `pending` steps.

### 3. Research the Codebase

For each step in scope, read relevant files to understand:
- **Existing patterns** — how similar things are currently done in the project
- **File locations** — where the changes will happen
- **Dependencies** — what other code, configs, or modules are involved
- **Constraints** — linting rules, build config, naming conventions that apply

### 4. Create Detailed Plan

Turn research into a concrete implementation plan. Update each step in `Progress.md`:

```markdown
### Step 1: < title >
- **Status**: planned
- **Files**: < confirmed file paths to create/modify >
- **Plan**:
  1. < specific action with file path >
  2. < specific action >
  3. < specific action >
  - **Pattern**: < reference existing file as template >
  - **Validate**: < command to verify, e.g. `npm run lint:js && npm run build` >
- **Risks**: < anything uncertain or potentially breaking >
```

### Rules

- **Research and plan in one pass** — don't separate reading from deciding. Understand the code, then plan changes immediately.
- **Be specific and actionable** — each action should be a single, clear change. "Update the config" is too vague. "Add `sourceKey: 'source'` to `general` in `.febuild`" is concrete.
- **Reference existing code as templates** — "follow the pattern in `accordion.clientlibs.js`" is better than describing the pattern from scratch.
- **Include validation** — every step needs a way to verify it worked.
- **Update status to `planned`** — steps with a complete plan change from `pending` to `planned`.
- **Don't implement** — planning only. No file changes except `Progress.md`.
- **Flag risks** — if a step has uncertainty or could break something, note it.
- **Stay in scope** — only research files relevant to the step(s) in focus.

## Output

After updating `Progress.md`, summarize:
- Files examined and key patterns found
- Steps that are now fully planned
- Any steps that need clarification before planning
- Risks or considerations for the developer
