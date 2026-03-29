# 009 — No Global Express Error Handler

**Status:** open
**Severity:** medium
**Area:** API

## Problem

No global error handler middleware in Express. Unhandled exceptions return raw error messages with stack traces, leaking internal details.

## Fix

Add error handler middleware at the end of the middleware chain in `packages/api/src/index.ts`:

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: "Internal server error" });
});
```

## Files

- `packages/api/src/index.ts`
