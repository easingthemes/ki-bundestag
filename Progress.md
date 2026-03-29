# Progress

## Goal
Fix React hook dependency warnings in packages/web/src/hooks/useApiData.ts by replacing eslint-disable comments with a proper useRef-based pattern.

Ref: docs/todo/020-react-hook-deps.md (inline task)

---

## Steps

### Step 1: Fix useApiData.ts hook dependency warnings

- **Status**: in-progress
- **Files**: packages/web/src/hooks/useApiData.ts
- **Plan**: Use a fetcherRef pattern so the effect doesn't depend on fetcher identity. Remove both eslint-disable comments. Keep the deps array option for triggering re-fetch on external dependency changes.
