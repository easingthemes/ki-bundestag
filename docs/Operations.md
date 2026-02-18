# Operations Guide

## Running the Project

```bash
npm run seed              # Seed database with initial data (backs up existing DB first)
npm run migrate           # Apply schema changes without clearing data (safe to run repeatedly)
npm run simulate          # Run 1 simulation day
npm run simulate -- 5     # Run 5 simulation days
npm run simulate:auto     # Auto-run 1 day every 30s (Ctrl+C to stop)
npm run simulate:auto -- 15000  # Auto-run every 15s

npm run trigger:election  # Force election on next simulate run

npm run dev:api           # Start API server on port 3001
npm run dev:web           # Start Vite dev server on port 5173
npm run build             # Build all packages
npm run typecheck         # Typecheck all packages
```

## Database

- **Location**: `data/simulation.db` (SQLite, WAL mode)
- **Path resolution**: Always resolves relative to monorepo root via `import.meta.url`, regardless of which package or working directory calls it
- **Created by**: `npm run seed` (creates tables via raw SQL + inserts seed data)
- **Migrated by**: `npm run migrate` (adds missing tables/columns without data loss)

### Tables

| Table | Purpose |
|-------|---------|
| `parties` | 6 political parties with seats, approval, ideology |
| `bills` | Proposed/debated/passed/rejected legislation |
| `national_state` | Coalition, opposition, economy, sentiment |
| `simulation_events` | Chronological event log |
| `simulation_meta` | Current day, next election day, sentiment streak |
| `crises` | Active and resolved crises |
| `elections` | Election records with results, negotiations, agreements |
| `party_history` | Daily snapshot of approval + seats per party |
| `polls` | User-facing opinion polls with vote counts |

### Backups

`npm run seed` **always creates a timestamped backup** before wiping and re-seeding:

```
data/simulation.db.backup-2026-02-16T21-02-53-389Z
```

To restore a backup:

```bash
cp data/simulation.db.backup-<timestamp> data/simulation.db
```

Backup files include the WAL file if one exists at the time of backup.

### Manual Backup

To manually back up the current database:

```bash
cp data/simulation.db data/simulation.db.manual-backup
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | — | API key for Claude. Simulation will fail with a clear error if missing. |
| `DATABASE_PATH` | No | `<root>/data/simulation.db` | Absolute path to SQLite database |
| `API_PORT` | No | `3001` | Port for the Express API server |
| `MODEL_DAILY` | No | `claude-haiku-4-5-20251001` | Model for daily party agent calls |
| `MODEL_NEGOTIATION` | No | `claude-haiku-4-5-20251001` | Model for coalition negotiation calls |
| `MODEL_SYNTHESIS` | No | `claude-sonnet-4-5-20250929` | Model for coalition agreement synthesis |

## Important: Run from Project Root

All `npm run` commands must be executed from the monorepo root directory. Running from a subdirectory will fail because npm workspace scripts resolve differently.

## Architecture Notes

- **ESM throughout**: All packages use `"type": "module"` in package.json
- **Auto-refresh**: All frontend pages poll the API every 5 seconds
- **Error display**: API errors show as a red toast banner in the frontend (auto-dismisses after 6s)
- **Concurrent access**: SQLite WAL mode allows the API to read while the simulation writes
- **DB path resolution**: Uses `import.meta.url` + `findMonorepoRoot()` to always resolve `data/simulation.db` relative to the monorepo root, regardless of working directory
- **Cost**: ~6 Claude Haiku calls per normal simulation day, ~$0.006/day. Negotiation days add 6 Haiku + 1 Sonnet call on synthesis day.

## API Endpoints

### Core
- `GET /api/health` — Health check
- `GET /api/state` — National state (economy, coalition, sentiment)
- `GET /api/simulation/status` — Current day + last run timestamp

### Parties
- `GET /api/parties` — All parties
- `GET /api/parties/:id` — Single party
- `GET /api/parties/:id/history` — Approval + seat history over time
- `GET /api/parties/:id/bills` — Bills proposed by party
- `GET /api/parties/:id/votes` — Voting record with bill context
- `GET /api/parties/:id/statements` — Statements and campaign events

### Bills
- `GET /api/bills` — All bills (`?status=` filter)
- `GET /api/bills/:id` — Single bill

### Events
- `GET /api/simulation/days` — Day summaries
- `GET /api/simulation/days/:dayNumber` — Events for a specific day
- `GET /api/simulation/events` — Paginated events (`?limit=`, `?offset=`, `?type=`, `?actor=`)

### Elections
- `GET /api/elections` — All elections (`?status=` filter)
- `GET /api/elections/active` — Current non-completed election
- `GET /api/elections/:id` — Single election (includes negotiation rounds + agreement)

### Crises
- `GET /api/crises` — All crises (`?active=true` filter)
- `GET /api/crises/:id` — Single crisis

### Polls
- `GET /api/polls` — All polls (`?active=true` filter)
- `GET /api/polls/:id` — Single poll
- `POST /api/polls/:id/vote` — Cast vote (`{ "option": "..." }`)
