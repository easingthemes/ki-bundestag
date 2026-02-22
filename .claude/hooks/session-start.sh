#!/bin/bash
# SessionStart hook: load project context at conversation start

CONTEXT=""

# Check current branch
BRANCH=$(git branch --show-current 2>/dev/null)
CONTEXT="Current branch: ${BRANCH:-unknown}"

# Check if Progress.md exists and show status
if [ -f "Progress.md" ]; then
  PENDING=$(grep -c "pending" Progress.md 2>/dev/null || echo 0)
  DONE=$(grep -c "done" Progress.md 2>/dev/null || echo 0)
  BLOCKED=$(grep -c "blocked" Progress.md 2>/dev/null || echo 0)
  CONTEXT="${CONTEXT}\nProgress.md: ${DONE} done, ${PENDING} pending, ${BLOCKED} blocked"
fi

# Check for uncommitted changes
CHANGES=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGES" -gt 0 ]; then
  CONTEXT="${CONTEXT}\nUncommitted changes: ${CHANGES} files"
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${CONTEXT}"
  }
}
EOF