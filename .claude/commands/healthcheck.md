Run a full project health check (pass "quick" to run only typecheck + git):

1. **Build & Types**: Run `npm run typecheck` from monorepo root — report pass/fail + error count
2. **Git Status**: Run `bash .claude/scripts/healthcheck/git-check.sh` — report branch, uncommitted files, unpushed commits
3. (skip for quick) **Database**: Run `bash .claude/scripts/healthcheck/db-check.sh` — report both DBs exist, table counts, last simulation day
4. (skip for quick) **Dev Servers**: Run `bash .claude/scripts/healthcheck/server-check.sh` — report running/stopped for each
5. (skip for quick) **Conventions**: Run `bash .claude/scripts/healthcheck/violations.sh 2>&1 | head -20` — report any found or "clean"

Present results in this format:

| Check | Status | Details |
|-------|--------|---------|
| Typecheck | pass/fail | error count |
| Git | clean/dirty | branch, uncommitted, unpushed |
| Simulation DB | ok/missing | tables, last day |
| Users DB | ok/missing | tables |
| Dev Servers | up/down | ports 3001, 5173 |
| Conventions | clean/violations | details |
