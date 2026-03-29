# 025 — Missing React Types / SimulationLog TypeScript Errors

**Status:** done
**Severity:** low
**Area:** Web

## Problem

`npx tsc --noEmit` on the web package produces two categories of errors:

1. **Missing React type declarations** — `Cannot find module 'react' or its corresponding type declarations` in `usePolling.ts` and `userContext.ts`. Likely a missing `@types/react` install or tsconfig issue.

2. **SimulationLog.tsx JSX errors** — `JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists` across ~18 lines, plus implicit `any` on callback parameters. Related to the missing React types above.

## Likely Cause

The `@types/react` package may not be installed, or the web `tsconfig.json` may not include the correct type roots. Vite/SWC handles JSX at build time without needing these types, so the app runs fine — only `tsc --noEmit` fails.

## Suggested Fix

- Ensure `@types/react` and `@types/react-dom` are in `devDependencies`
- Verify `tsconfig.json` has correct `jsx`, `types`, and `compilerOptions` for React 19
- Fix any remaining implicit `any` types in `SimulationLog.tsx`

## Files

- `packages/web/tsconfig.json`
- `packages/web/package.json`
- `packages/web/src/usePolling.ts`
- `packages/web/src/userContext.ts`
- `packages/web/src/pages/SimulationLog.tsx`
