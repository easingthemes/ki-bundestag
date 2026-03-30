# Progress: Scalability Quick Wins

**Plan**: [docs/plans/scalability-quick-wins.md](docs/plans/scalability-quick-wins.md)
**Goal**: Four low-effort, high-impact changes to improve performance for 1K→10K users.
**Validation**: `npm run typecheck` from monorepo root.

---

### Step 1: Index `user_actions(created_at)`

- **Status**: done
- **Files**: `packages/engine/src/db/ddl.ts`
- **Result**: Added `idx_user_actions_created_at` and `idx_user_actions_user_day` to `USER_INDEX_MIGRATIONS`.

### Step 2: Schedule Session Pruning

- **Status**: done
- **Files**: `packages/api/src/index.ts`
- **Result**: Added 30-min `setInterval` for `sessionStore.prune()`, cleared on SIGINT.

### Step 3: Buffer `lastActive` Writes

- **Status**: done
- **Files**: `packages/api/src/middleware/auth.ts`, `packages/api/src/index.ts`
- **Result**: Replaced per-request DB write with in-memory `Map`, flushed every 5 min. `flushLastActive()` called on shutdown. Session-start detection uses buffered timestamp for correctness.

### Step 4: Add Cursor Pagination to `/api/users/me/activity`

- **Status**: done
- **Files**: `packages/api/src/routes/users.ts`, `packages/web/src/api/endpoints.ts`, `packages/web/src/pages/MyActivity.tsx`
- **Result**: Backend accepts `?cursor=<ISO-date>&limit=<number>`, returns `{ items, nextCursor }`. Frontend uses cursor-based "load more" instead of client-side truncation.
