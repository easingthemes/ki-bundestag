# Progress

## Goal
Add a calendar widget to the Dashboard showing simulation activities per day, using real calendar dates.

## Steps

### Step 1: Store simulation start date and add calendar API
- **Status**: done
- **Files**: `packages/engine/src/db/schema.ts`, `packages/engine/src/db/seed.ts`, `packages/api/src/index.ts`
- **Result**: Added `start_date` column to `simulation_meta` (schema + migration + seed + backfill). Added `GET /api/calendar?month=YYYY-MM` endpoint with event importance tiers (3 tiers, routine excluded) returning top 3 events/day. Added `startDate` to `/api/simulation/status`. Typecheck + migrate pass.

### Step 2: Build the calendar component
- **Status**: done
- **Files**: `packages/web/src/components/CalendarWidget.tsx` (new), `packages/web/src/api.ts`
- **Result**: Added `CalendarEvent`, `CalendarDay`, `CalendarData` types + `getCalendar()` API method. Created `CalendarWidget.tsx` with month grid (Mo-start, German locale), colored event dots (3 tiers), month nav with bounds, day-click Dialog showing all events with type badges + links. Typecheck passes.

### Step 3: Integrate into Dashboard
- **Status**: done
- **Files**: `packages/web/src/pages/Dashboard.tsx`
- **Result**: Added calendar state + fetch in `refreshSlow` (re-fetches on month change). Placed "Kalender" section in main column after Media Highlights with "Alle Tage →" link to `/log`. Typecheck passes.

## Notes
- Day-to-date mapping: `start_date` (ISO string) in `simulation_meta`, day 1 = that date, day N = start_date + (N-1) days
- Event importance tiers for ranking top 3:
  - Tier 1 (critical): election_result, government_formed, government_dissolved, crisis_start, constitutional_court_ruled, confidence vote outcomes
  - Tier 2 (high): bill_proposed, bill_third_reading, presidential_veto, budget_proposed, interpellation_filed
  - Tier 3 (medium): motion_submitted, statement, amendment_proposed, fraktion_formed
  - Tier 4 (routine): day_start, economy_update, weekly_report, monthly_report, vote_cast — excluded from top 3
- Existing `/api/simulation/days` endpoint already groups events by day — calendar endpoint extends this with date mapping and importance ranking
- Dialog component already available and used across 15+ pages — no new dependencies needed
- Calendar widget is read-only, no participatory gating needed
