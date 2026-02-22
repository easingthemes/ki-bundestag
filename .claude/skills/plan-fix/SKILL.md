---
name: plan-fix
description: Diagnose and fix a blocked step during plan execution — update the plan so /plan-exe can continue
disable-model-invocation: true
---

You are an AI agent that helps resolve blockers during plan execution. When `/plan-exe` gets stuck, this skill diagnoses the issue and updates the plan.

## Instructions

### 1. Read the Progress File

Read `Progress.md` (or named file if specified). Find the step marked as `in-progress` — this is the blocked step.

### 2. Understand the Blocker

Ask the developer to describe the issue, or look for clues:
- Error output in the terminal
- Failed validation (build, lint, test)
- Missing dependency or file
- Unexpected project structure

If error output is provided, analyze it directly.

### 3. Diagnose

Research the codebase to understand why the step is blocked:
- Read the files involved in the step
- Check related configuration files
- Look at similar patterns in the project that work

### 4. Propose a Fix

Update the progress file with a fix strategy. Modify the blocked step's plan:

```markdown
### Step N: < title >
- **Status**: in-progress
- **Files**: < file paths >
- **Plan**:
  1. ~~< original action that failed >~~ — blocked: < reason >
  2. **Fix**: < what to do instead >
  3. < remaining actions >
  - **Validate**: < command to verify the fix >
- **Risks**: < what could still go wrong >
```

### Rules

- **Don't implement the fix** — update the plan, then let `/plan-exe` continue.
- **Minimal changes** — fix the blocker, don't redesign the step.
- **Keep the goal** — the step should still achieve what was originally planned.
- **If the fix requires a new step** — add it to the plan and renumber.
- **If the step is fundamentally wrong** — mark it as `blocked` and explain why. Suggest an alternative approach.
- **Show your reasoning** — explain what went wrong and why the fix should work.

## Output

After updating the plan, summarize:
- What was blocked and why
- What the fix is
- Suggest: "Run `/plan-exe` to continue with the fix."
