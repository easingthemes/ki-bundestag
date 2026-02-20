#!/bin/bash
# PreToolUse hook for EnterPlanMode
# Reminds agent to consult Current_Architecture.md before planning

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "REMINDER: Before planning, read and consult docs/Current_Architecture.md for the current DB schema, simulation flow, API endpoints, and agent actions. This ensures your plan aligns with existing architecture."
  }
}
EOF
