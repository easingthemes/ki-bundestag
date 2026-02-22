# Refactor Plan: Web — `api.ts` Split

## TL;DR

[packages/web/src/api.ts](../../packages/web/src/api.ts) (796 lines) mixes two concerns: TypeScript interface/type definitions and typed API call functions. Split into three files under `src/api/`, with a barrel `src/api/index.ts` that re-exports everything — so all existing `import { ... } from "../api"` paths continue to work unchanged.

## Current State

`api.ts` contains:
1. ~35 TypeScript interfaces mirroring backend types (local copies since web doesn't import `@ki-bundestag/types`)
2. 4 base HTTP helpers: `fetchJson`, `postJson`, `deleteJson`, `patchJson`
3. ~55 typed API call functions (one per endpoint group)

All three concerns are flat in one 796-line file.

## Target Structure

```
packages/web/src/
  api/
    types.ts          ← all interface/type definitions only
    client.ts         ← fetchJson, postJson, deleteJson, patchJson base helpers
    endpoints.ts      ← all typed API call functions (imports from types + client)
    index.ts          ← barrel: re-exports everything from all three files
  api.ts              ← DELETED (or replaced with a single re-export line pointing to ./api/index)
```

## Steps

1. Create `src/api/types.ts`
   - Move all TypeScript `interface` and `type` declarations from `api.ts`
   - No imports needed (pure type definitions)
   - Covers types such as: `Party`, `Bill`, `Election`, `NationalState`, `SimulationMeta`, `User`, `Seat`, `Notification`, `Poll`, `Referendum`, `CitizenQuestion`, `Motion`, `Interpellation`, `ConfidenceVote`, `ConstitutionalChallenge`, `Budget`, `MediaArticle`, `SimulationEvent`, `Government`, `Crisis`, `Fraktion`, `CalendarEntry`, and any response-wrapper types

2. Create `src/api/client.ts`
   - Move `fetchJson<T>()`, `postJson<T>()`, `deleteJson<T>()`, `patchJson<T>()` from `api.ts`
   - Move the base URL constant and error-callback setup
   - Move the `onError` / `setErrorHandler` pattern if present
   - No dependency on `types.ts` needed (generic helpers)

3. Create `src/api/endpoints.ts`
   - Move all ~55 typed API call functions from `api.ts`
   - Import types from `./types.js`
   - Import HTTP helpers from `./client.js`
   - Group functions with comments by domain:
     - Parties & proposals
     - Bills
     - Elections & government
     - Simulation & state
     - Parliament (motions, interpellations, confidence votes, constitutional court)
     - Content (media, questions, polls, referendums)
     - Users & auth
     - Seats
     - Budget
     - Notifications
     - Admin

4. Create `src/api/index.ts`
   - Barrel: `export * from "./types.js"; export * from "./client.js"; export * from "./endpoints.js"`

5. Update `src/api.ts`
   - Replace entire contents with one line: `export * from "./api/index.js"`
   - The file becomes a permanent re-export shim; zero import changes needed anywhere

## Import Impact

All 24 existing pages import from `"../api"` or `"../../api"`. With Option A (shim), zero import changes needed. With Option B (delete + folder), Vite's bundler resolves `../api` → `../api/index.ts` automatically — also zero changes needed.

## Verification

```bash
npm run typecheck    # all page type imports must still resolve
npm run build        # Vite bundling must succeed
npm run dev:web      # all API calls functional
```
