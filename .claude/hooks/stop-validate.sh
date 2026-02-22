#!/bin/bash
# Stop hook: remind agent to verify before finishing

cat <<'EOF'
{
  "decision": "approve",
  "reason": "BEFORE FINISHING: If you made code changes, confirm: (1) npm run typecheck passes, (2) no unintended files were modified, (3) changes match what was requested — no scope creep."
}
EOF