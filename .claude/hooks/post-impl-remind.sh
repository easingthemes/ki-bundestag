#!/bin/bash
# PostToolUse hook for Edit/Write
# Reminds agent to update relevant docs after implementation changes

# Read stdin to get tool info
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only remind for source code files (not docs, configs, or hook scripts themselves)
case "$FILE_PATH" in
  */docs/*|*/.claude/*|*/node_modules/*|*.md|*.json|*.css)
    exit 0
    ;;
  */packages/*)
    cat <<'EOF'
{
  "additionalContext": "REMINDER: You modified source code. When the current implementation task is complete, remember to update the relevant documentation: docs/PROGRESS.md (feature status), docs/Current_Architecture.md (schema, API, flow changes), and CLAUDE.md (if simulation flow or key patterns changed). Do NOT update docs mid-task — wait until the feature is fully working."
}
EOF
    ;;
  *)
    exit 0
    ;;
esac
