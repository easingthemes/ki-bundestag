# Group 1: MdB Profiles & Listing

> Detailed implementation plan
> Parent: docs/plans/abgeordnetenwatch-feature-roadmap.md
> Status: Not started

## Overview

Add dedicated pages for browsing all Members of Bundestag (MdB) and viewing individual MdB profiles with voting history, speeches, and activity. This requires two new API endpoints, two new frontend pages, web API client additions, and navigation/linking updates across the app.

**Sim time constraint**: This group uses only simulation-internal data (seats, votes, speeches). No real-world data is displayed, so there are no sim time vs real time issues.

---

## Step 1: New API endpoints for MdB data

File: `packages/api/src/routes/seats.ts`

### 1.1 GET /api/seats/roster

Returns ALL active seats across all parties, enriched with user display names and avatar URLs. Supports optional `?partyId=` filter query parameter.

**Implementation:**

```typescript
// GET /api/seats/roster — full public roster of all active MdBs
router.get("/api/seats/roster", (req, res) => {
  const partyId = req.query.partyId as string | undefined;
  const seats = getActiveSeats(partyId || undefined);

  // Enrich with user display names + avatar
  const userDb = getUserDb();
  const enriched = seats.map(seat => {
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    if (seat.userId) {
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, seat.userId))
        .all()[0];
      displayName = user?.displayName ?? null;
      avatarUrl = user?.avatarUrl ?? null;
    }
    return { ...seat, displayName, avatarUrl };
  });

  res.json(enriched);
});
```

**Response shape:**
```typescript
// Array of:
interface RosterSeat {
  id: string;
  seatNumber: number;
  partyId: string;
  controller: "human" | "ai";
  userId: string | null;
  electionId: string | null;
  active: boolean;
  proxyDefault: "party_line" | "abstain";
  disciplineLevel: number;
  disciplineReason: string | null;
  allocatedOnDay: number;
  displayName: string | null;   // enriched
  avatarUrl: string | null;     // enriched
}
```

**Imports needed** (already available in seats.ts):
- `getActiveSeats` from `@ki-bundestag/engine`
- `getUserDb`, `schema` from `@ki-bundestag/engine`
- `eq` from `drizzle-orm`

### 1.2 GET /api/seats/:seatId

Returns a single seat with full detail: voting history (with bill titles), speeches (with bill titles), and application info if human-controlled.

**Implementation:**

