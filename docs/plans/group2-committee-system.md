# Group 2: Committee System

> Detailed implementation plan
> Parent: [docs/plans/abgeordnetenwatch-feature-roadmap.md](./abgeordnetenwatch-feature-roadmap.md)
> Status: Not started

## Overview

Add real Bundestag committee infrastructure: a `committees` table seeded from abgeordnetenwatch API data, committee membership linking MdBs to committees, dedicated committee pages, and integration with existing bill pipeline and MdB profiles.

**Design constraint**: Committee names are structural data (stable across a legislative period), so they're safe to use directly from real-world API data. Committee membership is simulation-internal and generated algorithmically.

**Sim time constraint**: Committee names from abgeordnetenwatch are structural and rarely change — safe to use directly. Committee membership and bill assignments are purely simulation-internal. No sim time vs real time issues for this group.

---

## Step 1: Committee schema & migration

### 1.1 `committees` table (new, simulation DB)

**File**: `packages/engine/src/db/schema-sim.ts`

```typescript
export const committees = sqliteTable("committees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),           // e.g., "Verteidigung" from "Verteidigungsausschuss"
  billCategory: text("bill_category"),      // mapped BillCategory if applicable
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdOnDay: integer("created_on_day"),
});
```

### 1.2 `committee_memberships` table (new, simulation DB)

```typescript
export const committeeMemberships = sqliteTable("committee_memberships", {
  id: text("id").primaryKey(),
  committeeId: text("committee_id").notNull(),  // FK → committees
  seatId: text("seat_id").notNull(),            // FK → bundestagSeats
  role: text("role").notNull().default("member"), // "chair" | "deputy_chair" | "member"
  assignedOnDay: integer("assigned_on_day").notNull(),
});
```

### 1.3 DDL statements

**File**: `packages/engine/src/db/ddl.ts`

Add CREATE TABLE statements to the DDL array. Add to `SIM_COLUMN_MIGRATIONS` for index:

```sql
CREATE TABLE IF NOT EXISTS committees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  bill_category TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_on_day INTEGER
);

CREATE TABLE IF NOT EXISTS committee_memberships (
  id TEXT PRIMARY KEY,
  committee_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  assigned_on_day INTEGER NOT NULL,
  FOREIGN KEY (committee_id) REFERENCES committees(id),
  FOREIGN KEY (seat_id) REFERENCES bundestag_seats(id)
);

CREATE INDEX IF NOT EXISTS idx_committee_memberships_committee ON committee_memberships(committee_id);
CREATE INDEX IF NOT EXISTS idx_committee_memberships_seat ON committee_memberships(seat_id);
```

### 1.4 Export from schema barrel

**File**: `packages/engine/src/db/schema-sim.ts` — add to exports
**File**: `packages/engine/src/db/index.ts` — ensure re-exported

---

## Step 2: Committee seeding & membership assignment

### 2.1 Seed committees from stored names

**File**: `packages/engine/src/simulation/committees.ts`

New function `seedCommittees(currentDay)`:
- Read stored committee names via `getStoredCommitteeNames()`
- If no stored names, use `FALLBACK_MAP` values
- Deactivate old committees, insert new rows
- Map each committee to a `billCategory` where possible using `CATEGORY_KEYWORDS`
- Called from `loop.ts` after knowledge fetch, or after election seat allocation

```typescript
export function seedCommittees(currentDay: number): void {
  const db = getDb();
  const names = getStoredCommitteeNames();
  const committeeNames = names.length > 0 ? names : Object.values(FALLBACK_MAP);

  // Deactivate old
  getSqlite().prepare("UPDATE committees SET active = 0").run();

  for (const name of committeeNames) {
    const category = findCategoryForCommittee(name); // reverse CATEGORY_KEYWORDS lookup
    db.insert(schema.committees).values({
      id: genId(),
      name,
      shortName: extractShortName(name),
      billCategory: category,
      active: true,
      createdOnDay: currentDay,
    }).run();
  }
}
```

### 2.2 Assign MdBs to committees

New function `assignCommitteeMemberships(currentDay)`:
- Called after seat allocation (post-election)
- For each active committee:
  - Assign ~15-25 members proportional to party seat share
  - Pick 1 chair (from largest coalition party), 1 deputy chair (from opposition)
  - Fill remaining slots round-robin across parties
- Only assign active seats (both human and AI)

