---
paths:
  - "packages/engine/src/db/**"
  - "packages/engine/src/migrate.ts"
  - "packages/engine/src/seed.ts"
---

# Database Rules (Drizzle + SQLite)

## Dual-DB Architecture

Two SQLite databases in `data/`, both WAL mode with foreign keys enabled:

- **`simulation.db`** — simulation state, accessed via `getDb()` / `getSqlite()`
  - Tables: `parties`, `bills`, `national_state`, `simulation_events`, `simulation_meta`, `crises`, `elections`, `party_history`, `polls`, `media_articles`, `citizen_questions`, `referendums`, `pending_injections`, `fraktionen`, `motions`, `government`, `interpellations`, `confidence_votes`, `constitutional_challenges`, `budgets`, `event_queue`, `bundestagSeats`
  - Override path: `DATABASE_PATH` env var
- **`users.db`** — user-owned data, accessed via `getUserDb()` / `getUserSqlite()`
  - Tables: `users`, `internal_proposals`, `internal_votes`, `member_signals`, `question_votes`, `notifications`, `mdbApplications`, `mdbVotes`, `mdbSpeeches`
  - Override path: `USER_DATABASE_PATH` env var

Path resolved via `import.meta.url` + `findMonorepoRoot()` — independent of working directory.

## Schema & DDL

- Schema in `packages/engine/src/db/schema.ts` (Drizzle ORM barrel re-export of `schema-sim.ts` + `schema-user.ts`)
- DDL in `packages/engine/src/db/ddl.ts`: `SIM_TABLE_DDL` + `USER_TABLE_DDL` SQL strings and column migration arrays
- Seed data in `packages/engine/src/db/seed-data.ts`: `PARTIES` array + `INITIAL_NATIONAL_STATE`
- `closeDb()` closes both connections; `npm run seed` backs up both files

## Query Patterns

Use `getSqlite()` / `getUserSqlite()` for raw sqlite3 access — never access drizzle internals.

```typescript
// Select
const rows = db.select().from(schema.parties).all();

// Update
db.update(schema.parties)
  .set({ approvalRating: newValue })
  .where(eq(schema.parties.id, partyId))
  .run();

// Insert
db.insert(schema.bills).values({ id, title, ... }).run();
```

## Seed vs Migrate

- `npm run seed` — **Partially destructive**: drops all simulation.db tables and recreates fresh state with parties + govt. Preserves user accounts in users.db but resets bundestag-related fields (partyId, cooldowns) and clears activity data (votes, speeches, applications, signals, proposals, notifications). Backs up both files first.
- `npm run migrate` — **Safe**: applies schema changes only to both DBs, safe to run repeatedly
