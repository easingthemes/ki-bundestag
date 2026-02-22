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

- **Status**: done
- **Files**: `packages/web/src/components/VoteBar.tsx`, `packages/web/src/pages/Bills.tsx`, `packages/web/src/pages/BillDetail.tsx`, `packages/web/src/pages/Budget.tsx`, `packages/web/src/pages/Motions.tsx`, `packages/web/src/pages/ConfidenceVotes.tsx`, `packages/web/src/pages/Dashboard.tsx`
- **Result**: Created VoteBar component with yes/no/abstain props and optional height/showCounts. Replaced inline vote bars in 6 pages. Typecheck pass.

### Step 4: Create `src/components/FilterPills.tsx`

- **Status**: done
- **Files**: `packages/web/src/components/FilterPills.tsx`, `packages/web/src/pages/Notifications.tsx`, `packages/web/src/pages/MyActivity.tsx`, `packages/web/src/pages/Budget.tsx`, `packages/web/src/pages/Interpellations.tsx`, `packages/web/src/pages/ConfidenceVotes.tsx`, `packages/web/src/pages/Admin.tsx`
- **Result**: Created generic FilterPills<T> component with options/value/onChange props. Replaced inline pill filter rows in 6 pages. ConstitutionalCourt skipped (uses select dropdowns, not pills). Typecheck pass.
