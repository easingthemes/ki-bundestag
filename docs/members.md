# Progress — MdB (Member of Bundestag) System

## Summary
- **Status**: completed (7 steps)
- **Date**: 2026-02-22
- **Changes**:
  - Step 1: Data model — 4 new tables (bundestagSeats, mdbApplications, mdbVotes, mdbSpeeches), seat allocation in election flow
  - Step 2: Application system — AI-reviewed applications with fair allocation (priority+lottery), 14-day cooldown, seat deactivation on party switch
  - Step 3: MdB voting — split-seat tallying (human/proxy/AI), whipped voting at discipline level 3, backward-compatible
  - Step 4: Speeches — 1 per reading per user, POST/GET endpoints, sentiment +0.1 per speech
  - Step 5: Parliamentary actions — motions, interpellations, amendments via pending_injections queue, strict validation
  - Step 6: Party discipline — 7-day review cycle, 4-level progressive system (warn→restrict→whip→expel), AI reasoning
  - Step 7: Full UI — PartyDetail roster+apply form, Dashboard MdB card+CTA, BillDetail vote buttons+speech submission

## Steps

### Step 1: MdB seat system + data model
- **Status**: done
- **Files**: `schema.ts`, `seed.ts`, `types/index.ts`, `seats.ts`, `timing.ts`, `loop.ts`, `engine/index.ts`, `simulation/index.ts`
- **Result**: 4 tables added (bundestagSeats in SIM DB; mdbApplications/mdbVotes/mdbSpeeches in USER DB), seat allocation wired into election flow, `mdb_apply` feature key added.

### Step 2: MdB application + approval with fair allocation
- **Status**: done
- **Files**: `seats.ts`, `api/index.ts`, `loop.ts`, `engine/index.ts`, `simulation/index.ts`
- **Result**: 4 API endpoints, AI-reviewed applications (max 3/party/day, priority scoring), seat deactivation on party leave/switch, 14-day rejection cooldown.

### Step 3: MdB voting on bills
- **Status**: done
- **Files**: `voting.ts`, `loop.ts`, `prompt.ts`, `api/index.ts`, `types/index.ts`, `simulation/index.ts`
- **Result**: tallyVotes() splits human-voted/proxy/AI seats per party. Whipped MdBs forced to party line. POST/GET mdb-vote endpoints.

### Step 4: MdB speeches and debates
- **Status**: done
- **Files**: `speeches.ts`, `api/index.ts`, `loop.ts`, `types/index.ts`, `simulation/index.ts`
- **Result**: POST/GET speech endpoints, 1 per reading per user, processDaySpeeches() creates events + sentiment boost.

### Step 5: MdB parliamentary actions
- **Status**: done
- **Files**: `mdb-actions.ts`, `api/index.ts`, `loop.ts`, `simulation/index.ts`
- **Result**: 3 endpoints for motions/interpellations/amendments via pending_injections queue. Strict validation (length, impact bounds ±0.3, 1 pending per type).

### Step 6: Party discipline
- **Status**: done
- **Files**: `discipline.ts`, `loop.ts`, `simulation/index.ts`
- **Result**: 7-day review cycle, deterministic scoring from mdbVotes vs party AI votes. 4 levels (warn→restrict→whip→expel). AI reasoning per party. German notifications.

### Step 7: UI integration
- **Status**: done
- **Files**: `api.ts`, `colors.ts`, `MdbBadge.tsx`, `PartyDetail.tsx`, `Dashboard.tsx`, `BillDetail.tsx`
- **Result**: PartyDetail MdB roster + apply form. Dashboard sidebar card + apply CTA. BillDetail vote buttons (third_reading) + speech submission/display. MDB_BADGE + DISCIPLINE_BADGE color maps.

## Design Decisions
- **Seat ownership model**: Seats have controllers (human/AI), not just a members list
- **DB split**: `bundestagSeats` in SIM DB, `mdbApplications/mdbVotes/mdbSpeeches` in USER DB
- **Preset-configurable ratios**: ultra-fast/fast = 0% human, normal = 30%, slow = 70%
- **No sim blocking**: Proxy settings fill gaps for absent users automatically
- **Fair allocation**: Priority + rotation + lottery; no always-online advantage
- **Progressive discipline**: 4 levels, not binary; whipped voting at level 3, expulsion at level 4
- **Election turnover**: All seats reset per term; users must re-apply
- **Backward compatible**: tallyVotes() works without MdB votes (old behavior)
- **Deferred**: Committees as multiplayer layer, speech slot lottery, citizen lane expansion
