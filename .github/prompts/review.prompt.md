---
agent: 'agent'
description: 'Review current code changes before committing — checks quality, conventions, and plan alignment if available.'
---

Review current code changes (`git diff`, `git diff --staged`) before committing. Check correctness, conventions, quality, and scope. If a `Progress.md` exists, also check alignment with the current step. Suggest commit if ready, or list issues to fix.

Reference: .claude/skills/review/SKILL.md for full prompt details.
