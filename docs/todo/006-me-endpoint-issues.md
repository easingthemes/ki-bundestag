# 006 — /me Endpoint Issues

**Status:** open
**Severity:** high
**Area:** API / Web

## Problem

Issues with user profile / session endpoints. Needs investigation to identify specific failures.

## Investigation Needed

- Check `GET /api/users/me` response format
- Check if token validation works correctly
- Check if party association returns properly
- Check if seat status is accurate
- Verify frontend handles all response states

## Files

- `packages/api/src/routes/users.ts` — /me endpoint
- `packages/web/src/api/endpoints.ts` — getMe() call
- `packages/web/src/api/userContext.ts` — user state management
