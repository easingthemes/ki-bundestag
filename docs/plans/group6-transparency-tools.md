# Group 6: Transparency & Matching Tools

> Detailed implementation plan
> Parent: docs/plans/abgeordnetenwatch-feature-roadmap.md
> Status: Not started
> Priority: Lowest (Group 6 of 6)

## Overview

Lower-priority features inspired by abgeordnetenwatch.de's Kandidierendencheck and transparency research tools. The quiz feature (Step 1) is the most concrete and self-contained; Steps 2 and 3 are lighter sketches for future expansion.

**Critical constraint — Sim time vs real time**: The quiz party positions must derive **primarily from the simulation's own voting history and stated positions**, with real-world `party_position` data from abgeordnetenwatch used ONLY as a seed for the initial state (before the simulation has enough bills to establish patterns). As the simulation progresses, party positions may diverge significantly from reality — the quiz should reflect the simulation's political landscape, not the real world. Lobbying events and donations (Steps 2-3) are purely simulation-internal and have no real-world constraint issues.

---

## Step 1: "Welche Partei passt zu dir?" Quiz (`/quiz`)

An interactive policy-matching quiz that compares user positions against simulated party voting behavior. Inspired by abgeordnetenwatch's Kandidierendencheck and the Wahl-O-Mat format.

### 1.1 Thesis Data Model

**New table** in `packages/engine/src/db/schema-sim.ts`:

```ts
export const quizTheses = sqliteTable("quiz_theses", {
  id: text("id").primaryKey(),                          // e.g. "thesis-001"
  text: text("text").notNull(),                         // "Der Mindestlohn sollte auf 15 Euro angehoben werden."
  category: text("category").notNull(),                 // BillCategory value
  generatedOnDay: integer("generated_on_day").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const quizPartyPositions = sqliteTable("quiz_party_positions", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id").notNull().references(() => quizTheses.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  position: text("position").notNull(),                 // "agree" | "disagree" | "neutral"
  reasoning: text("reasoning"),                         // short explanation (AI-generated)
});
```

**DDL** added to `packages/engine/src/db/ddl.ts` (two new CREATE TABLE statements).

**Migration** added to `packages/engine/src/db/migrate.ts`.

**12-15 theses** covering all 8 `BillCategory` values:

| # | Category | Example thesis (German) |
|---|----------|------------------------|
| 1 | economy | "Der Mindestlohn sollte auf 15 Euro angehoben werden." |
| 2 | economy | "Unternehmenssteuern sollten gesenkt werden, um Investitionen zu foerdern." |
| 3 | social | "Das Buergergeld sollte deutlich erhoeht werden." |
| 4 | social | "Gleichgeschlechtliche Paare sollten bei Adoptionen gleichgestellt werden." |
| 5 | environment | "Deutschland sollte bis 2035 vollstaendig aus der Kohle aussteigen." |
| 6 | environment | "Tempolimit von 130 km/h auf Autobahnen." |
| 7 | immigration | "Deutschland sollte mehr Gefluechtete aufnehmen." |
| 8 | immigration | "Abschiebungen abgelehnter Asylbewerber sollten konsequenter durchgesetzt werden." |
| 9 | defense | "Die Bundeswehr sollte staerker finanziell ausgestattet werden." |
| 10 | education | "Studiengebuehren sollten bundesweit abgeschafft bleiben." |
| 11 | education | "Digitalisierung an Schulen sollte hoechste Prioritaet haben." |
| 12 | healthcare | "Cannabis sollte vollstaendig legalisiert werden." |
| 13 | healthcare | "Die Buergerversicherung sollte die private Krankenversicherung ersetzen." |
| 14 | infrastructure | "Der oeffentliche Nahverkehr sollte kostenlos sein." |
| 15 | infrastructure | "Der Ausbau von Autobahnen sollte Vorrang vor Schienenausbau haben." |

**Thesis generation approach** (two options, pick one):

- **Option A (static seed):** Hardcoded theses in `packages/engine/src/db/seed.ts`, party positions derived once from `real_world_knowledge` party_position entries via a one-time AI call during seed. **Note**: These seed positions become increasingly stale as the simulation diverges from reality. Acceptable for MVP.
- **Option B (dynamic, recommended for production):** New action in simulation loop generates fresh theses periodically (e.g. every 30 days) based on recent bill activity. **Party positions computed from actual simulation voting history** on bills in each category. This keeps the quiz aligned with the simulation's own political reality, not the real world. More complex but ensures the quiz remains accurate as the sim progresses.

