#!/bin/bash
# Git health check — outputs structured info

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
UNPUSHED=$(git log --oneline @{upstream}..HEAD 2>/dev/null | wc -l | tr -d ' ')
CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null | wc -l | tr -d ' ')

echo "branch: $BRANCH"
echo "uncommitted_files: $UNCOMMITTED"
echo "unpushed_commits: $UNPUSHED"
echo "merge_conflicts: $CONFLICTS"
