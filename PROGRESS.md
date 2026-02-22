# Progress

## Goal

Split `packages/web/src/api.ts` (796 lines) into three focused files under `src/api/` — types, client helpers, and endpoint functions — with a barrel `src/api/index.ts` and a shim `src/api.ts` so all existing imports continue to work unchanged.

## Ref

docs/plans/04-web-api-split.md

## Steps

### Step 1: Create `src/api/types.ts`

- **Status**: done
- **Files**: `packages/web/src/api/types.ts`
- **Result**: All 35 TypeScript interfaces/types moved from api.ts into types.ts. No imports needed. Typecheck pass.

### Step 2: Create `src/api/client.ts`

- **Status**: done
- **Files**: `packages/web/src/api/client.ts`
- **Result**: Moved fetchJson, postJson, deleteJson, added patchJson, moved BASE constant, setErrorHandler, setUserToken, authHeaders. Exported getBase() helper for endpoints.ts. Typecheck pass.

### Step 3: Create `src/api/endpoints.ts`

- **Status**: done
- **Files**: `packages/web/src/api/endpoints.ts`
- **Result**: All ~55 typed API call functions moved, grouped by domain with comments. Imports from ./types.js and ./client.js. Legacy `api` object re-exported for backward compatibility. Typecheck pass.

### Step 4: Create `src/api/index.ts`

- **Status**: done
- **Files**: `packages/web/src/api/index.ts`
- **Result**: Barrel with export * from all three sub-files. Typecheck pass.

### Step 5: Update `src/api.ts`

- **Status**: done
- **Files**: `packages/web/src/api.ts`
- **Result**: Replaced 796-line file with single re-export shim: `export * from "./api/index.js"`. Zero import changes needed in 49 existing call sites. Typecheck pass.
