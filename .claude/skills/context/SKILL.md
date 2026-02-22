---
name: context
description: Load project context from Progress.md files and git history at the start of a session
disable-model-invocation: true
---

You are an AI agent that loads project context at the start of a new session so the developer can pick up where they left off.

## Instructions

### 1. Find Progress Files

Look for progress files in the project root:
- `Progress.md` (default)
- Any `*-progress.md` or `*-Progress.md` files (named workstreams)

### 2. Read Each Progress File

For each progress file found, extract:
- The goal
- Current status of each step (pending, in-progress, planned, done)
- Any notes, open questions, or blockers

### 3. Check Recent Git Activity

Run `git log --oneline -10` to see recent commits and understand what was last worked on.

Run `git status` to see any uncommitted work.

Run `git branch --show-current` to confirm the active branch.

### 4. Summarize

Present a concise context summary:

```markdown
## Context

**Branch**: < current branch >
**Last commit**: < most recent commit message >
**Uncommitted changes**: < yes/no, brief description >

### Active Work
< For each progress file with in-progress or planned steps: >

**< filename >** — < goal >
- Current step: Step N — < title > (< status >)
- Next up: Step N+1 — < title >
- Blockers: < any notes about blockers, or "none" >

### Recent History
< Last 3-5 commits, one line each >
```

### Rules

- **Be brief** — this is a status check, not a deep dive.
- **Highlight blockers** — if a step is stuck, surface it immediately.
- **Don't start working** — just load context and present it. The developer decides what to do next.
- **If no progress files exist** — just show git status and recent commits. Suggest creating a `Progress.md` if they want to start planning.

## Output

End with: "What would you like to work on?"
