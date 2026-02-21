# Progress

## Summary
- **Status**: completed (5 steps)
- **Date**: 2026-02-21
- **Changes**:
  - Unique constraint on `displayName` + `POST /api/users/login` endpoint + 409 on duplicate register
  - `/login` page with nickname input, two-step login-then-register flow, redirect support
  - Gold avatar `UserMenu` dropdown in desktop + mobile nav (My Party, My Questions, Logout)
  - Removed inline name inputs from Parties JoinModal and PartyDetail; redirect to `/login` if unauthenticated
  - Visitor simulation uses login-first flow, separate party join, correct localStorage key

## Goal

Replace the invisible UUID-token auth with a simple nickname-based login/register flow — one page, unique nicknames, session persisted in a cookie, user avatar in the nav with a dropdown for user-related pages.

## Steps

### Step 1: Unique nickname registration + login API
- **Status**: done
- **Files**: `packages/engine/src/db/schema.ts`, `packages/engine/src/db/seed.ts`, `packages/api/src/index.ts`
- **Result**: Added `.unique()` on displayName, dedup migration, `POST /api/users/login` (404 if not found), register returns 409 on duplicate

### Step 2: Login/Register page
- **Status**: done
- **Files**: `packages/web/src/pages/Login.tsx` (new), `packages/web/src/api.ts`, `packages/web/src/userContext.ts`
- **Result**: `/login?redirect=` page with single nickname input; try login → not found → offer register; cookie backup alongside localStorage

### Step 3: User avatar + dropdown in navigation
- **Status**: done
- **Files**: `packages/web/src/main.tsx`
- **Result**: `UserMenu` component (gold initials circle, hover/click dropdown), `MobileLogout`, desktop "Anmelden" link, mobile avatar section; `/login` route added

### Step 4: Remove redundant nickname prompts
- **Status**: done
- **Files**: `packages/web/src/pages/Parties.tsx`, `packages/web/src/pages/PartyDetail.tsx`, `packages/web/src/pages/Dashboard.tsx`
- **Result**: JoinModal redirects to `/login` via useEffect if no user; PartyDetail join button redirects; Dashboard CTA links to `/login`

### Step 5: Update visitor simulation script
- **Status**: done
- **Files**: `scripts/simulate-visitors.ts`
- **Result**: Login-first flow, register without partyId, separate `POST /users/me/join/:partyId`, fixed localStorage key to `ki-bundestag-token`
