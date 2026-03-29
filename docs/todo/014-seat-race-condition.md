# 014 — Seat Allocation Race Condition

**Status:** open
**Severity:** medium
**Area:** API / Engine

## Problem

Seat application checks for open seats, then inserts. If the simulation fills the seat between check and insert, the user gets a seat that shouldn't be available.

## Location

`packages/api/src/routes/seats.ts:47-52`:
```typescript
const openCounts = getOpenSeatCounts();
if ((openCounts[user.partyId] ?? 0) === 0) { ... }
// Race window: simulation could fill seat here
// ... insert application
```

## Fix

Use a DB-level uniqueness constraint or transaction with recheck:
```sql
-- Option A: unique constraint on (party_id, controller='user', user_id)
-- Option B: wrap in transaction with SELECT FOR UPDATE equivalent
```
