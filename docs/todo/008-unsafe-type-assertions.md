# 008 — Unsafe Type Assertions (as unknown as)

**Status:** open
**Severity:** high
**Area:** Engine / API

## Problem

25+ instances of `as unknown as Type` bypass TypeScript's type system. JSON data from SQLite is cast without runtime validation, risking runtime errors on malformed data.

## Key Locations

- `packages/engine/src/simulation/loop.ts` — Party[], Bill[], ElectionResult[], votes, impact
- `packages/engine/src/simulation/referendums.ts:32,147` — votes and impact
- `packages/engine/src/simulation/government.ts` — ministers
- `packages/engine/src/simulation/discipline.ts` — votes
- `packages/api/src/routes/elections.ts:25-30` — results cast
- `packages/api/src/mappers/bill.ts` — impact and policy
- `packages/api/src/mappers/party.ts` — policy casting
- `packages/web/src/components/Hemicycle.tsx:68,79` — Highcharts config

## Fix

Add runtime validation (zod or manual checks) for JSON fields deserialized from DB. Low risk for internal data but important for data integrity.

## Files

- `packages/engine/src/simulation/loop.ts`
- `packages/api/src/mappers/*.ts`
- `packages/api/src/routes/elections.ts`
