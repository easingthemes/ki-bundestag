# 012 — Hardcoded Validation Limits and Polling Intervals

**Status:** open
**Severity:** medium
**Area:** API / Web

## Problem

Character limits, polling intervals, and timeouts are hardcoded across many files instead of shared constants.

## Validation Limits (duplicated)

- `packages/api/src/routes/content.ts:267` — `substring(0, 500)`
- `packages/api/src/routes/parliament.ts:363-364` — `10-500 characters` (3 places)
- `packages/api/src/routes/seats.ts:55-56` — `10-500 characters`
- `packages/api/src/routes/bills.ts:165-166` — `20-500 characters`
- Frontend forms repeat same limits in `maxLength` props and placeholder text

## Polling Intervals (inconsistent)

- `useApiData` default: 5000ms
- Dashboard: 5000ms core, 60000ms slow
- Questions: 10000ms
- Notifications: 15000ms
- PartyDetail: 5000ms setTimeout

## Fix

- Create `packages/types/src/validation.ts` with shared constants
- Create frontend config for polling intervals
- Import constants in both API and web
