#!/bin/bash
# PostToolUse hook: remind about conventions after file writes

cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "File written. Quick check: ESM .js extensions in engine/api? kebab-case filename? Imports from correct package?"
  }
}
EOF