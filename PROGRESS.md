# Progress: Engine — DB Layer Split

**Goal**: Split oversized `seed.ts` (821L) and `schema.ts` (~400L) into focused files while keeping all imports and runtime behaviour unchanged.

**Ref**: docs/plans/06-engine-db.md

---

### Step 1: Create `src/db/seed-data.ts`

- **Status**: done
- **Files**: `packages/engine/src/db/seed-data.ts` (created)
- **Result**: Extracted PARTIES array and INITIAL_NATIONAL_STATE constant as pure data; also exported PartySeed interface. Typecheck passed.

### Step 2: Create `src/db/ddl.ts`

- **Status**: done
- **Files**: `packages/engine/src/db/ddl.ts` (created)
- **Result**: Moved SIM_TABLE_DDL, USER_TABLE_DDL, SIM_COLUMN_MIGRATIONS, USER_COLUMN_MIGRATIONS into dedicated file. No imports needed. Typecheck passed.

### Step 3: Update `src/db/seed.ts` to import from new files

- **Status**: done
- **Files**: `packages/engine/src/db/seed.ts` (updated)
- **Result**: Removed moved constants, added imports from seed-data.js and ddl.js; updated nationalState insert to use INITIAL_NATIONAL_STATE; removed unused PartySeed/CoalitionRole/PolicyPriorities imports. Typecheck passed.

### Step 4: Create `src/db/schema-sim.ts`

- **Status**: done
- **Files**: `packages/engine/src/db/schema-sim.ts` (created)
- **Result**: Moved all 22 simulation DB table definitions (parties through bundestagSeats) into dedicated file with Drizzle imports. Typecheck passed.

### Step 5: Create `src/db/schema-user.ts`

- **Status**: done
- **Files**: `packages/engine/src/db/schema-user.ts` (created)
- **Result**: Moved all user DB table definitions (users, internalProposals, memberSignals, internalVotes, questionVotes, referendumVotes, notifications, mdbApplications, mdbVotes, mdbSpeeches, userActions) into dedicated file. Typecheck passed.

### Step 6: Rewrite `src/db/schema.ts` as re-export barrel

- **Status**: done
- **Files**: `packages/engine/src/db/schema.ts` (rewritten)
- **Result**: schema.ts now 6 lines: imports both sub-schemas, exports combined schema object, and re-exports all named exports. All existing consumers unchanged. Typecheck passed.
