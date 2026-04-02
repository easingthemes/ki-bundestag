#!/bin/bash
# Example: grep for common convention violations

# Find .ts import extensions in engine (should be .js)
echo "=== .ts import extensions in engine ==="
grep -rn "from ['\"]\..*\.ts['\"]" packages/engine/src/ 2>/dev/null || echo "None found"

# Find non-kebab-case filenames in packages
echo ""
echo "=== Non-kebab-case filenames ==="
find packages/*/src -name "*.ts" -o -name "*.tsx" | grep '[A-Z]' | grep -v 'CLAUDE\|SKILL\|Progress' || echo "None found"

# Find dist/ references in package.json exports
echo ""
echo "=== dist/ in package.json exports ==="
grep -n '"dist/' packages/*/package.json 2>/dev/null || echo "None found"
