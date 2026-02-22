# Refactor Plan: Engine — DB Layer Split

## TL;DR

Two engine DB files are oversized due to mixing different concerns. `seed.ts` (821L) mixes static party data, SQL DDL strings, and seeding logic. `schema.ts` (~400L) defines two conceptually separate databases (simulation + users) in one flat file. Split both while keeping all imports and runtime behaviour unchanged.

---

## Part A: `seed.ts` Split

### Current state

[packages/engine/src/db/seed.ts](../../packages/engine/src/db/seed.ts) — 821 lines containing:
1. Large `PARTIES` constant array (party seed data: names, descriptions, colors, priorities)
2. `INITIAL_NATIONAL_STATE` constant
3. `SIM_TABLE_DDL` and `USER_TABLE_DDL` SQL string constants
4. The actual seeding logic (wipe, create tables, insert parties, insert initial state)

### Target structure

```
packages/engine/src/db/
  seed-data.ts    ← PARTIES array + INITIAL_NATIONAL_STATE (pure data, no logic)
  ddl.ts          ← SIM_TABLE_DDL + USER_TABLE_DDL SQL strings
  seed.ts         ← seeding logic only (~200L), imports from seed-data.ts + ddl.ts
```

### Steps

1. Create `src/db/seed-data.ts`
   - Move `PARTIES` constant array
   - Move `INITIAL_NATIONAL_STATE` constant
   - No imports required (pure data)

2. Create `src/db/ddl.ts`
   - Move `SIM_TABLE_DDL` string constant
   - Move `USER_TABLE_DDL` string constant
   - No imports required

3. Update `src/db/seed.ts`
   - Remove the moved constants
   - Add imports:
     ```typescript
     import { PARTIES, INITIAL_NATIONAL_STATE } from "./seed-data.js";
     import { SIM_TABLE_DDL, USER_TABLE_DDL } from "./ddl.js";
     ```
   - Keep all seeding logic (backup, wipe, table creation, inserts, government init)
   - Target: ~200 lines

---

## Part B: `schema.ts` Split

### Current state

[packages/engine/src/db/schema.ts](../../packages/engine/src/db/schema.ts) — ~400 lines defining 24 Drizzle table definitions for two separate databases:
- **Simulation DB tables** (~20 tables): `parties`, `bills`, `national_state`, `simulation_events`, `simulation_meta`, `crises`, `elections`, `party_history`, `polls`, `media_articles`, `citizen_questions`, `referendums`, `pending_injections`, `fraktionen`, `motions`, `government`, `interpellations`, `confidence_votes`, `constitutional_challenges`, `budgets`, `event_queue`, `bundestagSeats`
- **User DB tables** (~4 tables): `users`, `internal_proposals`, `internal_votes`, `member_signals`, `question_votes`, `notifications`, `mdbApplications`, `mdbVotes`, `mdbSpeeches`

### Target structure

```
packages/engine/src/db/
  schema-sim.ts     ← simulation DB table definitions only
  schema-user.ts    ← user DB table definitions only
  schema.ts         ← re-exports both as combined schema object (no consumers change)
```

### Steps

1. Create `src/db/schema-sim.ts`
   - Move all simulation DB `sqliteTable(...)` definitions
   - Import Drizzle helpers: `sqliteTable`, `text`, `integer`, `real` from `drizzle-orm/sqlite-core`

2. Create `src/db/schema-user.ts`
   - Move all user DB `sqliteTable(...)` definitions
   - Import same Drizzle helpers

3. Rewrite `src/db/schema.ts`
   - Remove all table definitions
   - Import from both new files:
     ```typescript
     import * as simSchema from "./schema-sim.js";
     import * as userSchema from "./schema-user.js";
     export const schema = { ...simSchema, ...userSchema };
     export * from "./schema-sim.js";
     export * from "./schema-user.js";
     ```
   - All existing consumers (`connection.ts`, `seed.ts`, all simulation modules) import from `../db/schema.js` — this path is unchanged, so zero consumer updates needed

---

## Verification

```bash
npm run typecheck
npm run migrate          # schema migration must succeed against existing DB
npm run simulate 1       # one sim day must complete with no errors
```

`npm run seed` can also be tested in a scratch environment if a full DB wipe is acceptable:
```bash
npm run seed
npm run simulate 2
```

All DB reads/writes and schema migrations must behave identically to before.
