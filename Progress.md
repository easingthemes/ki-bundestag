# Progress

## Goal
Add database indexes to simulation.db and users.db to improve query performance, applied via `npm run migrate` without data loss.

Ref: docs/todo/002-missing-db-indexes.md (task description from user)

---

## Steps

### Step 1: Add index migration arrays to ddl.ts and apply them in migrateDatabase()

- **Status**: in-progress
- **Files**: packages/engine/src/db/ddl.ts, packages/engine/src/db/seed.ts