```typescript
export function assignCommitteeMemberships(currentDay: number): void {
  const db = getDb();
  const sqlite = getSqlite();

  // Clear old memberships
  sqlite.prepare("DELETE FROM committee_memberships").run();

  const activeCommittees = db.select().from(schema.committees)
    .where(eq(schema.committees.active, true)).all();
  const activeSeats = db.select().from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.active, true)).all();

  // Group seats by party
  const seatsByParty: Record<string, typeof activeSeats> = {};
  for (const seat of activeSeats) {
    (seatsByParty[seat.partyId] ??= []).push(seat);
  }

  const totalSeats = activeSeats.length;
  const COMMITTEE_SIZE = 20;

  for (const committee of activeCommittees) {
    const members: Array<{ seatId: string; role: string }> = [];

    // Proportional allocation per party
    for (const [partyId, seats] of Object.entries(seatsByParty)) {
      const share = Math.max(1, Math.round((seats.length / totalSeats) * COMMITTEE_SIZE));
      const shuffled = [...seats].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(share, shuffled.length); i++) {
        members.push({ seatId: shuffled[i].id, role: "member" });
      }
    }

    // Assign chair to first member, deputy to second (different party)
    if (members.length > 0) members[0].role = "chair";
    if (members.length > 1) {
      const chairSeat = activeSeats.find(s => s.id === members[0].seatId);
      const deputy = members.find((m, i) => i > 0 &&
        activeSeats.find(s => s.id === m.seatId)?.partyId !== chairSeat?.partyId);
      if (deputy) deputy.role = "deputy_chair";
    }

    // Insert memberships
    for (const m of members) {
      db.insert(schema.committeeMemberships).values({
        id: genId(),
        committeeId: committee.id,
        seatId: m.seatId,
        role: m.role,
        assignedOnDay: currentDay,
      }).run();
    }
  }
}
```

### 2.3 Update `assignCommittee()` to use committee IDs

Modify existing function to return committee ID instead of just name string, or look up committee row by name. Keep backward compatibility — `bill.committeeName` stays as string for display.

### 2.4 Integration in loop.ts

**File**: `packages/engine/src/simulation/loop.ts`

- After knowledge fetch (which stores committee names): call `seedCommittees(currentDay)` if committees table is empty or stale
- After `allocateSeats()` in election flow: call `assignCommitteeMemberships(currentDay)`

---

## Step 3: API endpoints

**File**: `packages/api/src/routes/parliament.ts`

### 3.1 `GET /api/parliament/committees`

Returns all active committees with bill counts and member counts.

```typescript
// Response shape
interface CommitteeListItem {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  billCount: number;         // bills currently in this committee
  memberCount: number;       // committee membership count
}

router.get("/committees", (req, res) => {
  const committees = db.select().from(schema.committees)
    .where(eq(schema.committees.active, true)).all();

  const result = committees.map(c => {
    const billCount = db.select({ count: sql`count(*)` })
      .from(schema.bills)
      .where(and(
        eq(schema.bills.committeeName, c.name),
        eq(schema.bills.status, "committee"),
      )).all()[0]?.count ?? 0;

    const memberCount = db.select({ count: sql`count(*)` })
      .from(schema.committeeMemberships)
      .where(eq(schema.committeeMemberships.committeeId, c.id))
      .all()[0]?.count ?? 0;

    return { ...c, billCount, memberCount };
  });

  res.json(result);
});
```

### 3.2 `GET /api/parliament/committees/:id`

Returns committee detail with bills, members, and recommendation stats.

```typescript
interface CommitteeDetail {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  bills: Array<{
    id: string;
    title: string;
    status: string;
    proposedBy: string;
    committeeRecommendation: string | null;
  }>;
  members: Array<{
    seatId: string;
    seatNumber: number;
    partyId: string;
    role: string;
    displayName: string | null;  // from users table if human
    controller: string;
  }>;
  stats: {
    totalBillsReviewed: number;
    passCount: number;
    rejectCount: number;
    amendCount: number;
  };
}
```

---

## Step 4: Web types & API client

### 4.1 Types

**File**: `packages/web/src/api/types.ts`

```typescript
export interface CommitteeListItem {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  billCount: number;
  memberCount: number;
}

export interface CommitteeMember {
  seatId: string;
  seatNumber: number;
  partyId: string;
  role: "chair" | "deputy_chair" | "member";
  displayName: string | null;
  controller: "human" | "ai";
}

export interface CommitteeDetail {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  bills: Array<{
    id: string;
    title: string;
    status: string;
    proposedBy: string;
    committeeRecommendation: string | null;
  }>;
  members: CommitteeMember[];
  stats: {
    totalBillsReviewed: number;
    passCount: number;
    rejectCount: number;
    amendCount: number;
  };
}
```

### 4.2 API client functions

**File**: `packages/web/src/api/endpoints.ts`

```typescript
export const getCommittees = () =>
  fetchJson<CommitteeListItem[]>("/parliament/committees");

export const getCommitteeDetail = (id: string) =>
  fetchJson<CommitteeDetail>(`/parliament/committees/${id}`);
```

---

## Step 5: Committee Listing Page (`/committees`)

**File**: `packages/web/src/pages/Committees.tsx` (NEW)

### Layout:
- Page title: "Ausschüsse des Bundestages"
- Grid of committee cards (responsive: 1 col mobile, 2 col tablet, 3 col desktop)
- Each card shows:
  - Committee name (bold)
  - Bill category badge (if mapped)
  - "X Gesetzentwürfe in Beratung" (bill count)
  - "X Mitglieder" (member count)
  - Click → `/committees/:id`

