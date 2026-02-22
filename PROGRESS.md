# Progress

## Goal
Allow users to become Bundestag members (MdB) and participate in the simulation without slowing it down. Users apply for seats, cast direct votes on bills, speak in debates, and submit parliamentary actions — while AI fills gaps for absent users and controls remaining seats.

## Current Commit Scope
- Backend implementation for Steps 1–6 is complete in this branch.
- Step 7 remains planned and will be handled as a separate UI-focused change set.

## Steps

### Step 1: MdB seat system + data model
- **Status**: done
- **Files**: `schema.ts`, `seed.ts`, `types/index.ts`, `seats.ts` (new), `timing.ts`, `loop.ts`, `engine/index.ts`, `simulation/index.ts`
- **Result**: 4 tables added (bundestagSeats in SIM DB; mdbApplications/mdbVotes/mdbSpeeches in USER DB), seat allocation wired into election flow, `mdb_apply` feature key added, `getHumanSeatRatio()` helper. Build + migrate pass, all tables verified.

### Step 2: MdB application + approval with fair allocation
- **Status**: done
- **Files**: `seats.ts` (added reviewMdbApplications + deactivateUserSeat), `api/index.ts` (4 endpoints + seat deactivation on leave/join), `loop.ts`, `engine/index.ts`, `simulation/index.ts`
- **Result**: API endpoints (POST /api/seats/apply, GET /api/seats/my-seat, GET /api/seats/party/:partyId, GET /api/seats/available), AI-reviewed applications (max 3/party/day, priority scoring with activity+cooldown+lottery), seat deactivation on party leave/switch, 14-day rejection cooldown, German notifications. Build + migrate pass.

### Step 3: MdB voting on bills (direct seat ballots)
- **Status**: done
- **Files**: `voting.ts` (extended tallyVotes with MdB split-seat logic), `loop.ts` (load MdB votes + inject context), `prompt.ts` (MdB vote summary in agent prompt), `api/index.ts` (POST+GET mdb-vote endpoints), `types/index.ts` (mdbVoteSummary on AgentContext), `simulation/index.ts`
- **Result**: tallyVotes() now splits human-voted/proxy/AI seats per party, backward-compatible (no mdbVotes = old behavior). Whipped MdBs (level 3) forced to party line. API: POST /api/bills/:id/mdb-vote (upsert), GET /api/bills/:id/mdb-votes (summary+byParty+userVote). Build + typecheck pass.

### Step 4: MdB speeches and debates
- **Status**: done
- **Files**: `speeches.ts` (new), `api/index.ts` (POST+GET speech endpoints), `loop.ts` (call processDaySpeeches), `types/index.ts` (mdb_speech event type), `simulation/index.ts`
- **Result**: V1 accepts all speeches (1 per reading per user). API: POST /api/bills/:id/speech (validates seat, reading stage, 20-500 chars), GET /api/bills/:id/speeches (grouped by reading). processDaySpeeches() creates mdb_speech events + +0.1 sentiment. Slot lottery deferred to v2. Build passes.

### Step 5: MdB parliamentary actions with guardrails
- **Status**: done
- **Files**: `mdb-actions.ts` (new), `api/index.ts` (3 endpoints), `loop.ts` (call processMdbActions before party agents), `simulation/index.ts` (export)
- **Result**: 3 API endpoints (POST /api/motions/submit, POST /api/interpellations/submit, POST /api/bills/:id/amendment) queue actions as pending_injections. `processMdbActions()` consumes them: creates motion/interpellation/amendment records, tallies motion votes, emits events, applies sentiment. Strict validation (title/desc length, impact bounds ±0.3, 1 pending per type per user). Build passes.

### Step 6: Party discipline — progressive system
- **Status**: done
- **Files**: `discipline.ts` (new), `loop.ts` (call every 7 days), `simulation/index.ts` (export)
- **Result**: `reviewPartyDiscipline(currentDay)` runs every 7 sim days. Deterministic scoring: `votesAgainst * 2` from mdbVotes vs party AI vote on recent bills. Thresholds: score>=4 → escalate +1, score>=6 → +2, score=0 with activity → de-escalate -1. Level 4 = expel (deactivate seat). AI call per party for German reasoning text only. Notifications on level change with recovery guidance. Voting enforcement (level>=3 whipped) already in voting.ts. Speech restriction deferred to v2 (no slot lottery yet). Build passes.

### Step 7: UI integration + fairness visibility
- **Status**: planned
- **Files**:
  - `packages/web/src/api.ts` (add MdB types + API client functions)
  - `packages/web/src/pages/PartyDetail.tsx` (add MdB roster section)
  - `packages/web/src/pages/Dashboard.tsx` (add "Your MdB Seat" card in sidebar)
  - `packages/web/src/pages/BillDetail.tsx` (add MdB vote section + speech display)
  - `packages/web/src/components/MdbBadge.tsx` (new — reusable MdB indicator)
  - `packages/web/src/lib/colors.ts` (add `MDB_BADGE`, `DISCIPLINE_BADGE` color maps)
