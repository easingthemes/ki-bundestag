#!/bin/bash
# PreToolUse hook for EnterPlanMode
# Reminds agent to consult architecture docs and domain rules before planning

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "REMINDER: Before planning, consult:\n- docs/Current_Architecture.md — current DB schema, simulation flow, API endpoints, agent actions\n- .claude/rules/ — domain-specific conventions (esm.md, frontend.md, database.md, simulation.md)\nThis ensures your plan aligns with existing architecture and follows established patterns."
  }
}
EOF
