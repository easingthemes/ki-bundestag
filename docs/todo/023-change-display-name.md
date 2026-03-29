# 023 — Allow Users to Change Display Name After OAuth Login

**Status:** done
**Severity:** low
**Area:** API / Web

## Problem

OAuth login auto-assigns the display name from the provider profile (Google name or GitHub username). Users cannot change it afterwards.

## Requirements

- Add `PATCH /api/users/me` endpoint to update `displayName`
- Validate uniqueness and length (2-30 chars)
- Add an "Edit name" button in user profile / user menu
- Keep cooldown or rate limit to prevent abuse

## Files

- `packages/api/src/routes/users.ts` — add PATCH endpoint
- `packages/web/src/main.tsx` — add edit option in UserMenu
- `packages/web/src/api/endpoints.ts` — add `updateDisplayName` API call
