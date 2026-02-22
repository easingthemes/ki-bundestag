#!/bin/bash
# SubagentStop hook
# Reminds agent to update relevant docs after subagent completes implementation

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStop",
    "additionalContext": "REMINDER: A subagent just finished implementation work. When the current task is complete, consider updating:\n- `.claude/rules/` (domain-specific rules: esm.md, frontend.md, database.md, simulation.md) — if patterns, conventions, or key modules changed\n- `.claude/CLAUDE.md` — ONLY for project-wide changes (new commands, architecture shifts, critical warnings). Keep it concise (~80 lines). Domain details belong in rules/\n- docs/Current_Architecture.md — if schema, API routes, or simulation flow changed\nDo NOT update docs mid-task — wait until the feature is fully working."
  }
}
EOF
