#!/bin/bash
# PostToolUse hook: validate conventions after file writes
# Reads the tool input to check the file that was just written/edited

# The hook receives tool input via stdin as JSON
INPUT=$(cat)

# Extract file path from the tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  cat <<'EOF'
{}
EOF
  exit 0
fi

WARNINGS=""

# Check 1: ESM .js extensions in engine/api packages
if echo "$FILE_PATH" | grep -qE 'packages/(engine|api)/src/.*\.ts$'; then
  # Look for local imports missing .js extension (but not package imports)
  if [ -f "$FILE_PATH" ]; then
    BAD_IMPORTS=$(grep -nE 'from\s+["\x27]\.\.?/' "$FILE_PATH" | grep -vE '\.(js|json)["\x27]' | grep -vE 'from\s+["\x27]@' | head -3)
    if [ -n "$BAD_IMPORTS" ]; then
      WARNINGS="${WARNINGS}\n- Missing .js extension on local imports in ${FILE_PATH##*/}"
    fi
  fi
fi

# Check 2: kebab-case filename (for new .ts/.tsx files, not in node_modules or ui/)
BASENAME=$(basename "$FILE_PATH")
if echo "$BASENAME" | grep -qE '\.(ts|tsx)$'; then
  if echo "$BASENAME" | grep -qE '[A-Z]' && ! echo "$FILE_PATH" | grep -qE '(components/ui/|pages/|\.d\.ts)'; then
    # Allow PascalCase for React components in pages/ and components (not in engine/api)
    if echo "$FILE_PATH" | grep -qE 'packages/(engine|api)/'; then
      WARNINGS="${WARNINGS}\n- Non-kebab-case filename: ${BASENAME} (engine/api use kebab-case)"
    fi
  fi
fi

# Check 3: Tailwind v3 directives in web package
if echo "$FILE_PATH" | grep -qE 'packages/web/.*\.css$'; then
  if [ -f "$FILE_PATH" ] && grep -q '@tailwind' "$FILE_PATH"; then
    WARNINGS="${WARNINGS}\n- Tailwind v3 directive found — use v4 syntax (@import \"tailwindcss\")"
  fi
fi

if [ -n "$WARNINGS" ]; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Convention warnings:${WARNINGS}"
  }
}
EOF
else
  cat <<'EOF'
{}
EOF
fi
