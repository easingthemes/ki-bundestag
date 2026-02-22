---
name: plan-run-all
description: Loop through all docs/plans/*.md files in order, delegating each group to the plan-group-executor subagent. Each group runs in an isolated context — only compact summaries return here.
argument-hint: "[group-number|file-path]"
disable-model-invocation: false
---

You are a coordinator. You do NOT implement anything yourself. You delegate each plan group to the `plan-group-executor` subagent via the Task tool, one group at a time. Each subagent runs in its own isolated context.

## Instructions

### 1. Discover the plan queue

**Single file mode:** If the parameter is a file path (e.g. `plan-run-all docs/plans/02-web-shared.md`), the queue contains only that one file. Skip step discovery and go straight to execution.

**Multi-file mode:** List all files matching `docs/plans/[0-9]*.md`, sorted numerically. Skip `00-overview.md`.

Then determine the start point:

1. **Explicit number prefix** (e.g. `plan-run-all 03`) — skip all docs numbered below it. Use as-is, no detection needed.

2. **No argument** — auto-detect progress:
   - Read `Progress.md` if it exists. If it has a `## Summary` block with a `Group:` line, that group is done — start from the next one.
   - Cross-check with git log: run `git log --oneline -30` and look for `refactor(...)` commits. Each plan group will have left multiple such commits. The highest-numbered group with commits is the last completed group — start from the next one.
   - If both signals agree, skip all completed groups and start from the first incomplete one.
   - If Progress.md is absent or has no Summary, and git log shows no refactor commits, start from group 01.
   - Print what was detected before starting:
     ```
     Auto-detected: groups 01–02 already done. Starting from group 03.
     ```
     Or if starting fresh:
     ```
     No previous progress detected. Starting from group 01.
     ```

### 2. Delegate each group to the subagent

For each plan doc in the queue:

1. Print a header to show progress:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Starting GROUP: docs/plans/XX-name.md
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

2. Use the Task tool to invoke the `plan-group-executor` subagent:

   ```
   Use the plan-group-executor subagent to fully execute: docs/plans/XX-name.md
   ```

   Wait for it to return before proceeding.

3. Print the compact summary returned by the subagent.

4. If the subagent returned a **failure** (`✗`):
   - Stop the loop immediately
   - Print:
     ```
     Loop stopped at GROUP XX. Run plan-fix, then plan-run-all (or plan-run-all XX) to resume.
     ```
   - Do not continue to the next group.

5. If the subagent returned **success** (`✓`):
   - Continue to the next group.

### 3. Final summary

After all groups complete successfully:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALL GROUPS COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run: npm run typecheck && npm run build
```

## Rules

- **You are coordinator only** — all implementation happens inside the subagent's isolated context
- **Never implement steps yourself** — always delegate via Task tool
- **Process groups sequentially** — do not start the next group until the current one returns
- **Stop on any failure** — do not skip ahead past a blocked group
- **Keep main context lean** — you only see compact summaries, not file contents

## Resuming after failure

```
plan-run-all        # auto-detects last completed group and resumes from next
plan-run-all 03     # explicit: skip groups 01-02, start from 03
```

Both are equivalent after a failure — use the explicit form if auto-detection picks the wrong group.
