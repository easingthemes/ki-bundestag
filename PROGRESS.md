# Progress

## Goal

Establish shared web infrastructure before page-level decomposition: add `fixColor()` to utils, create `useApiData` hook, `VoteBar` component, and `FilterPills` component. Eliminate the most widespread duplication across 17 pages.

## Ref

docs/plans/02-web-shared.md

## Steps

### Step 1: Add `fixColor()` to `lib/utils.ts`

- **Status**: done
- **Files**: `packages/web/src/lib/utils.ts`, `packages/web/src/pages/Dashboard.tsx`, `packages/web/src/pages/Elections.tsx`, `packages/web/src/pages/Parties.tsx`
- **Result**: Added `fixColor()` export to utils.ts, removed local definitions from 3 pages, updated imports. Typecheck pass.

### Step 2: Create `src/hooks/useApiData.ts`

- **Status**: done
- **Files**: `packages/web/src/hooks/useApiData.ts`
- **Result**: Created generic `useApiData<T>` hook with useState/useCallback/useEffect/usePolling. Returns `{data, loading, refresh}`. Typecheck pass.

### Step 3: Create `src/components/VoteBar.tsx`

- **Status**: pending

### Step 4: Create `src/components/FilterPills.tsx`

- **Status**: pending