### Empty state:
- "Keine Ausschüsse vorhanden. Ausschüsse werden nach der nächsten Wahl eingerichtet."

---

## Step 6: Committee Detail Page (`/committees/:id`)

**File**: `packages/web/src/pages/CommitteeDetail.tsx` (NEW)

### Sections:

**Header**: Committee name, bill category badge

**Tab 1 — Gesetzentwürfe** (Bills):
- Table: Title | Status | Vorgeschlagen von | Empfehlung
- Link bill titles to `/bills/:id`
- Recommendation badges: Annahme (green), Änderung (yellow), Ablehnung (red)

**Tab 2 — Mitglieder** (Members):
- Table: Sitz # | Name | Partei | Rolle
- Role badges: Vorsitz (chair), Stv. Vorsitz (deputy), Mitglied
- Link names to `/mdb/:seatId` (requires Group 1)
- Party color indicators

**Tab 3 — Statistik** (Stats):
- Pie/bar chart: pass vs amend vs reject recommendations
- Total bills reviewed count

---

## Step 7: Integration with existing pages

### 7.1 BillDetail — link committee name

**File**: `packages/web/src/pages/BillDetail.tsx`

Where `bill.committeeName` is displayed, make it a link to the committee page:
```jsx
<Link to={`/committees/${committeeId}`}>{bill.committeeName}</Link>
```

Requires looking up committee ID by name (add to bill API response or do client-side lookup).

### 7.2 MdB profiles — show committee memberships

**Dependency**: Group 1 (MdB profile page)

On MdB profile, add "Ausschüsse" section showing which committees this MdB serves on:
- Query `committee_memberships` by `seatId`
- Show committee name + role badge
- Link to committee page

### 7.3 Dashboard — committee activity widget (optional)

If committees have active bills, show a small "Ausschussarbeit" section on dashboard.

---

## Step 8: Route registration & navigation

### 8.1 Routes

**File**: `packages/web/src/main.tsx`

```typescript
import Committees from "./pages/Committees";
import CommitteeDetail from "./pages/CommitteeDetail";

// Inside route config, under Parlament group:
{ path: "committees", element: <Committees /> },
{ path: "committees/:id", element: <CommitteeDetail /> },
```

### 8.2 Navigation

**File**: `packages/web/src/main.tsx` (nav section)

Add under "Parlament" group:
```jsx
<DropdownLink to="/committees">{t("nav.committees")}</DropdownLink>
```

### 8.3 i18n

**File**: `packages/web/src/locales/de.json`

```json
{
  "nav.committees": "Ausschüsse",
  "committees.title": "Ausschüsse des Bundestages",
  "committees.billsInReview": "Gesetzentwürfe in Beratung",
  "committees.members": "Mitglieder",
  "committees.empty": "Keine Ausschüsse vorhanden.",
  "committees.bills": "Gesetzentwürfe",
  "committees.stats": "Statistik",
  "committees.role.chair": "Vorsitz",
  "committees.role.deputy_chair": "Stv. Vorsitz",
  "committees.role.member": "Mitglied",
  "committees.recommendation.pass": "Annahme",
  "committees.recommendation.amend": "Änderung",
  "committees.recommendation.reject": "Ablehnung"
}
```

---

## Validation

```bash
npm install
npx turbo run typecheck          # All 6 tasks pass
npm test                          # Existing tests still pass
npm run dev:api & npm run dev:web # Manual: navigate to /committees
```

### Manual test checklist:
- [ ] `/committees` shows committee list after simulation has run
- [ ] `/committees/:id` shows bills, members, stats
- [ ] Committee names come from abgeordnetenwatch when available
- [ ] Fallback committee names work when API data unavailable
- [ ] BillDetail links committee name to committee page
- [ ] Committee memberships assigned after election
- [ ] Proportional party representation in committees

---

## Files Summary

| File | Action |
|------|--------|
| `packages/engine/src/db/schema-sim.ts` | Add `committees`, `committeeMemberships` tables |
| `packages/engine/src/db/ddl.ts` | Add CREATE TABLE + indexes |
| `packages/engine/src/simulation/committees.ts` | Add `seedCommittees()`, `assignCommitteeMemberships()` |
| `packages/engine/src/simulation/index.ts` | Export new functions |
| `packages/engine/src/simulation/loop.ts` | Call seed/assign at appropriate points |
| `packages/api/src/routes/parliament.ts` | Add 2 endpoints |
| `packages/web/src/api/types.ts` | Add committee types |
| `packages/web/src/api/endpoints.ts` | Add 2 fetch functions |
| `packages/web/src/pages/Committees.tsx` | NEW — listing page |
| `packages/web/src/pages/CommitteeDetail.tsx` | NEW — detail page |
| `packages/web/src/pages/BillDetail.tsx` | Link committee name |
| `packages/web/src/main.tsx` | Add routes + nav |
| `packages/web/src/locales/de.json` | Add i18n strings |
