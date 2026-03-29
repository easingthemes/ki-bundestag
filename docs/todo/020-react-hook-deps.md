# 020 — React Hook Dependency Warnings Suppressed

**Status:** open
**Severity:** low
**Area:** Web

## Problem

`useApiData.ts` has two `// eslint-disable-next-line react-hooks/exhaustive-deps` comments suppressing dependency warnings. May cause stale closures.

## Location

- `packages/web/src/hooks/useApiData.ts`

## Fix

Review hook dependencies and either add missing deps or restructure to avoid the warning.