```typescript
router.get("/api/seats/:seatId", (req, res) => {
  const { seatId } = req.params;
  const db = getDb();
  const userDb = getUserDb();
  const sqlite = getSqlite();
  const userSqlite = getUserSqlite();

  // 1. Get the seat
  const seat = db.select().from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.id, seatId))
    .get();
  if (!seat) { res.status(404).json({ error: "Seat not found" }); return; }

  // 2. Enrich with user info
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  let partyName: string | null = null;
  if (seat.userId) {
    const user = userDb.select().from(schema.users)
      .where(eq(schema.users.id, seat.userId))
      .all()[0];
    displayName = user?.displayName ?? null;
    avatarUrl = user?.avatarUrl ?? null;
  }

  // Get party name + color
  const party = db.select().from(schema.parties)
    .where(eq(schema.parties.id, seat.partyId))
    .get();

  // 3. Voting history — join mdb_votes with bills
  //    mdb_votes is in users.db, bills is in simulation.db
  //    Must query separately and join in code
  const votes = seat.userId
    ? userSqlite.prepare(
        "SELECT id, bill_id, vote, created_at FROM mdb_votes WHERE user_id = ? ORDER BY created_at DESC"
      ).all(seat.userId) as Array<{ id: string; bill_id: string; vote: string; created_at: number }>
    : [];

  // Enrich votes with bill titles from simulation.db
  const enrichedVotes = votes.map(v => {
    const bill = sqlite.prepare(
      "SELECT title, status, category, proposed_by FROM bills WHERE id = ?"
    ).get(v.bill_id) as { title: string; status: string; category: string; proposed_by: string } | undefined;
    return {
      id: v.id,
      billId: v.bill_id,
      vote: v.vote,
      createdAt: v.created_at,
      billTitle: bill?.title ?? "Unbekannt",
      billStatus: bill?.status ?? "unknown",
      billCategory: bill?.category ?? "",
      billProposedBy: bill?.proposed_by ?? "",
    };
  });

  // 4. Speeches — mdb_speeches in users.db, enrich with bill info
  const speeches = seat.userId
    ? userSqlite.prepare(
        "SELECT id, bill_id, reading, content, sentiment_impact, day_number, created_at FROM mdb_speeches WHERE user_id = ? ORDER BY day_number DESC"
      ).all(seat.userId) as Array<{
        id: string; bill_id: string; reading: number; content: string;
        sentiment_impact: number | null; day_number: number; created_at: number;
      }>
    : [];

  const enrichedSpeeches = speeches.map(s => {
    const bill = sqlite.prepare(
      "SELECT title, status FROM bills WHERE id = ?"
    ).get(s.bill_id) as { title: string; status: string } | undefined;
    return {
      id: s.id,
      billId: s.bill_id,
      reading: s.reading,
      content: s.content,
      sentimentImpact: s.sentiment_impact,
      dayNumber: s.day_number,
      createdAt: s.created_at,
      billTitle: bill?.title ?? "Unbekannt",
      billStatus: bill?.status ?? "unknown",
    };
  });

  // 5. Application info (only if human seat)
  let application = null;
  if (seat.userId && seat.controller === "human") {
    application = userSqlite.prepare(
      "SELECT id, application_text, policy_focus, status, ai_reasoning, priority_score, created_on_day, reviewed_on_day FROM mdb_applications WHERE user_id = ? AND status = 'approved' ORDER BY reviewed_on_day DESC LIMIT 1"
    ).get(seat.userId) as {
      id: string; application_text: string; policy_focus: string | null;
      status: string; ai_reasoning: string | null; priority_score: number | null;
      created_on_day: number; reviewed_on_day: number | null;
    } | undefined ?? null;
  }

  // 6. Vote statistics
  const voteStats = {
    total: enrichedVotes.length,
    yes: enrichedVotes.filter(v => v.vote === "yes").length,
    no: enrichedVotes.filter(v => v.vote === "no").length,
    abstain: enrichedVotes.filter(v => v.vote === "abstain").length,
  };

  res.json({
    ...seat,
    displayName,
    avatarUrl,
    partyName: party?.name ?? seat.partyId,
    partyColor: party?.color ?? "#666",
    votes: enrichedVotes,
    speeches: enrichedSpeeches,
    application,
    voteStats,
  });
});
```

**Response shape:**
```typescript
interface MdbProfile {
  // Base seat fields
  id: string;
  seatNumber: number;
  partyId: string;
  controller: "human" | "ai";
  userId: string | null;
  electionId: string | null;
  active: boolean;
  proxyDefault: "party_line" | "abstain";
  disciplineLevel: number;
  disciplineReason: string | null;
  allocatedOnDay: number;
  // Enriched fields
  displayName: string | null;
  avatarUrl: string | null;
  partyName: string;
  partyColor: string;
  votes: MdbVoteDetail[];
  speeches: MdbSpeechDetail[];
  application: MdbApprovedApplication | null;
  voteStats: { total: number; yes: number; no: number; abstain: number };
}

interface MdbVoteDetail {
  id: string;
  billId: string;
  vote: "yes" | "no" | "abstain";
  createdAt: number;
  billTitle: string;
  billStatus: string;
  billCategory: string;
  billProposedBy: string;
}

interface MdbSpeechDetail {
  id: string;
  billId: string;
  reading: number;
  content: string;
  sentimentImpact: number | null;
  dayNumber: number;
  createdAt: number;
  billTitle: string;
  billStatus: string;
}

interface MdbApprovedApplication {
  id: string;
  applicationText: string;
  policyFocus: string | null;
  status: string;
  aiReasoning: string | null;
  priorityScore: number | null;
  createdOnDay: number;
  reviewedOnDay: number | null;
}
```

