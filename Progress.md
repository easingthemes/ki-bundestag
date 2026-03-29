# Progress

## Goal
Fix /me endpoint and user session issues: race condition in app init, unnecessary getMySeat() calls when logged out, and missing 401 handling in fetchJson.

Ref: inline task description (no plan doc)

---

## Steps

### Step 1: Fix race condition in app init (main.tsx)
- **Status**: done
- **Files**: packages/web/src/main.tsx
- **Result**: Token and user state only set after getMe() resolves; setUnauthorizedHandler wired to clear session on 401. Typecheck passed.

### Step 2: Guard getMySeat() call with user check (Dashboard.tsx)
- **Status**: done
- **Files**: packages/web/src/pages/Dashboard.tsx
- **Result**: getMySeat() now only called when user is logged in; user added to refreshCore deps. Typecheck passed.

### Step 3: Add 401 handling in fetchJson (client.ts)
- **Status**: done
- **Files**: packages/web/src/api/client.ts
- **Result**: All four fetch helpers (fetchJson, postJson, deleteJson, patchJson) call _onUnauthorized on 401; setUnauthorizedHandler exported and wired in main.tsx. Typecheck passed.