Recommendation: Start with **Option A** for simplicity, but plan to migrate to **Option B** once the simulation has sufficient bill history (50+ bills). Option B is the correct long-term approach because it matches the simulation's actual political landscape rather than a potentially stale real-world snapshot.

### 1.2 Match Calculation Logic

**New file:** `packages/engine/src/simulation/quiz-match.ts`

```ts
export type QuizAnswer = "agree" | "disagree" | "neutral";

export interface QuizResult {
  partyId: string;
  matchPercent: number;       // 0-100
  categoryBreakdown: Record<BillCategory, number>; // per-category match %
  agreements: number;         // count of matching positions
  disagreements: number;
}

export function calculateMatch(
  userAnswers: Map<string, QuizAnswer>,     // thesisId -> answer
  partyPositions: Map<string, QuizAnswer>,  // thesisId -> party position
): { matchPercent: number; agreements: number; disagreements: number };
```

**Scoring algorithm:**
- agree-agree = +2, disagree-disagree = +2
- agree-neutral or disagree-neutral = +1
- neutral-neutral = +1
- agree-disagree = 0
- Max score = 2 * number of answered theses
- `matchPercent = (totalScore / maxScore) * 100`

Optional: User can mark theses as "besonders wichtig" (double weight) — a Wahl-O-Mat feature. Deferred to v2.

### 1.3 API Endpoints

**New router:** `packages/api/src/routes/quiz.ts`