- **Plan**:
  1. Add types to `web/src/api.ts`: `BundestagSeat`, `MdbApplication`, `MdbVote`, `MdbSpeech` (local copies matching types package)
  2. Add API client functions: `getPartySeats(partyId)`, `getMySeat()`, `applyForSeat(text, focus?)`, `castMdbVote(billId, vote)`, `submitSpeech(billId, reading, content)`, `submitMotion(...)`, `submitInterpellation(...)`, `submitAmendment(...)`
  3. **PartyDetail.tsx**: Add "Bundestag Members" section below party info:
     - Table/list of active seats: seat#, displayName (or "AI"), discipline badge, proxy setting
     - "Apply for Seat" button (if user is member, no active seat, open seats available)
     - Application form modal: textarea + policy focus tags
     - Show `X/Y seats filled (Z open)` counter
  4. **Dashboard.tsx**: Add "Your MdB Seat" card in sidebar (only if user has seat):
     - Seat number, party, term info
     - Discipline status with colored badge (Good/Warning/Restricted/Whipped)
     - Proxy setting toggle (party_line / abstain)
     - "Bills awaiting your vote" count with link
     - If no seat but has party: "Apply for a Seat" CTA
  5. **BillDetail.tsx** (for third_reading bills):
     - "MdB Votes" section: bar showing user votes cast vs pending
     - User's own vote buttons (Yes/No/Abstain) if they have a seat
     - Party recommendation badge
     - Speech submission form (if in reading stage)
     - Display submitted speeches with author names
  6. **MdbBadge.tsx**: Small badge component `<MdbBadge level={0-3} />` with tooltip
  7. **colors.ts**: Add `MDB_BADGE` (green outline), `DISCIPLINE_BADGE` map (0=green, 1=yellow, 2=orange, 3=red)
  8. Across the app: show "MdB" badge next to user display names in events, votes, speeches
  - **Pattern**: Follow `PartyDetail.tsx` existing sections (proposals, signals). Follow `BillDetail.tsx` member signals section. Use `ALERT_STYLES` and badge patterns from `colors.ts`.
  - **Validate**: `npm run dev:web` — visual check of all new components
- **Risks**: Many UI changes across multiple pages. Build incrementally: PartyDetail roster first, then Dashboard card, then BillDetail voting.

## Design Decisions
- **Seat ownership model**: Seats have controllers (human/AI), not just a members list — makes voting and presence unambiguous
- **DB split**: `bundestagSeats` in SIM DB (engine reads during voting), `mdbApplications/mdbVotes/mdbSpeeches` in USER DB (user-initiated)
- **Seat split is preset-configurable**: ultra-fast/fast = 0% human (watch-only), normal = 30% human, slow = 70% human. Ratio stored in `timing.ts` FEATURE_AVAILABILITY.
- **Voting**: Human seats cast direct ballots; AI fills absent users via proxy defaults; party AI recommends but doesn't overwrite
- **No sim blocking**: Sim never waits for users — proxy settings fill gaps automatically
- **Fair allocation**: Priority + rotation + lottery for seat assignment; no "always-online" advantage
- **Participation is async**: Users submit actions between sim ticks; processed on next relevant day
- **Progressive discipline**: Warn → lose privileges → whip → expel (not binary)
- **Election turnover**: All seats reset, users must re-apply each term. Pending applications auto-expire when new election completes.
- **Applications enabled in "normal"**: Users can apply for seats in normal mode (via `mdb_apply` feature), even though voting/speeches are slow-only.
- **Preset gating**: MdB features gated per preset. New `mdb_apply` key for applications (normal+slow). Existing `vote_bills`, `give_speech`, `propose_amendments` for actions (slow only).
- **Backward compatibility**: `tallyVotes()` works without MdB votes (old behavior). All new tables use `CREATE TABLE IF NOT EXISTS`.
- **Deferred to Phase 2**: Committees as multiplayer layer, citizen lane expansion

## Existing Foundations
- Feature matrix in `timing.ts`: `request_to_speak`, `give_speech`, `vote_bills`, `propose_amendments` pre-reserved (lines 119-168). Add `mdb_apply` for applications.
- `isSessionDay()` in `cycles.ts`: every 5 days (unused, ready for speech processing cadence)
- `member_signals`: existing bill-level YES/NO system — MdB votes supersede this for seated members
- `requireParticipatory(feature?)`: API guard pattern ready (api/index.ts line 60)
- `internal-proposals.ts`: reference AI review workflow (callAI → JSON decision → update status → notification)
- `tallyVotes()` in `voting.ts`: seat-weighted party voting (lines 12-40) — extend with optional MdB override
- `pending_injections`: pattern for queuing user actions consumed by engine
- Auth pattern: `getUserToken(req)` + `X-User-Token` header (api/index.ts line 1460)
- DDL pattern: `SIM_TABLE_DDL` + `USER_TABLE_DDL` + column migrations in `seed.ts`
- Human seat ratios to add to `timing.ts`: ultra-fast/fast = 0, normal = 0.3, slow = 0.7
