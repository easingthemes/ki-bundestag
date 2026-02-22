---
name: plan-exe
description: Execute planned steps from Progress.md — implement code, run validation, update progress. Use 'all' to run all steps automatically.
argument-hint: "[all|stepN|next]"
disable-model-invocation: false
---

You are an AI agent that implements the plan documented in `Progress.md`. You write code, create files, and run commands as specified in the plan.

## Instructions

### 1. Read Progress.md

Read `Progress.md` (or a named progress file if specified) to understand the full context: goal, steps, and detailed plans.

### 2. Determine Focus

- If **`all`** is provided (e.g. `plan-exe all`), run all remaining `pending`/`planned` steps automatically without pausing between them. Stop only on validation failure or a blocker.
- If a **step parameter** is provided (e.g. `step1`, `step2`), implement only that step.
- If **no parameter** is given, implement the next `planned` or `pending` step (not `done` or `in-progress`).
- Never skip ahead — implement steps in order unless told otherwise.

### 3. Implement

For the step in focus:

1. **Mark the step as `in-progress`** in `Progress.md` before starting.
2. **Follow the plan exactly** — the plan was reviewed and approved. Don't deviate unless you hit a blocker.
3. **Follow existing patterns** — use the template files referenced in the plan. Match naming, structure, and style.
4. **Run validation** — execute the validation command documented in the plan (build, lint, test).
5. **Mark the step as `done`** in `Progress.md` with a compact summary:

```markdown
### Step 1: < title >

- **Status**: done
- **Files**: < files created/modified >
- **Result**: < one-line summary + validation outcome >
```

Replace the Plan section with the compact Result — detailed plan history is in git.

### 4. Continue or Offer to Continue

- If running in **`all` mode**: automatically proceed to the next `pending`/`planned` step after each successful validation. Only stop if a step fails or is blocked — then report and wait.
- Otherwise: after completing a step, ask the developer:
  > "Step N completed. Continue to step N+1: < title >?"
  > If the developer confirms, proceed without requiring a new command invocation.

### Rules

- **One step at a time** — finish and validate the current step before starting the next, even in `all` mode.
- **Update Progress.md in real time** — mark `in-progress` when starting, `done` when finished.
- **Follow project conventions** — use naming, structure, and coding patterns from the project's instruction files and existing code.
- **Don't skip validation** — every step ends with a build/lint/test check.
- **If blocked, stop and report** — update the step with what went wrong and the error output. Don't improvise major changes. Suggest using `/plan-fix` to resolve.
- **Keep changes minimal** — implement only what's in the plan for this step.
- **Compact format** — when marking done, collapse the plan into a one-line result. Don't accumulate verbose history in Progress.md.

## Output

After completing the step, summarize:

- What was implemented (files created/modified)
- Validation results
- Any issues encountered
- Offer to continue to the next step
