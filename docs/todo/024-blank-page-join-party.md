# 024 — Blank Page After Joining Party

**Status:** open
**Severity:** low
**Area:** Web

## Problem

After clicking "Beitreten" (Join) on a party detail page, the page goes blank. A manual page reload shows the correct state (user has joined the party). The issue is a React re-render/state update problem, not a backend issue.

## Likely Cause

In `PartyDetail.tsx`, `handleJoin` calls `login(result.id, result)` after `api.joinParty()` succeeds. This updates the global `UserContext`, triggering a full app re-render. The component may unmount/remount incorrectly during this state transition.

## Suggested Fix

- Avoid calling `login()` (which updates global auth state) just to refresh user data. Instead, update only the local user state or call a lighter `setUser()` that doesn't trigger token storage side effects.
- Or: after join, navigate to the same page with a refresh flag.

## Files

- `packages/web/src/pages/PartyDetail.tsx` — `handleJoin` function (~line 89-106)
- `packages/web/src/main.tsx` — `login` callback in `App` component
