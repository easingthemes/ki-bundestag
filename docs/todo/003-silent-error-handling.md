# 003 — Silent Error Handling (Empty Catch Blocks)

**Status:** open
**Severity:** critical
**Area:** API

## Problem

15+ instances of `try { logUserAction(...) } catch {}` across API routes. Errors are swallowed silently — no logging, no tracking. Makes production debugging impossible.

## Affected Files

- `packages/api/src/routes/users.ts` — lines 21, 56, 374, 400
- `packages/api/src/routes/bills.ts` — lines 72, 147, 209, 296
- `packages/api/src/routes/content.ts` — lines 139, 277, 317, 440
- `packages/api/src/routes/parties.ts` — line 245, 305
- `packages/api/src/routes/seats.ts` — multiple instances
- `packages/api/src/routes/admin.ts` — line 105 (analytics catch)

## Fix

Replace empty catch blocks with `console.error` at minimum:

```typescript
// Before
try { logUserAction(...); } catch {}

// After
try { logUserAction(...); } catch (err) {
  console.error("[user-action] Failed to log action:", err);
}
```
