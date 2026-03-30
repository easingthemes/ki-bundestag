# Scalability Quick Wins

**Todo**: [docs/todo/027-scalability-user-loads.md](../todo/027-scalability-user-loads.md)
**Goal**: Four low-effort, high-impact changes to improve performance for 1K→10K users.
**Validation**: `npm run typecheck` from monorepo root.

## Steps

### Step 1: Index `user_actions(created_at)`
- **Files**: `packages/engine/src/db/ddl.ts`
- Add `idx_user_actions_created_at` on `user_actions(created_at)` and `idx_user_actions_user_day` on `user_actions(user_id, sim_day)` to `USER_INDEX_MIGRATIONS`.

### Step 2: Schedule Session Pruning
- **Files**: `packages/api/src/index.ts`
- Add `setInterval(() => sessionStore.prune(), 30 * 60 * 1000)` after session store creation.
- Clear interval on SIGINT shutdown.

### Step 3: Buffer `lastActive` Writes
- **Files**: `packages/api/src/middleware/auth.ts`, `packages/api/src/index.ts`
- Replace per-request DB write with in-memory map, flush every 5 min.
- Export `flushLastActive()`, call on shutdown before `closeDb()`.

### Step 4: Add Cursor Pagination to `/api/users/me/activity`
- **Files**: `packages/api/src/routes/users.ts`, `packages/web/src/api/endpoints.ts`, `packages/web/src/pages/MyActivity.tsx`
- Accept `?cursor=<ISO-date>&limit=<number>`, return `{ items, nextCursor }`.
- Update frontend to use cursor-based "load more".
