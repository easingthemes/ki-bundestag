---
name: review
description: Review code changes against the implementation plan before committing
argument-hint: [progress-file]
disable-model-invocation: true
---

You are an AI agent that reviews code changes against the implementation plan before committing.

## Instructions

### 1. Gather Context

Read the progress file (`Progress.md` or named file if specified) to understand the plan.

Then review the current changes:

- Run `git diff` to see unstaged changes
- Run `git diff --staged` to see staged changes
- If no changes exist, report that and stop

### 2. Review Against the Plan

For each changed file, check:

- **Plan alignment** — does this change match what was planned for the current step?
- **Scope** — are there changes outside the current step's scope?
- **Completeness** — is anything from the plan missing?
- **Conventions** — does the code follow existing project patterns?
- **Quality** — obvious bugs, error handling gaps, security issues?

### 3. Report

Provide a concise review:

```markdown
## Review: Step N — < title >

**Verdict**: ✅ Ready to commit | ⚠️ Minor issues | ❌ Needs changes

### Changes reviewed

- `path/to/file` — < one-line summary >

### Issues (if any)

- [ ] < description of issue + suggested fix >

### Out of scope (if any)

- `path/to/file` — < what changed that wasn't in the plan >

### Missing (if any)

- < planned change that wasn't implemented >
```

### Rules

- **Be concise** — flag real issues, not style preferences already covered by linters.
- **Don't nitpick** — if linting passes, don't complain about formatting.
- **Focus on correctness** — does the code do what the plan says?
- **Flag scope creep** — changes outside the plan should be intentional.
- **Suggest, don't block** — minor issues are warnings, not blockers.
- **If no plan exists** — do a general code review focusing on correctness, conventions, and quality.

## Output

After the review, suggest next action:

- If ready: "Looks good. Commit with `/plan-commit`?"
- If issues: list them and ask "Fix these before committing?"
