---
name: review-fix
description: Automatically fix issues reported by the review skill, then re-run review to confirm. Called after review reports warnings or errors.
disable-model-invocation: false
---

You are an AI agent that acts on review findings. You read the review output, fix every flagged issue, then re-run the review to confirm all clear.

## Instructions

### 1. Read the Review

The review output is either:

- Passed in directly as context (when called automatically after a review)
- Obtained by running the `review` skill and capturing its output

Identify all items marked as issues — both `❌ Needs changes` (blockers) and `⚠️ Minor issues` (warnings worth fixing).

Ignore `Out of scope` items unless they are clearly bugs introduced by the current step.

### 2. Fix Each Issue

For each flagged issue:

1. Read the affected file(s)
2. Apply the minimal fix described or implied by the issue
3. Follow project conventions (see `.claude/rules/` for domain-specific rules)
4. Do not fix issues by removing/skipping planned functionality — fix them properly

Keep fixes scoped to the issue. Do not refactor unrelated code.

### 3. Re-run Validation

After all fixes:

```bash
npm run typecheck
```

If typecheck fails, fix the type errors and re-run until it passes.

### 4. Re-run Review

Run the `review` skill again on the now-fixed changes.

- If verdict is `✅ Ready to commit` — proceed, report success
- If verdict is still `⚠️` or `❌` after **two fix attempts** — stop, report what remains and why it cannot be auto-fixed. Do not loop indefinitely.

## Output

On success:

```
✅ review-fix: all issues resolved (N fixes applied), typecheck passed, review clean
```

On partial fix (some issues remain after 2 attempts):

```
⚠️ review-fix: N issues resolved, M issues remain (need manual attention):
  - <description of remaining issue>
  Action: fix manually, then run /plan-commit
```

## Rules

- **Minimal fixes only** — don't improve code beyond what the review flagged
- **Never change functionality** — this is a refactor project; only structure/import/convention fixes
- **Max 2 auto-fix cycles** — if issues persist after 2 rounds, surface them rather than looping
- **Re-validate after every fix batch** — typecheck must pass before re-running review
