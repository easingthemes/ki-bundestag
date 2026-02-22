# Refactor Plan: Web — Shared Infrastructure

## TL;DR

Before any page-level decomposition (see [03-web-pages.md](./03-web-pages.md)), establish the shared building blocks that pages will use. This includes a new generic data hook, two missing UI components, and a deduplicated utility function. These pieces are prerequisites that unblock the page refactor and eliminate the most widespread duplication.

## Current Duplication

| Pattern | Occurrences | Current state |
|---------|-------------|---------------|
| `useState + useCallback + useEffect + usePolling` refresh boilerplate | 17 pages | Each page rolls its own |
| Vote bar `<div className="flex h-5 rounded overflow-hidden">` | 7+ locations | Fully inline everywhere |
| Filter pill `cn("px-3 py-1.5 text-xs ... rounded-full border ...")` | 6+ pages | Fully inline everywhere |
| `fixColor()` (remap FDP yellow for contrast) | 3 pages | Defined separately in each |

## Target Structure (additions only)

```
packages/web/src/
  lib/
    utils.ts          ← add fixColor() here (was duplicated in 3 pages)
  hooks/
    useApiData.ts     ← NEW: generic fetch + poll hook
  components/
    VoteBar.tsx       ← NEW: shared vote bar component
    FilterPills.tsx   ← NEW: shared filter pill row component
```

## Steps

### 1. Add `fixColor()` to `lib/utils.ts`

[packages/web/src/lib/utils.ts](../../packages/web/src/lib/utils.ts) currently only contains `cn()`. Add:

```
export function fixColor(hex: string): string
// Remaps FDP yellow #FFED00 → #c4a900 for readability on white backgrounds.
// All other values pass through unchanged.
```

Then remove the identical inline definitions from:
- [packages/web/src/pages/Dashboard.tsx](../../packages/web/src/pages/Dashboard.tsx) (around L21)
- [packages/web/src/pages/Elections.tsx](../../packages/web/src/pages/Elections.tsx) (around L15)
- [packages/web/src/pages/Parties.tsx](../../packages/web/src/pages/Parties.tsx) (around L12)

Replace each removed definition with `import { fixColor } from "../lib/utils"`.

### 2. Create `src/hooks/useApiData.ts`

New generic hook that wraps the universal pattern found in all 17 data-fetching pages:

```
useApiData<T>(
  fetcher: () => Promise<T>,
  options?: { interval?: number; deps?: unknown[] }
): { data: T | null; loading: boolean; refresh: () => void }
```

Internally uses:
- `useState<T | null>` for data
- `useState<boolean>` for loading flag
- `useCallback` to memoize the fetch call
- `useEffect` for initial load
- `usePolling(callback, interval)` from existing [packages/web/src/usePolling.ts](../../packages/web/src/usePolling.ts)

Pages using this hook stop duplicating fetch boilerplate. The hook can be adopted page by page; nothing breaks if a page still uses the old pattern during transition.

**Affected pages** (can migrate incrementally):
Dashboard, Parties, PartyDetail, Bills, BillDetail, Budget, ConfidenceVotes,
ConstitutionalCourt, Interpellations, Media, Motions, MyActivity, Notifications,
Polls, Questions, Referendums, SimulationLog, NewsFeed

### 3. Create `src/components/VoteBar.tsx`

```
interface VoteBarProps {
  yes: number;
  no: number;
  abstain: number;
  total: number;
  height?: string;   // default "h-5"
  showCounts?: boolean;
}
export function VoteBar(props: VoteBarProps): JSX.Element
```

Renders the flex-row coloured bar with `VOTE_COLORS.yes` / `.no` / `.abstain` from [packages/web/src/lib/colors.ts](../../packages/web/src/lib/colors.ts).

Replace inline vote bars in:
- [packages/web/src/pages/Bills.tsx](../../packages/web/src/pages/Bills.tsx) (~L256)
- [packages/web/src/pages/BillDetail.tsx](../../packages/web/src/pages/BillDetail.tsx) (~L282, L505, L559)
- [packages/web/src/pages/Budget.tsx](../../packages/web/src/pages/Budget.tsx) (~L140)
- [packages/web/src/pages/Motions.tsx](../../packages/web/src/pages/Motions.tsx) (~L107)
- [packages/web/src/pages/ConfidenceVotes.tsx](../../packages/web/src/pages/ConfidenceVotes.tsx) (~L201)
- [packages/web/src/pages/Dashboard.tsx](../../packages/web/src/pages/Dashboard.tsx) (~L1007)

Note: [Elections.tsx](../../packages/web/src/pages/Elections.tsx) already has a local `VoteBarChart` component; once `VoteBar` exists, that component can delegate to it or be merged — covered in [03-web-pages.md](./03-web-pages.md).

### 4. Create `src/components/FilterPills.tsx`

```
interface FilterPillsProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}
export function FilterPills<T extends string>(props: FilterPillsProps<T>): JSX.Element
```

Uses the shared `cn()` and the existing active/inactive pill class pattern.

Replace inline pill filter rows in:
- [packages/web/src/pages/Notifications.tsx](../../packages/web/src/pages/Notifications.tsx) (~L95)
- [packages/web/src/pages/MyActivity.tsx](../../packages/web/src/pages/MyActivity.tsx) (~L81)
- [packages/web/src/pages/Budget.tsx](../../packages/web/src/pages/Budget.tsx) (~L80)
- [packages/web/src/pages/Interpellations.tsx](../../packages/web/src/pages/Interpellations.tsx) (~L58)
- [packages/web/src/pages/ConfidenceVotes.tsx](../../packages/web/src/pages/ConfidenceVotes.tsx) (~L58)
- [packages/web/src/pages/ConstitutionalCourt.tsx](../../packages/web/src/pages/ConstitutionalCourt.tsx)
- [packages/web/src/pages/Admin.tsx](../../packages/web/src/pages/Admin.tsx) (~L738)

## Verification

```bash
npm run typecheck
```

Manual: load each page that previously used an inline vote bar or filter pills — visually identical.
Since `fixColor` logic is identical, party colors on Dashboard, Elections, Parties pages are unchanged.