**Additional imports needed in seats.ts:**
- `getUserSqlite` from `@ki-bundestag/engine` (add to existing import line)

---

## Step 2: Web API client additions

### 2.1 New types

File: `packages/web/src/api/types.ts`

Add after the existing `MdbVoteSummary` interface:

```typescript
// ── MdB profile types ────────────────────────────────────────────────────────

export interface RosterSeat extends BundestagSeat {
  avatarUrl: string | null;
}

export interface MdbVoteDetail {
  id: string;
  billId: string;
  vote: "yes" | "no" | "abstain";
  createdAt: number;
  billTitle: string;
  billStatus: string;
  billCategory: string;
  billProposedBy: string;
}

export interface MdbSpeechDetail {
  id: string;
  billId: string;
  reading: number;
  content: string;
  sentimentImpact: number | null;
  dayNumber: number;
  createdAt: number;
  billTitle: string;
  billStatus: string;
}

export interface MdbApprovedApplication {
  id: string;
  applicationText: string;
  policyFocus: string | null;
  status: string;
  aiReasoning: string | null;
  priorityScore: number | null;
  createdOnDay: number;
  reviewedOnDay: number | null;
}

export interface MdbProfile extends BundestagSeat {
  avatarUrl: string | null;
  partyName: string;
  partyColor: string;
  votes: MdbVoteDetail[];
  speeches: MdbSpeechDetail[];
  application: MdbApprovedApplication | null;
  voteStats: { total: number; yes: number; no: number; abstain: number };
}
```

### 2.2 New API functions

File: `packages/web/src/api/endpoints.ts`

Add in the `// -- Seats` section:

```typescript
export const getRoster = (partyId?: string) =>
  fetchJson<RosterSeat[]>(`/seats/roster${partyId ? `?partyId=${partyId}` : ""}`);
export const getMdbProfile = (seatId: string) =>
  fetchJson<MdbProfile>(`/seats/${seatId}`);
```

Add to the import list in the same file:
```typescript
import { ..., RosterSeat, MdbProfile } from "./types.js";
```

Add to the `api` object at the bottom:
```typescript
getRoster,
getMdbProfile,
```

---

## Step 3: MdB Listing Page (/mdb)

File: `packages/web/src/pages/MdbList.tsx` (NEW)

### Component structure

```typescript
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPills } from "@/components/FilterPills";
import { MdbBadge, DisciplineBadge } from "@/components/MdbBadge";
import { useApiData } from "@/hooks/useApiData";
import { getRoster, getParties } from "@/api/endpoints";
import type { RosterSeat, Party } from "@/api/types";
import { MDB_BADGE } from "@/lib/colors";

export function MdbList() { ... }
```

### Layout and features

1. **Page title**: `<h1>Abgeordnete</h1>` with subtitle "Alle Mitglieder des Bundestags"

2. **Summary bar** (top): Total seats count, human vs. AI breakdown, seats per party as small colored chips

3. **Filter pills**: Filter by party using `<FilterPills>` component
   - Options: `[{ value: "all", label: "Alle" }, ...parties.map(p => ({ value: p.id, label: p.name }))]`
   - Additional toggle: "Nur Spieler" (humans only) checkbox/pill

