---
name: healthcheck
description: Run a full project health check — build, types, DB, servers, git status, and conventions
argument-hint: "quick for fast check, or omit for full check"
disable-model-invocation: false
---

You are an AI agent that runs a comprehensive project health check and reports results.

## Instructions

### 1. Determine the Mode

- If the user passes `quick`: run only steps 2a and 2b (typecheck + git)
- Otherwise: run all steps

### 2. Run Checks

Read `references/checklist.md` for the full list of checks and thresholds.

#### 2a. Build & Types

- Run `npm run typecheck` from the monorepo root
- Report: pass/fail + error count

#### 2b. Git Status

- Run `bash .claude/skills/healthcheck/scripts/git-check.sh` via Bash
- Report: branch, uncommitted files, unpushed commits

#### 2c. Database

- Run `bash .claude/skills/healthcheck/scripts/db-check.sh` via Bash
- Report: both DBs exist, table counts, last simulation day

#### 2d. Dev Servers

- Run `bash .claude/skills/healthcheck/scripts/server-check.sh` via Bash
- Report: running/stopped for each

#### 2e. Conventions

- Read `references/conventions.md` for what to spot-check
- Grep for common violations (see examples in `examples/violations.sh`)
- Run `bash .claude/skills/healthcheck/examples/violations.sh 2>&1 | head -20` via Bash
- Report: any found or "clean"

### 3. Generate Report

Format the results using the template in `assets/report-template.md`.
Fill in each section with the check results.
Present the report to the user.
