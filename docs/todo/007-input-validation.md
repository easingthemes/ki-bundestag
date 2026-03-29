# 007 — Missing Input Validation and Rate Limiting

**Status:** open
**Severity:** high
**Area:** API

## Problem

Several API endpoints lack proper input validation and rate limiting. Users can submit oversized content or spam endpoints.

## Missing Validation

- `POST /api/questions` — no maximum length on question text (only min 5 chars)
- `POST /api/bills/:id/amendment` — `impactChange` object keys not validated for extras
- `POST /api/seats/apply` — `policyFocus` array not validated (type, length, content)
- `parseInt()` on filter params without NaN checks (`content.ts:150`)

## Missing Rate Limiting

- `POST /api/polls/:id/vote` — no cooldown between votes
- `POST /api/questions` — max 5 pending but no time-based limit
- `POST /api/proposals` — no rate limit
- `POST /api/speeches` — no rate limit
- All action endpoints — no per-IP or per-user throttling

## Recommended Fix

- Add `express-rate-limit` middleware per route group
- Add max length validation to all text inputs
- Validate array contents (policyFocus, impactChange keys)

## Files

- `packages/api/src/routes/content.ts`
- `packages/api/src/routes/bills.ts`
- `packages/api/src/routes/seats.ts`
- `packages/api/src/routes/users.ts`
