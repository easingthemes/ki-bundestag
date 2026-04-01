# Abgeordnetenwatch-Inspired Feature Roadmap

> Overview plan for features inspired by abgeordnetenwatch.de integration.
> Reference: `docs/abgeordnetenwatch-api-reference.md`
> Created: 2026-04-01

## Context

Abgeordnetenwatch.de centers on **individual politician transparency** — voting records, Q&A, side jobs, committee roles. KI Bundestag has excellent bill/legislative/party tracking but **lacks the "people" dimension**. Much of the backend data already exists but isn't surfaced in the UI.

---

## Critical Design Constraint: Simulation Time vs Real Time

**Simulation days run much faster than real days.** A simulation started today could be in its second year within one real-world month. This creates a fundamental temporal mismatch when integrating real-world data:

### Rules for ALL groups:

1. **Real-world data is INSPIRATION, not ground truth.** Never present real-world data as current simulation facts. The simulation has its own government, coalition, opposition, and political timeline that diverge from reality immediately.

2. **Ruling parties differ.** The simulation's coalition may be completely different from the real German government. Never assume who governs — always attribute positions to parties by name, never to "Regierung" or "Opposition".

3. **Real-world data becomes stale fast.** Knowledge is fetched every 7 real-world days, but the simulation may advance 30+ sim days in that time. By the time new data arrives, the simulation may have already addressed those issues organically.

4. **Use real data for STRUCTURAL grounding only:**
   - Committee names → stable across a legislative period (OK to use directly)
   - Party ideological positions → evolve slowly (OK as baseline calibration)
   - Voting patterns → useful as behavioral tendency, not as prescriptive rules
   - News headlines → treat as "topic inspiration", not dated events
   - Side jobs / Q&A topics → use as creative templates, not literal facts

5. **Never inject dated real-world events into simulation timeline.** Frame everything as timeless themes, structural tendencies, or creative inspiration. The existing digest system already strips dates and government references — all new features must follow this pattern.

6. **Label clearly.** When showing real-world data alongside simulation data (e.g., Group 4 voting comparison), clearly label which is "Realwelt" and which is "Simulation" so users aren't confused.

7. **Graceful degradation.** All features must work without real-world data. If API fetches fail or data is stale, fall back to simulation-only data. Real-world grounding is an enhancement, not a dependency.

### Existing safeguards (in `knowledge-fetch.ts`):
- Digest prompt explicitly strips government references and dates
- Headlines consumed once per sim day then deactivated
- Shocks persist until AI marks them resolved
- Party positions stored as ideological stances, not government actions
- 7-day fetch cooldown prevents over-fetching

---

## Group 1: MdB Profiles & Listing (High Impact)

**Plan**: [group1-mdb-profiles.md](./group1-mdb-profiles.md)
**Status**: Not started
**Effort**: Medium
**Backend data exists**: Yes — `bundestagSeats`, `mdbVotes`, `mdbSpeeches`, `mdbApplications`

### 1.1 MdB Listing Page (`/mdb`)
- Browse all current parliament members
- Filter by party, role, committee, controller type (user vs AI)
- Search by name
- Grid/list view with avatar, party, seat number

### 1.2 MdB Profile Page (`/mdb/:id`)
- Personal info (name, party, seat number, role)
- Voting record: how they voted on each bill
- Speeches: all speeches delivered on bills
- Application info (motivation, policy focus — for user-controlled MdBs)
- Activity timeline

### 1.3 Per-MdB Voting Display on Bill Detail
- On BillDetail page, show individual MdB votes (not just party aggregates)
- "Who voted how" breakdown, filterable by party

**Files affected**:
- New: `packages/web/src/pages/MdbList.tsx`, `packages/web/src/pages/MdbDetail.tsx`
- Modified: `packages/web/src/main.tsx` (routes), `packages/web/src/pages/BillDetail.tsx`
- New API routes or extensions in `packages/api/src/routes/seats.ts`

---

## Group 2: Committee System (Medium Impact)

**Plan**: [group2-committee-system.md](./group2-committee-system.md)
**Status**: Not started
**Effort**: Low–Medium
**Backend data exists**: Partial — committee names on bills, now fetched from API. No membership tracking.

### 2.1 Committee Listing Page (`/committees`)
- Show all Bundestag committees (real names from abgeordnetenwatch API)
- Number of bills currently in each committee
- Link to bills in committee stage

### 2.2 Committee Detail
- List of bills assigned to this committee
- Committee recommendations history (pass/reject/amend stats)
- Committee membership (requires Group 2.3)

### 2.3 Committee Membership Table
- New DB table linking MdBs to committees
- Auto-assign AI MdBs based on party proportional representation
- Show on MdB profiles and committee pages

**Files affected**:
- New: `packages/web/src/pages/Committees.tsx`, `packages/web/src/pages/CommitteeDetail.tsx`
- New schema: committee membership table in `packages/engine/src/db/schema-sim.ts`
- Modified: `packages/web/src/main.tsx`, `packages/api/src/routes/parliament.ts`
- Modified: `packages/engine/src/simulation/committees.ts` (membership assignment)