4. **Seat grid**: Responsive grid of seat cards (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`)
   - Each card is a `<Link to={/mdb/${seat.id}}>` wrapped `<Card>`
   - Card content:
     - Left: Avatar circle (initials or image via `avatarUrl`) with party color border
     - Center: Display name (or "KI-Abgeordnete/r" + seat number for AI), party name
     - Right: `<MdbBadge />` for human, `<Badge>KI</Badge>` for AI
     - Bottom row: `Sitz #${seatNumber}`, `<DisciplineBadge level={disciplineLevel} />`
   - Sort: Human seats first, then by seatNumber

5. **Empty state**: "Noch keine Abgeordneten vorhanden." shown when roster is empty

6. **Loading state**: `<Skeleton>` grid (6 cards) via `useApiData` loading state

### Data fetching

```typescript
const { data: roster, loading: rosterLoading } = useApiData(
  () => getRoster(selectedParty === "all" ? undefined : selectedParty),
  { deps: [selectedParty] }
);
const { data: parties } = useApiData(getParties);
```

### Filtering logic

```typescript
const filtered = useMemo(() => {
  if (!roster) return [];
  let result = roster;
  if (humanOnly) result = result.filter(s => s.controller === "human" && s.userId);
  return result.sort((a, b) => {
    // Human occupied first, then human vacant, then AI
    const rank = (s: RosterSeat) =>
      s.controller === "human" && s.userId ? 0 :
      s.controller === "human" ? 1 : 2;
    return rank(a) - rank(b) || a.seatNumber - b.seatNumber;
  });
}, [roster, humanOnly]);
```

---

## Step 4: MdB Profile Page (/mdb/:seatId)

File: `packages/web/src/pages/MdbDetail.tsx` (NEW)

### Component structure

```typescript
import { useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MdbBadge, DisciplineBadge } from "@/components/MdbBadge";
import { VoteBar } from "@/components/VoteBar";
import { useApiData } from "@/hooks/useApiData";
import { getMdbProfile } from "@/api/endpoints";
import type { MdbProfile, MdbVoteDetail, MdbSpeechDetail } from "@/api/types";
import { STATUS_BADGE, VOTE_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
```

### Sections (vertical layout, not tabs, for simplicity)

#### 4.1 Header section
- Large avatar (64px) with party color ring, or party-colored initials circle
- Display name (h1) or "KI-Abgeordnete/r #{seatNumber}"
- Party name as colored badge (inline `style={{ backgroundColor: partyColor }}`)
- Seat number: "Sitz Nr. {seatNumber}"
- MdB badge + Discipline badge
- Controller indicator: "Spieler" or "KI-gesteuert"
- Link back: `<Link to="/mdb">Alle Abgeordneten</Link>`

#### 4.2 Abstimmungsbilanz (Vote summary card)
- `<VoteBar>` component showing `voteStats.yes / voteStats.no / voteStats.abstain / voteStats.total`
- Three stat boxes: "Ja: {yes}", "Nein: {no}", "Enthaltung: {abstain}"
- Participation rate: "{total} Abstimmungen"

#### 4.3 Abstimmungen (Voting history)
- Card with heading "Abstimmungen" and count badge
- Table or list of votes, each row showing:
  - Vote badge (Ja/Nein/Enthaltung) with `VOTE_COLORS` styling
  - Bill title as `<Link to={/bills/${vote.billId}}>` 
  - Bill category as small badge
  - Bill status badge using `STATUS_BADGE`
- Empty state: "Noch keine Abstimmungen." for AI or new MdBs
- Show most recent 20, with "Alle anzeigen" expand button

#### 4.4 Reden (Speeches)
- Card with heading "Reden" and count badge
- Each speech as a sub-card:
  - "{reading}. Lesung" badge
  - Bill title as link: `<Link to={/bills/${speech.billId}}>`
  - "Tag {dayNumber}" timestamp
  - Speech content (truncated to 300 chars with expand)
  - Sentiment impact if available: colored indicator
- Empty state: "Noch keine Reden gehalten."

#### 4.5 Bewerbung (Application, human seats only)
- Only shown if `profile.application` is not null
- Card with heading "Bewerbung"
- Application text in a blockquote style
- Policy focus tags as badges (parse JSON string)
- AI reasoning in a muted info box (if available)
- Applied on day / Approved on day

#### 4.6 404 handling
- If `getMdbProfile` returns 404, show "Abgeordnete/r nicht gefunden" with link back to `/mdb`

### Data fetching

```typescript
const { seatId } = useParams<{ seatId: string }>();
const { data: profile, loading } = useApiData(
  () => getMdbProfile(seatId!),
  { deps: [seatId] }
);
```

---

## Step 5: Route registration

File: `packages/web/src/main.tsx`

### 5.1 Add imports (top of file)

```typescript
import { MdbList } from "./pages/MdbList";
import { MdbDetail } from "./pages/MdbDetail";
```

### 5.2 Add routes (inside `<Routes>`, after the `/bills/:id` route)

```tsx
<Route path="/mdb" element={<MdbList />} />
<Route path="/mdb/:seatId" element={<MdbDetail />} />
```

---

## Step 6: Per-MdB votes on BillDetail

File: `packages/web/src/pages/BillDetail.tsx`

Currently, MdB votes on bills are shown only as party aggregates via `MdbVoteSummary.byParty`. To show individual MdB votes:

### 6.1 New API endpoint needed

File: `packages/api/src/routes/bills.ts` (or `seats.ts`)

Add endpoint to return individual MdB votes for a bill:

```
GET /api/bills/:billId/mdb-votes/individual
```

**SQL query** (cross-DB: mdb_votes in users.db, bundestag_seats in simulation.db):

```typescript
// In users.db:
const votes = userSqlite.prepare(
  "SELECT seat_id, user_id, vote FROM mdb_votes WHERE bill_id = ?"
).all(billId) as Array<{ seat_id: string; user_id: string; vote: string }>;

// In simulation.db, get seat info:
const seatIds = votes.map(v => v.seat_id);
// For each vote, look up seat's partyId and seatNumber
const enriched = votes.map(v => {
  const seat = sqlite.prepare(
    "SELECT seat_number, party_id FROM bundestag_seats WHERE id = ?"
  ).get(v.seat_id) as { seat_number: number; party_id: string } | undefined;
  // Get display name from users.db
  const user = userSqlite.prepare(
    "SELECT display_name FROM users WHERE id = ?"
  ).get(v.user_id) as { display_name: string } | undefined;
  return {
    seatId: v.seat_id,
    vote: v.vote,
    seatNumber: seat?.seat_number ?? 0,
    partyId: seat?.party_id ?? "",
    displayName: user?.display_name ?? null,
  };
});
```

**Response shape:**
```typescript
interface IndividualMdbVote {
  seatId: string;
  vote: "yes" | "no" | "abstain";
  seatNumber: number;
  partyId: string;
  displayName: string | null;
}
```

### 6.2 Frontend integration

In `BillDetail.tsx`, add a collapsible section "Einzelne MdB-Stimmen" below the existing party-aggregate vote bar. Each vote shown as a small chip/pill:
- Colored by vote (Ja=green, Nein=red, Enthaltung=gray from `VOTE_COLORS`)
- Display name or "Sitz #{seatNumber}" as label
- Each chip links to `/mdb/${seatId}`
- Group by party, show party header with party color

### 6.3 Web API client addition

File: `packages/web/src/api/endpoints.ts`

```typescript
export const getIndividualMdbVotes = (billId: string) =>
  fetchJson<IndividualMdbVote[]>(`/bills/${billId}/mdb-votes/individual`);
```

File: `packages/web/src/api/types.ts`

```typescript
export interface IndividualMdbVote {
  seatId: string;
  vote: "yes" | "no" | "abstain";
  seatNumber: number;
  partyId: string;
  displayName: string | null;
}
```

---

## Step 7: Navigation links

### 7.1 Add MdB link to nav

File: `packages/web/src/main.tsx`

Add "Abgeordnete" link in the Parlament dropdown group (desktop nav):

```tsx
<NavGroup label={t("nav.parlament")}>
  <DropdownLink to="/bills">{t("nav.bills")}</DropdownLink>
  <DropdownLink to="/mdb">{t("nav.mdb")}</DropdownLink>   {/* NEW */}
  <DropdownLink to="/motions">{t("nav.motions")}</DropdownLink>
  ...
</NavGroup>
```

Add to mobile nav as well:

```tsx
<MobileGroupLabel>{t("nav.parlament")}</MobileGroupLabel>
<MobileLink to="/bills">{t("nav.bills")}</MobileLink>
<MobileLink to="/mdb">{t("nav.mdb")}</MobileLink>   {/* NEW */}
<MobileLink to="/motions">{t("nav.motions")}</MobileLink>
```

### 7.2 i18n translation key

File: `packages/web/src/locales/index.ts` (or wherever translations are defined)

Add:
```typescript
"nav.mdb": "Abgeordnete",
```

### 7.3 Link from MdbRosterTable rows to /mdb/:seatId

File: wherever `MdbRosterTable` is defined (likely in `packages/web/src/pages/PartyDetail.tsx` or a component)

Currently, `MdbRosterTable` (used on `PartyDetail`) shows seats in a table. Update each row's display name / seat number cell to be a `<Link to={/mdb/${seat.id}}>`.

### 7.4 Link from vote displays to voter profiles

In `BillDetail.tsx`, wherever individual MdB votes are displayed (Step 6), each voter name/seat should link to `/mdb/${seatId}`.

### 7.5 Link from MdB badge in UserMenu

In the `UserMenu` component in `main.tsx`, the existing MdB badge could link to the user's own MdB profile page. When `seat` is available:

```tsx
<Link to={`/mdb/${seat.id}`} className="...">MdB</Link>
```

---

## Validation

### Typecheck

```bash
npm run typecheck
```

Must pass with zero errors after all changes.

### Manual testing steps

1. **Roster endpoint**: `curl http://localhost:3001/api/seats/roster` -- verify returns array of seats with displayName and avatarUrl fields
2. **Roster with filter**: `curl http://localhost:3001/api/seats/roster?partyId=spd` -- verify filters correctly
3. **Profile endpoint**: Pick a seat ID from roster response, `curl http://localhost:3001/api/seats/{seatId}` -- verify returns votes, speeches, voteStats, application fields
4. **Profile 404**: `curl http://localhost:3001/api/seats/nonexistent` -- verify 404 response
5. **MdB list page**: Navigate to `/mdb`, verify all seats render, party filter works, human-only toggle works
6. **MdB profile page**: Click any seat card, verify profile loads with all sections
7. **Bill votes**: Navigate to a bill in third_reading or passed status, verify individual MdB votes section appears
8. **Navigation**: Verify "Abgeordnete" appears in Parlament dropdown (desktop) and mobile menu
9. **Cross-links**: Verify links from MdbRosterTable on PartyDetail go to `/mdb/:seatId`
10. **Cross-links**: Verify links from vote chips on BillDetail go to `/mdb/:seatId`
11. **Empty states**: Test with AI-only seats (no votes/speeches) -- verify graceful empty states in German

### Database verification

```bash
# Check seats exist
sqlite3 -header -column data/simulation.db "SELECT id, seat_number, party_id, controller, user_id FROM bundestag_seats WHERE active = 1 LIMIT 10"

# Check MdB votes exist
sqlite3 -header -column data/users.db "SELECT id, seat_id, bill_id, vote FROM mdb_votes LIMIT 10"

# Check MdB speeches exist
sqlite3 -header -column data/users.db "SELECT id, user_id, bill_id, reading, day_number FROM mdb_speeches LIMIT 10"
```

---

## File change summary

| File | Action | Description |
|------|--------|-------------|
| `packages/api/src/routes/seats.ts` | MODIFY | Add `GET /api/seats/roster` and `GET /api/seats/:seatId` endpoints |
| `packages/api/src/routes/bills.ts` | MODIFY | Add `GET /api/bills/:billId/mdb-votes/individual` endpoint |
| `packages/web/src/api/types.ts` | MODIFY | Add `RosterSeat`, `MdbProfile`, `MdbVoteDetail`, `MdbSpeechDetail`, `MdbApprovedApplication`, `IndividualMdbVote` interfaces |
| `packages/web/src/api/endpoints.ts` | MODIFY | Add `getRoster`, `getMdbProfile`, `getIndividualMdbVotes` functions + update `api` object |
| `packages/web/src/pages/MdbList.tsx` | CREATE | MdB listing page with party filter and human-only toggle |
| `packages/web/src/pages/MdbDetail.tsx` | CREATE | MdB profile page with votes, speeches, application sections |
| `packages/web/src/pages/BillDetail.tsx` | MODIFY | Add collapsible individual MdB votes section |
| `packages/web/src/main.tsx` | MODIFY | Add route imports, `<Route>` entries, nav links in desktop + mobile menus |
| `packages/web/src/locales/index.ts` | MODIFY | Add `nav.mdb` translation key |
