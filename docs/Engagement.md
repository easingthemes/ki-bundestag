# KI Bundestag — User Engagement Reference: Party Membership & Internal Democracy

> **Doc Status**: Active (current-spec + reference)
> **Use for**: Membership/proposals/signals behavior and design rationale

**Goal**: Let visitors become active participants — join a party, propose legislation, vote in internal party caucuses, and shape what the AI faction brings to the Bundestag floor.

---

## Design Principles

1. **Zero friction identity** — No passwords, no email. A display name + UUID token stored in localStorage. Joining takes 10 seconds.
2. **Real influence, bounded** — Member participation genuinely affects AI party behavior, but the AI agent remains the final arbiter. Members advise; the party decides.
3. **Transparency** — All internal decisions (AI accepts/declines a proposal, and why) are public. The process is as visible as a Bundestag debate.
4. **No spam ceiling** — Limits on proposals per member + quorum requirements prevent single-player gaming.
5. **Graceful for empty parties** — 0 members is fine at the start. Membership begins to matter only once a meaningful threshold is crossed.

---

## Behavioral Notes & Rationale

**Identity without auth**: A UUID token in `localStorage` is enough. No password, no email — just a display name. This removes the #1 barrier to participation. The token is sent as an `X-User-Token` header on write requests.

**Dual proposal tracks**: The AI party agent continues to propose bills directly to the Bundestag via its existing daily action. Internal proposals are a *parallel democratic track* — members (and the AI's own internal suggestion) compete for the party's one "endorsement slot" per review cycle. This keeps the simulation running even with zero members.

**AI also participates internally**: When the AI agent proposes a bill, a copy also appears in the internal proposals list. Members can vote it up or down. Heavy downvotes on the AI's own proposal will appear in the agent's next-day context, potentially making it reconsider. This makes the AI feel accountable to its base.

**Proposal quorum**: To enter the review queue, a proposal needs ≥ 3 votes (total, up or down). This prevents a single person with a throwaway account from forcing AI review.

**Soft influence on approval**: A party with 0 members isn't penalized. A party with a growing, active membership gets a small approval bonus (max +5 points), using a logarithmic curve so 10 members matters more than going from 1000 to 1010.

**Member bill signals**: Before third-reading votes, members can signal YES or NO on any Bundestag bill. The party agent sees "Member sentiment: 68% YES" in context. This isn't binding but creates a feedback loop between user opinion and AI votes — closing the participation circle.

**Attribution**: Bills that originated as member proposals carry a "Member Initiative" badge in the Bundestag pipeline and on the Bill Detail page. If the bill passes, the proposer is credited. Simple recognition, no points system.

---

## E.1 — User Identity & Party Membership

**What it does**: Users can register with just a name, join one party, and be recognized as a member across sessions.

### Data Model Table: `users`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | Primary key / token |
| `display_name` | TEXT | Public name, 2–30 chars |
| `party_id` | TEXT \| NULL | FK to parties, null if no party |
| `created_at` | INTEGER | Unix timestamp |
| `last_active` | INTEGER | Updated on any write action |
| `switch_cooldown_until` | INTEGER | Sim day when switching is unlocked |

### API Endpoints

- `POST /api/users/register` — `{displayName, partyId}` → `{id, displayName, partyId}` (id = UUID = token)
- `GET /api/users/me` (header: `X-User-Token: <uuid>`) → user profile + stats
- `POST /api/users/me/join/:partyId` (auth) → switch party; returns error if cooldown active
- `POST /api/users/me/leave` (auth) → leave party, sets party_id null

Switching party sets `switch_cooldown_until = currentDay + 7`. Rejoining or joining after leaving also checks cooldown.

### Engine behavior

None — membership is purely a web/API concern at this phase.

### UI behavior

**Parties page**:
- Each party card shows "👥 N members" count (small, below the seat count)
- "Join" button on each card. If token exists and this is your party: "Your Party ✓" badge instead

**Party Detail page**:
- "👥 N members" in the header section
- "Join this Party" CTA button (if not a member), or "Member since Day X" if you are
  - Party switching: "Switch Party" link that warns about the 7-day cooldown

**Join Flow (modal)**:
```
┌─────────────────────────────────┐
│  Join SPD                       │
│                                 │
│  Display name:                  │
│  [________________________]     │
│                                 │
│  Your name is public within     │
│  the party. No account needed.  │
│                                 │
│  [Cancel]   [Join SPD →]        │
└─────────────────────────────────┘
```
On success: token stored to `localStorage` as `ki-bundestag-token`. User object cached as `ki-bundestag-user` (JSON). Page re-renders showing membership status.

---

## E.2 — Internal Proposals

**What it does**: Members can submit bill proposals into a party-internal caucus. The AI agent's own daily proposal also appears here as an "AI Suggestion". All proposals are publicly visible (transparency).

### Data Model Table: `internal_proposals`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (UUID) | |
| `party_id` | TEXT | FK parties |
| `proposed_by` | TEXT | userId or `"ai"` |
| `proposer_name` | TEXT | display_name or party short name |
| `title` | TEXT | max 80 chars |
| `description` | TEXT | max 500 chars |
| `category` | TEXT | BillCategory enum |
| `rationale` | TEXT | max 200 chars — "why now?" |
| `status` | TEXT | `open` / `reviewing` / `accepted` / `declined` / `expired` |
| `vote_score` | INTEGER | sum of +1/-1 votes (denormalized) |
| `total_votes` | INTEGER | count of votes cast |
| `created_on_day` | INTEGER | sim day |
| `review_by_day` | INTEGER | `created_on_day + 5` — when it becomes reviewable |
| `reviewed_on_day` | INTEGER \| NULL | |
| `decline_reason` | TEXT \| NULL | AI's reason if declined |
| `bundestag_bill_id` | TEXT \| NULL | Bill ID if accepted and submitted |

**Constraints**:
- One active proposal per member at a time (`status = open` or `reviewing`)
- Max 5 open proposals per party at any time
- Members must be in the party to propose; can still see proposals after leaving

### API Endpoints

- `GET /api/parties/:id/proposals?status=open` — list proposals
- `POST /api/parties/:id/proposals` (auth, must be member) — create proposal
- `GET /api/proposals/:id` — single proposal detail

### Engine behavior

**`loop.ts`** — Party agent daily step: when building `AgentContext`, include `topInternalProposals: InternalProposal[]` (top 3 by vote score that are `open`, for the agent's own party). Agent sees member preferences in its thinking context.

When AI agent action `propose_bill` is processed: also insert a copy into `internal_proposals` with `proposed_by = "ai"`, `status = "open"`, `review_by_day = currentDay + 5`.

### UI: "Proposals" tab on Party Detail

```
Party Agenda — Internal Proposals          [Propose a Bill ↑]

  ▲ 9  │ Renewable Energy Investment Fund             [AI]  2 days left
       │ Economy · SPD internal suggestion · Day 41
  ─────┼──────────────────────────────────────────────────────────────
  ▲ 4  │ Universal Basic Income Pilot Programme      [You]  4 days left
  ▼    │ Social · Proposed by you · Day 40
  ─────┼──────────────────────────────────────────────────────────────
  ▲ 2  │ Digital Broadband for Rural Areas           [mbr]  3 days left
       │ Infrastructure · Proposed by anna · Day 41

  Past Decisions
  ✓ Accepted → "Renewable Energy Act" now in Bundestag  (Day 38)
  ✗ Declined: "Fiscal constraints make this premature"  (Day 33)
  — Expired without review (< 3 votes)                  (Day 28)
```

**Propose a Bill form** (inline panel or modal):
```
Title           [_________________________________] 80 chars
Category        [Economy ▼]
Description     [_________________________________]
                [_________________________________] 500 chars
Why now?        [_________________________________] 200 chars
                                        [Submit Proposal]
```

---

## E.3 — Member Voting on Proposals

**What it does**: Members can vote up or down on any open proposal (including the AI's suggestion). Voting is visible to everyone; your own vote is highlighted.

### Data Model Table: `internal_votes`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | UUID |
| `proposal_id` | TEXT | FK internal_proposals |
| `user_id` | TEXT | FK users |
| `vote` | INTEGER | +1 or -1 |
| `created_at` | INTEGER | Unix timestamp |

Unique constraint: `(proposal_id, user_id)` — one vote per person per proposal. Can be changed (upsert).

### API Endpoints

- `POST /api/proposals/:id/vote` (auth) — `{vote: 1 | -1}` — upserts vote, updates `vote_score` and `total_votes` on proposal
- `DELETE /api/proposals/:id/vote` (auth) — retract vote

Proposal list responses include `userVote: 1 | -1 | null` when request includes auth token.

### UI behavior

Each proposal row in the Proposals tab shows vote buttons:

```
  [▲]  [▼]
  (+4)       Renewable Energy Investment Fund  ...
```

- Your current vote highlighted (filled arrow vs. outline)
- Score shown as net (+4, -1, 0)
- Voting requires being a member of the party

Non-members see the scores but no vote buttons — "Join to vote".

---

## E.4 — Party Decision Engine

**What it does**: Every sim day, a review step checks if any proposals are ready (age ≥ 5 days, ≥ 3 total votes). The top-scored ready proposal per party is sent to the AI for a focused accept/decline decision.

### Engine behavior

**`packages/engine/src/simulation/internal-proposals.ts`** (new file)

```ts
export async function reviewInternalProposals(
  db, partyId, currentDay, agentContext
): Promise<void>

// For each party:
//   Find proposals where: status = 'open', currentDay >= review_by_day, total_votes >= 3
//   Take the one with highest vote_score
//   If none: return
//   Call Haiku with: party ideology + proposal + recent political context
//   Prompt: "Should [Party] officially sponsor this bill? Respond JSON: {decision: 'accept'|'decline', reason: string}"
//   If accept: create bill in Bundestag pipeline (proposed_by = proposer_name, tagged as member initiative)
//             update proposal status → 'accepted', bundestag_bill_id set
//             emit event: 'member_proposal_accepted'
//   If decline: update proposal status → 'declined', decline_reason set
//               emit event: 'member_proposal_declined'
//   All other open, expired proposals (past review_by_day, < 3 votes) → 'expired'
```

**`loop.ts`** — add step after party agents run: call `reviewInternalProposals()` for each party.

**`schema.ts`** — add `internal_proposals` and `internal_votes` tables. Add `member_initiative: boolean` column to `bills` table. Add `proposer_display_name: string | null` to `bills`.

**`prompt.ts`** — add `topInternalProposals` array to `AgentContext`:
```ts
topInternalProposals: Array<{
  title: string; category: string; score: number; totalVotes: number;
}>;
```
Shown in agent context as: "Top member proposals in your caucus (by votes): …"

### Bill Detail / Bills page changes

- New "Member Initiative" badge (purple) for bills with `member_initiative = true`
- Bill detail shows "Originally proposed by [name], [Party] · Day N" when applicable

---

## E.5 — Membership Influence on Approval

**What it does**: Party approval rating gets a small bonus based on active membership. Parties with engaged members are more resilient to negative drift.

### Formula

```ts
// Run once per sim day in opinion.ts alongside normal drift
const activeMembers = db.select(count())
  .from(users)
  .where(
    and(eq(users.partyId, party.id),
        gte(users.lastActive, Date.now() - 14 * 24 * 60 * 60 * 1000))
  ).get();

// Logarithmic curve: 0 members = 0, ~10 active = +1.0, ~100 = +2.0, ~1000 = +3.0, hard cap +5
const memberBonus = Math.min(5, Math.log10(activeMembers + 1) * 2.5);
party.approvalRating = clamp(party.approvalRating + memberBonus * 0.01, MIN, MAX);
```

The bonus is tiny per day but compounds — rewarding parties that attract real engagement over time. Zero members gives exactly 0 bonus (not a penalty).

### UI

Party cards on the Parties page add below the approval rating:
`👥 N members · +X.X approval/day` (only shown if N > 0)

---

## E.6 — Member Bill Signals

**What it does**: Before a Bundestag bill reaches third reading, members of any party can signal YES or NO. The party AI agent sees this signal in its vote context. Not binding — just another input.

### Data Model Table: `member_signals`

| Column | Type |
|---|---|
| `id` | TEXT |
| `bill_id` | TEXT |
| `user_id` | TEXT |
| `signal` | TEXT (`yes` / `no`) |
| `created_at` | INTEGER |

Unique: `(bill_id, user_id)`.

### API Endpoints

- `POST /api/bills/:id/signal` (auth) — `{signal: "yes" | "no"}`
- `GET /api/bills/:id/signal` — `{yes: N, no: M, userSignal?: "yes" | "no"}`

### Engine behavior

When a bill moves to `third_reading`, compute `memberSignals` per party (count YES/NO from that party's members). Add to agent vote context:
```
Member sentiment on "[Bill Title]": 68% YES (17/25 members signalled)
```

### UI

On Bills page and Bill Detail, bills in `second_reading` or `third_reading` show a small signal bar:
```
Member signals:  [████████░░░░] 68% YES  (25 votes)  [👍 YES] [👎 NO]
```

---

## Additional Shipped Engagement UX

The following engagement-oriented UX capabilities are shipped in addition to E.1–E.6:

- Activity and feedback surfaces: user activity feed (`/my-activity`) and contextual outcome linking in bill/proposal flows.
- Onboarding and prompts: guided onboarding flow plus contextual quick actions based on user role/state.
- Dashboard participation widgets: impact/catchup-oriented cards and event awareness surfaces.
- Engagement telemetry foundations: user-action logging and participation-oriented analytics endpoints used by admin/ops pages.

These features support discoverability and sustained participation without changing core democratic mechanics.

---

## Implementation Reference

### Data Model Tables
| Table | Purpose |
|---|---|
| `users` | Registered members |
| `internal_proposals` | Party caucus proposals |
| `internal_votes` | Member votes on proposals |
| `member_signals` | Member YES/NO on Bundestag bills (E.6) |

### Modified Data Model Tables
| Table | New columns |
|---|---|
| `bills` | `member_initiative` (boolean), `proposer_display_name` (text \| null) |

### API Endpoints
```
POST   /api/users/register
GET    /api/users/me
POST   /api/users/me/join/:partyId
POST   /api/users/me/leave

GET    /api/parties/:id/proposals
POST   /api/parties/:id/proposals
GET    /api/proposals/:id
POST   /api/proposals/:id/vote
DELETE /api/proposals/:id/vote

POST   /api/bills/:id/signal          (E.6)
GET    /api/bills/:id/signal          (E.6)
```

### Engine Files
- `packages/engine/src/simulation/internal-proposals.ts` — review step

### Engine Touchpoints
- `loop.ts` — add proposal review step + AI proposal mirroring + member bonus
- `prompt.ts` — add `topInternalProposals` to AgentContext
- `schema.ts` — new tables + bill columns
- `opinion.ts` — membership bonus in approval drift

### Web Pages / Sections
- **Party Detail** — "Proposals" section/tab (replace or extend existing tabs)
- **Bill Detail** — "Member Initiative" badge + proposer credit
- **Bills page** — "Member Initiative" badge filter

### Web Page Touchpoints
- **Parties** — member count + Join button on each card
- **Party Detail** — Join flow, member count in header, proposal list

---

## Source Anchors (Code)

- Identity and membership API: [packages/api/src/index.ts](packages/api/src/index.ts#L1706-L1797)
- Proposal APIs and voting APIs: [packages/api/src/index.ts](packages/api/src/index.ts#L1519-L1668)
- Bill signal API: [packages/api/src/index.ts](packages/api/src/index.ts#L234-L277)
- Engagement schema tables (`users`, `internal_proposals`, `internal_votes`, `member_signals`): [packages/engine/src/db/schema.ts](packages/engine/src/db/schema.ts#L228-L287)
- Bill attribution fields (`member_initiative`, `proposer_display_name`): [packages/engine/src/db/schema.ts](packages/engine/src/db/schema.ts#L32-L33)
- Proposal decision engine: [packages/engine/src/simulation/internal-proposals.ts](packages/engine/src/simulation/internal-proposals.ts#L16-L143)
- Loop integration points (top proposals, signals, review step, membership bonus): [packages/engine/src/simulation/loop.ts](packages/engine/src/simulation/loop.ts#L913-L969), [packages/engine/src/simulation/loop.ts](packages/engine/src/simulation/loop.ts#L1662-L1736)
- Agent prompt integration for member proposals/signals: [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts#L169-L177), [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts#L254-L257)
- Membership bonus function: [packages/engine/src/simulation/opinion.ts](packages/engine/src/simulation/opinion.ts#L49-L54)
