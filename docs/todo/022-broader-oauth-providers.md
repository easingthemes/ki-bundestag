# 022 — Add Broader OAuth Providers (Apple, Microsoft)

**Status:** postponed
**Severity:** low
**Area:** API / Web

## Problem

Current OAuth login only supports Google and GitHub. Many German users don't use Gmail (web.de, gmx.de, t-online.de are popular). GitHub is developer-oriented. This limits the user base.

## Proposed Providers

- **Microsoft** — covers Outlook, Hotmail, Live users (popular in Germany). Use `passport-microsoft`.
- **Apple** — covers iPhone users with Apple ID. Use `passport-apple`.
- **Discord** — optional, covers gaming community. Use `passport-discord`.

## Implementation

1. Add `passport-microsoft` and `passport-apple` strategies to `packages/api/src/passport-config.ts`
2. Add corresponding routes in `packages/api/src/routes/auth.ts`
3. Update `Login.tsx` to show buttons for all configured providers
4. Add env vars: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
5. Update `.env.example`

## Files

- `packages/api/src/passport-config.ts` — add new strategies
- `packages/api/src/routes/auth.ts` — add new OAuth routes
- `packages/web/src/pages/Login.tsx` — add provider buttons (already dynamic via `/api/auth/providers`)
- `.env.example` — add new env vars

## Notes

- The frontend already dynamically renders buttons based on `/api/auth/providers` response, so adding providers is mostly backend work
- Apple Sign-In has a more complex setup (requires Apple Developer Program membership, $99/year)
- Microsoft is the highest-priority addition for German users