Registered in `packages/api/src/index.ts` as `app.use("/api/quiz", quizRouter)`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/quiz/theses` | No | Return all active theses (id, text, category) |
| POST | `/api/quiz/results` | No | Body: `{ answers: Record<thesisId, "agree"\|"disagree"\|"neutral"> }` — returns match results per party |
| GET | `/api/quiz/party-positions` | No | Return party positions (for results page explanation) |

**Response shape for POST `/api/quiz/results`:**

```json
{
  "results": [
    {
      "partyId": "spd",
      "partyName": "SPD",
      "color": "#E3000F",
      "matchPercent": 78,
      "categoryBreakdown": {
        "economy": 66,
        "social": 100,
        "environment": 75
      },
      "agreements": 9,
      "disagreements": 2
    }
  ]
}
```

### 1.4 Web Client

**New API functions** in `packages/web/src/api/index.ts`:

```ts
getQuizTheses(): Promise<QuizThesis[]>
submitQuizAnswers(answers: Record<string, string>): Promise<QuizResult[]>
getQuizPartyPositions(): Promise<QuizPartyPosition[]>
```

**New types** in `packages/web/src/api/index.ts` (local frontend copies per project convention):

```ts
interface QuizThesis { id: string; text: string; category: string; }
interface QuizResult { partyId: string; partyName: string; color: string; matchPercent: number; categoryBreakdown: Record<string, number>; agreements: number; disagreements: number; }
interface QuizPartyPosition { thesisId: string; partyId: string; position: string; reasoning: string | null; }
```

### 1.5 Quiz Page

**New file:** `packages/web/src/pages/Quiz.tsx`

**Route** added to `packages/web/src/main.tsx`:

```tsx
import { Quiz } from "./pages/Quiz";
// ...
<Route path="/quiz" element={<Quiz />} />
```

**Navigation:** Add "Partei-Check" link in the nav (likely under a "Mitmachen" or "Mehr" group).

**Page states:**

1. **Intro screen** — heading "Welche Partei passt zu dir?", short explanation, "Quiz starten" button.
2. **Thesis cards** — one thesis at a time, progress bar at top (e.g. "Frage 5 von 15"), three buttons: "Stimme zu" / "Neutral" / "Stimme nicht zu". Optional skip. Uses `Card` from shadcn/ui.
3. **Results screen** — sorted bar chart of match percentages per party, colored by `party.color` (inline style). Category breakdown as radar/spider chart or grouped horizontal bars. Per-thesis comparison table expandable below: "Deine Antwort vs. Partei-Position".

**Key components inside `Quiz.tsx`** (or split out if large):

- `QuizIntro` — intro card with start button
- `ThesisCard` — single thesis with answer buttons, progress indicator
- `QuizResults` — match visualization
- `ThesisComparison` — expandable per-thesis detail (user vs. party)

**UI patterns (per frontend.md):**

- Cards: `<Card><CardContent className="p-5">...</CardContent></Card>`
- Badges: `<Badge variant="outline">` for category labels
- Party colors: inline `style={{ backgroundColor: party.color }}` on bar segments
- Progress bar: simple flex div with dynamic width
- Use `cn()` for conditional classes, `useApiData` hook for data fetching

### 1.6 Files Changed Summary (Step 1)

| Action | File |
|--------|------|
| New | `packages/engine/src/db/schema-sim.ts` (add two tables) |
| Modify | `packages/engine/src/db/ddl.ts` (add DDL) |
| Modify | `packages/engine/src/db/migrate.ts` (migration) |
| Modify | `packages/engine/src/db/seed.ts` (seed theses + positions) |
| New | `packages/engine/src/simulation/quiz-match.ts` |
| Modify | `packages/engine/src/index.ts` (export quiz-match) |
| New | `packages/api/src/routes/quiz.ts` |
| Modify | `packages/api/src/index.ts` (register quiz router) |
| Modify | `packages/web/src/api/index.ts` (add quiz API functions + types) |
| New | `packages/web/src/pages/Quiz.tsx` |
| Modify | `packages/web/src/main.tsx` (add route + nav link) |

---

## Step 2: Lobbying Events (Simulation Enhancement)

Higher-level sketch. Adds a "Lobbyismus" dimension to the simulation.

### 2.1 Lobbying Event Type

- New `lobbyingEvents` table: `id, organizationName, sector, targetPartyId, targetBillId, influence ("support"|"oppose"), intensity (1-5), dayNumber`
- AI generates 0-2 lobbying events per simulation day as part of `runDay()` flow
- Lobbying events can nudge party vote probabilities on targeted bills (small modifier)
- Events appear in `simulation_events` with `type: "lobbying"`

### 2.2 Lobbying Transparency Page (`/lobbyismus`)

- New page listing lobbying events with filters by party, sector, bill
- Timeline visualization showing lobbying pressure on bills
- "Lobbyismus-Register" inspired by the real Bundestag lobby register

### 2.3 Files (sketch)

| Action | File |
|--------|------|
| Modify | `packages/engine/src/db/schema-sim.ts` (lobbyingEvents table) |
| Modify | `packages/engine/src/simulation/loop.ts` (generate events) |
| New | `packages/engine/src/simulation/lobbying.ts` |
| New | `packages/api/src/routes/parliament.ts` (add lobbying endpoints) |
| New | `packages/web/src/pages/Lobbying.tsx` |
| Modify | `packages/web/src/main.tsx` (route) |

---

## Step 3: Party Funding & Donation Simulation

Lightest sketch. Simulates Parteienfinanzierung transparency.

### 3.1 Donation Model

- New `partyDonations` table: `id, partyId, donorName, donorType ("individual"|"corporate"|"association"), amount, dayNumber, public (boolean)`
- Donations over a threshold automatically become public (mirrors real 10,000 EUR rule)
- Donation totals affect party campaign effectiveness during elections

### 3.2 Funding Transparency Dashboard (`/parteifinanzen`)

- Bar chart of total donations per party
- Top donors list
- Donation timeline
- Comparison with party approval ratings

### 3.3 Files (sketch)

| Action | File |
|--------|------|
| Modify | `packages/engine/src/db/schema-sim.ts` (partyDonations table) |
| New | `packages/engine/src/simulation/donations.ts` |
| Modify | `packages/engine/src/simulation/loop.ts` |
| New | `packages/web/src/pages/PartyFinance.tsx` |
| Modify | `packages/web/src/main.tsx` (route) |

---

## Validation

### Step 1 (Quiz)
- [ ] `npm run typecheck` passes with new schema, API route, and page
- [ ] `npm run migrate` applies quiz tables without error
- [ ] `npm run seed` populates theses and party positions
- [ ] GET `/api/quiz/theses` returns 12-15 theses
- [ ] POST `/api/quiz/results` with sample answers returns sorted match percentages
- [ ] Quiz page renders intro, thesis cards, and results without console errors
- [ ] Match percentages are plausible (e.g. left answers match SPD/Gruene/Linke higher)
- [ ] Party colors render correctly on result bars

### Steps 2-3 (deferred)
- Validate only when implemented; no blockers for Step 1

## Dependencies

- No hard dependency on other groups in the roadmap
- Step 1 benefits from `real_world_knowledge` party_position data (already populated by knowledge-fetch) for seeding accurate party positions
- Steps 2-3 benefit from Group 1 (MdB Profiles) being done, so lobbying/donations can link to individual politicians
