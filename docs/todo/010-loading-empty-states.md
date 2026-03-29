# 010 — Missing Loading and Empty States

**Status:** open
**Severity:** medium
**Area:** Web

## Problem

Many pages show plain "Loading..." text or no feedback when data is empty. Need proper loading skeletons and empty state components.

## Missing Loading States

- PartyDetail — plain text "Loading...", no skeleton for 11 API calls
- Media — "Medien laden..." text only
- All pages using `useApiData` — silent null on error, no error UI

## Missing Empty States

- Questions, Motions, ConstitutionalCourt, Notifications — plain text when empty
- Bills — groups show "(0)" with no visual indicator
- Interpellations — message but no styled card

## Missing Error States

- 60+ pages use `.catch(console.error)` with no user-visible feedback
- `useApiData` hook swallows errors silently (line 31)
- BillDetail `getMdbVotes()` catches with empty `catch(() => {})`

## Fix

- Create shared `<LoadingSkeleton>`, `<EmptyState>`, `<ErrorState>` components
- Update `useApiData` to expose error state
- Add error boundaries around page components
