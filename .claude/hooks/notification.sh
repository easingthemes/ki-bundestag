#!/bin/bash
# Notification hook: desktop notification when agent needs attention
# Cross-platform: macOS (osascript), Linux (notify-send), fallback (terminal bell)

if command -v osascript &>/dev/null; then
  osascript -e 'display notification "Claude Code needs your attention" with title "Claude Code"' 2>/dev/null
elif command -v notify-send &>/dev/null; then
  notify-send "Claude Code" "Claude Code needs your attention" 2>/dev/null
else
  printf '\a'  # terminal bell as fallback
fi

cat <<'EOF'
{}
EOF
