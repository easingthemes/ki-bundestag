# Domain 3: Claude Code Configuration & Workflows (20%)

Covers CLAUDE.md hierarchy, path-specific rules with glob patterns, plan mode vs direct execution, and CI/CD integration. This domain is about knowing how to **configure Claude Code as a development tool**.

---

## Key Exam Concept: CLAUDE.md Hierarchy

Claude Code reads configuration from multiple levels, merged in order of specificity:

```
~/.claude/CLAUDE.md              # User-level (personal preferences)
  └─ /project/.claude/CLAUDE.md  # Project-level (team standards)  <-- checked into git
      └─ /project/.claude/rules/*.md  # Domain-specific rules (path-scoped)
```

Each level can override or extend the previous. The exam tests whether you know which level to put configuration at and why.

---

## What We Built

### 1. Project-Level CLAUDE.md

Our `.claude/CLAUDE.md` is a comprehensive project instruction file (~180 lines):

```markdown
# CLAUDE.md

## Project Overview
KI Bundestag is an AI-powered simulation of the German parliament...

## Setup (MANDATORY before any work)
**Always run `npm install` from the monorepo root before starting any task.**

## Commands (run from monorepo root)
npm run seed / migrate / simulate / dev:api / dev:web / build / typecheck / lint / test

## Architecture
Monorepo with npm workspaces + Turborepo. Four packages:
- types, engine, api, web

## Critical Warnings
- Package exports must point to ./src/index.ts (not dist/)
- ESM: All packages use "type": "module"
- DB path: resolved via import.meta.url + findMonorepoRoot()

## Domain-Specific Rules
Detailed rules are in .claude/rules/ (auto-loaded, path-scoped)
```

**Exam-relevant structure:**
- **Setup instructions** at the top (most important = first)
- **Command reference** for common operations
- **Architecture overview** so Claude understands the codebase
- **Critical warnings** for known pitfalls
- **Links to detailed rules** rather than putting everything in one file

---

### 2. Path-Scoped Rules (`.claude/rules/`)

We have 5 domain-specific rule files, each scoped to relevant file paths:

```yaml
# .claude/rules/frontend.md
---
paths:
  - "packages/web/**"
---
# Frontend Rules (Tailwind v4 + shadcn/ui)
- Tailwind v4 syntax (@import "tailwindcss" + @theme inline)
- shadcn/ui components in src/components/ui/
- Party colors: always inline style (not Tailwind classes)
- Shared modules: colors.ts, shared.tsx, VoteBar.tsx, FilterPills.tsx
```

```yaml
# .claude/rules/simulation.md
---
paths:
  - "packages/engine/**"
---
# Simulation Rules
- ALL AI calls go through submitBatch() (50% discount)
- Batch groups: A (party agents), B (interpellations), C (media)
- Transient retry: 2 retries, 2s+5s backoff
- Shared JSON parser: parseAIJson() in ai-json.ts
```

**All 5 rule files:**

| File | Scope | Purpose |
|---|---|---|
| `esm.md` | `packages/engine/**` | ESM import rules, .js extensions, naming conventions |
| `frontend.md` | `packages/web/**` | Tailwind v4, shadcn/ui, shared components |
| `database.md` | `packages/engine/src/db/**` | Dual-DB architecture, Drizzle, migrations |
| `simulation.md` | `packages/engine/**` | Agent calls, runDay() flow, batch groups |
| `api.md` | `packages/api/**` | Express conventions, route structure, mappers |

**Why path-scoping matters (exam concept):**
- Rules are only injected when Claude is working on files matching the glob pattern
- Reduces prompt size — frontend rules aren't loaded when editing engine code
- Prevents conflicting advice — different patterns for different packages

---

### 3. Claude Code Skills

We defined custom skills (slash commands) for common workflows:

```
/plan-exe     — Execute planned steps from Progress.md
/fix-types    — Run typecheck, fix all errors, re-run to confirm
/healthcheck  — Full project health check (build, types, DB, servers, git)
/dev-start    — Start dev environment (API + web servers)
/db-query     — Run a database query against simulation
/sim-status   — Check simulation status
/simplify     — Review changed code for reuse, quality, efficiency
```

**Exam-relevant pattern:** Skills automate multi-step workflows that Claude Code would otherwise need manual prompting for. Each skill is a reusable prompt template — similar to MCP Prompts.

---

### 4. Hooks (Automated Behaviors)

We use a `SessionStart` hook that runs automatically when a Claude Code session begins:

```json
// settings.json hook configuration
{
  "hooks": {
    "SessionStart": [
      {
        "command": "echo 'Current branch:' $(git branch --show-current) && ...",
        "blocking": true
      }
    ]
  }
}
```

**Exam concept:** Hooks execute shell commands in response to Claude Code events. The exam tests:
- **SessionStart** — runs when session begins (setup, environment checks)
- **PreToolUse** — runs before a tool call (validation, safety checks)
- **PostToolUse** — runs after a tool call (logging, side effects)
- **Blocking** hooks halt execution until they complete; non-blocking run in background

---

## Exam Topics to Study Further

### Plan Mode vs Direct Execution
- **Plan mode**: Claude analyzes first, produces a plan, then executes step-by-step
- **Direct execution**: Claude implements immediately
- The exam tests when to use each — plan mode for complex multi-file refactors, direct for simple edits

### CI/CD Integration Flags
```bash
# Non-interactive mode for CI
claude --non-interactive --max-turns 10 "Run tests and fix failures"

# Trust settings for automation
claude --trust-tools "Read,Glob,Grep,Bash" --dangerously-skip-permissions
```

### CLAUDE.md Best Practices the Exam Tests
1. **Put the most important information first** — Claude reads top-to-bottom
2. **Use imperative instructions** — "Always run npm install first" not "You might want to..."
3. **Include critical warnings prominently** — known pitfalls that waste time
4. **Link to detailed docs** rather than duplicating content
5. **Path-scope rules** to avoid irrelevant context
6. **Version control CLAUDE.md** — it's a team artifact, not personal config

---

## Summary: What This Domain Tests

| Concept | Exam Weight | Our Experience |
|---|---|---|
| CLAUDE.md hierarchy | High | 3-level config (user / project / rules) |
| Path-scoped rules | High | 5 glob-scoped rule files |
| Skills / slash commands | Medium | 12+ custom skills defined |
| Hooks configuration | Medium | SessionStart hook |
| Plan mode workflows | Medium | plan-exe / plan-commit / plan-fix skills |
| CI/CD flags | Low | Basic awareness (study more) |
