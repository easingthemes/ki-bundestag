#!/bin/bash
# Notification hook: macOS desktop notification when agent needs attention

osascript -e 'display notification "Claude Code needs your attention" with title "Claude Code"' 2>/dev/null

cat <<'EOF'
{}
EOF