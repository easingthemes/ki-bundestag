# Progress

## Goal

Add a global Express error handler middleware and standardize all error responses to `{ error: string }` format.

Ref: docs/todo/009-global-error-handler.md, docs/todo/019-inconsistent-error-format.md

## Steps

### Step 1: Add global error handler to packages/api/src/index.ts

- **Status**: done
- **Files**: packages/api/src/index.ts
- **Result**: Added 4-argument Express error handler after all route mounts; logs `[ERROR] METHOD /path` + stack, returns `{ error: "Internal server error" }` with 500. Typecheck passed.

### Step 2: Scan and standardize error responses across all route files

- **Status**: pending

Scan all route files in packages/api/src/routes/ for inconsistent error response shapes (e.g., `{ success: false }`, plain status codes, `{ message: string }`) and standardize them to `{ error: string }`.
