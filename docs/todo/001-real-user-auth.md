# 001 — Real User Authentication

**Status:** done
**Severity:** critical
**Area:** API / Web

## Problem

Current auth is a simple nickname-based token stored in localStorage. No password, no OAuth, no session management. Anyone can impersonate any user by guessing their token.

## Current Implementation

- `POST /api/users/register` — creates user with nickname, returns token
- `POST /api/users/login` — looks up by nickname, returns token
- Token stored in `localStorage` (`packages/web/src/api/userContext.ts:39`)
- No password, no email, no OAuth provider
- Admin auth uses `X-Admin-Secret` header (env var)

## Requirements

- OAuth provider (Google, GitHub, or similar) for real identity
- Session-based or JWT auth with proper expiry
- Keep admin auth separate (env var is fine)
- Migrate existing users or provide upgrade path

## Files

- `packages/api/src/routes/users.ts` — login/register endpoints
- `packages/api/src/middleware/auth.ts` — requireUser / requireAdmin middleware
- `packages/web/src/api/userContext.ts` — token storage
- `packages/web/src/pages/Login.tsx` — login form
- `packages/engine/src/db/schema-user.ts` — user schema