---

## Group 3: Side Jobs & Scandals (Medium Impact)

**Plan**: [group3-sidejobs-scandals.md](./group3-sidejobs-scandals.md)
**Status**: Not started
**Effort**: Medium
**Backend data exists**: No — new tables needed. Real sidejob data now fetched from API.

### 3.1 Side Jobs Table & Generation
- New `sidejobs` table (politician, organization, income level, description)
- AI generates side jobs for AI-controlled MdBs during simulation
- Real sidejob data from abgeordnetenwatch inspires generated content

### 3.2 Side Jobs on MdB Profiles
- Display side jobs on MdB profile page (Nebentätigkeiten tab)
- Income level badges

### 3.3 Side Job Scandal Events
- Side jobs can trigger media articles and scandals
- Affect party approval ratings
- Feed into media article generation with realistic scandal topics

**Files affected**:
- New schema: `sidejobs` table in `packages/engine/src/db/`
- New: `packages/engine/src/simulation/sidejobs.ts`
- Modified: `packages/engine/src/simulation/media.ts` (scandal generation)
- Modified: MdB profile page (from Group 1)

---

## Group 4: Enhanced Voting Intelligence (Medium Impact)

**Plan**: [group4-voting-intelligence.md](./group4-voting-intelligence.md)
**Status**: Partially started (API fetching done in #031)
**Effort**: Low–Medium

### 4.1 Real vs Simulated Voting Comparison
- Dashboard widget showing how simulated party votes compare to real Bundestag votes
- Uses per-party voting breakdowns from abgeordnetenwatch polls (already fetched)

### 4.2 Voting Pattern Calibration
- Use real vote data to influence AI party voting tendencies
- E.g., if CDU votes 95% together in reality, enforce similar discipline in simulation

### 4.3 Historical Voting Alignment Matrix
- Show party-to-party voting alignment over time
- "SPD and Grüne agree 78% of the time" — based on simulation data
- Compare against real-world alignment from abgeordnetenwatch

**Files affected**:
- New widget in `packages/web/src/pages/Dashboard.tsx` or `packages/web/src/pages/Elections.tsx`
- Modified: `packages/engine/src/agent/prompt.ts` (voting calibration context)
- New API endpoint for alignment data

---

## Group 5: Citizen Q&A Enhancement (Lower Impact)

**Plan**: [group5-qa-enhancement.md](./group5-qa-enhancement.md)
**Status**: Partially started (API fetching done in #031)
**Effort**: Low

### 5.1 Question Topic Suggestions
- Use real citizen questions from abgeordnetenwatch as topic suggestions
- "Trending questions" sidebar showing what real citizens are asking
- Inspire users to ask similar questions to simulation parties

### 5.2 Question Categories / Topics
- Tag questions with policy topics (like abgeordnetenwatch's Topic entity)
- Filter questions by topic
- Show topic distribution chart

**Files affected**:
- Modified: `packages/web/src/pages/Questions.tsx`
- Modified: `packages/engine/src/simulation/knowledge-fetch.ts` (already fetching questions)
- Possibly new `question_topics` categorization

---

## Group 6: Transparency & Matching Tools (Lower Impact)

**Plan**: [group6-transparency-tools.md](./group6-transparency-tools.md)
**Status**: Not started
**Effort**: Medium–High

### 6.1 "Which Party Matches You?" Quiz
- Inspired by Kandidierendencheck
- 10–15 policy theses, user agrees/disagrees
- Match percentage against each party's simulated positions
- Uses party voting history and stated positions

### 6.2 Lobbying Events
- Simulate lobbying interactions that influence party behavior
- Transparency page showing lobbying activity
- Media coverage of lobbying events

### 6.3 Party Donation Tracking
- Simulated donation system
- Transparency dashboard showing funding sources

**Files affected**:
- New pages, new engine modules, new DB tables
- Largest effort of all groups

---

## Priority Order

| Priority | Group | Rationale |
|----------|-------|-----------|
| 1 | **Group 1: MdB Profiles** | Highest impact, backend data already exists |
| 2 | **Group 2: Committees** | Real committee names already fetched, natural extension |
| 3 | **Group 4: Voting Intelligence** | API data already flowing, mostly frontend work |
| 4 | **Group 5: Q&A Enhancement** | Quick wins, data already fetched |
| 5 | **Group 3: Side Jobs** | New tables needed but realistic content |
| 6 | **Group 6: Transparency Tools** | Most effort, nice-to-have |

---

## Dependencies

```
Group 1 (MdB Profiles) ← Group 2.3 (Committee Membership shown on profiles)
Group 1 (MdB Profiles) ← Group 3.2 (Side Jobs shown on profiles)
Group 2.3 (Committee Membership) ← Group 2.1/2.2 (Committee pages)
Group 4.1 (Voting Comparison) ← #031 done (API fetching) ✓
Group 5.1 (Q&A Suggestions) ← #031 done (API fetching) ✓
```

Group 1 should be done first as Groups 2, 3, and 4 all enhance MdB profiles.
