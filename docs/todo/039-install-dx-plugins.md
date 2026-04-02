# 039 — Install dx-aem-flow plugins

**Status**: open  
**Area**: Tooling / Claude Code  
**Priority**: High  

## Description

Alpha workflow skills have been removed from `.claude/skills/` (plan-start, plan-do, plan-exe, plan-run-all, plan-commit, plan-fix, plan-done, review, review-fix, healthcheck skill, docs skill) and the plan-group-executor agent. These are replaced by the published dx-aem-flow plugins.

## Steps

Run from Claude Code CLI:

```bash
# 1. Merge the cleanup branch first
# Branch: claude/research-aem-flow-plugins-fsejy

# 2. Add marketplace and install dx-core
/plugin marketplace add easingthemes/dx-aem-flow
/plugin install dx-core@dx-aem-flow

# 3. Initialize project config
/dx-init

# 4. (Optional) Install additional plugins
/plugin install dx-hub@dx-aem-flow
/plugin install dx-aem@dx-aem-flow
/plugin install dx-automation@dx-aem-flow
```

## What was kept (project-specific)

- `commands/` — 7 commands (db-query, dev-start, explain, fix-types, healthcheck, sim-status, status)
- `agents/simulation-debugger.md`
- `rules/` — 5 domain rules (esm, frontend, database, api, simulation)
- `hooks/` — 6 lifecycle hooks
- `scripts/healthcheck/` — 4 bash scripts (moved from skill)
- `CLAUDE.md` + `settings.json`

## Notes

- Healthcheck was converted from a skill to a command (`/healthcheck`)
- Docs skill was removed — Context7 MCP handles doc lookups automatically
- dx-core provides: `/dx-plan`, `/dx-step-all`, `/dx-step-verify`, `/dx-pr`, `/dx-doctor`, and 40+ more skills
