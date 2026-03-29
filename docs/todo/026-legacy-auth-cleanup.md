# 026 — Remove Legacy Nickname Auth and Backward-Compatibility Shims

**Status:** done
**Severity:** low
**Area:** API / Web

## Problem

The project is not yet live, so backward compatibility is unnecessary. Legacy nickname-based auth (register/login by display name, `X-User-Token` header, localStorage token storage) still exists alongside the OAuth session-based auth added in #001. This creates dead code paths, confusion, and a larger attack surface.

## Scope

- Remove `POST /api/users/login` and `POST /api/users/register` endpoints
- Remove `X-User-Token` header fallback in `getUserToken()` — keep only session-based auth
- Remove `registerUser()` and `loginUser()` from web API client
- Remove localStorage/cookie token helpers (`loadStoredToken`, `saveToken`, `clearToken`) in `userContext.ts`
- Remove `setUserToken()` no-op in `client.ts`
- Simplify the `App` component's auth init — remove legacy token fallback branch
- Remove the legacy `Login` page nickname form if it only serves the old flow
- Update `#015` status — localStorage XSS is fully resolved once localStorage auth is removed

## Files

- `packages/api/src/routes/users.ts` — remove login/register endpoints
- `packages/api/src/middleware/auth.ts` — remove `X-User-Token` fallback in `getUserToken()`
- `packages/web/src/api/client.ts` — remove `setUserToken()`
- `packages/web/src/api/endpoints.ts` — remove `registerUser`, `loginUser`
- `packages/web/src/userContext.ts` — remove token storage helpers
- `packages/web/src/main.tsx` — simplify auth init in `App`
- `packages/web/src/pages/Login.tsx` — remove or simplify nickname form
