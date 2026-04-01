# Group 4: Enhanced Voting Intelligence

> Detailed implementation plan for voting alignment analysis, real-vs-simulated comparison, and voting calibration in agent prompts.
> Parent: docs/plans/abgeordnetenwatch-feature-roadmap.md
> Status: Not started
> Depends on: #031 (abgeordnetenwatch API fetching) -- done
> Created: 2026-04-01

---

## Overview

The simulation already fetches real Bundestag poll data from abgeordnetenwatch (per-party vote breakdowns) and stores it in the `real_world_knowledge` table. Simulated bills accumulate per-party vote records in the `bills.votes` JSON field. An alignment endpoint (`GET /api/parties/alignment`) already exists but is basic and not surfaced in the UI.

**Critical constraint — Sim time vs real time**: Simulation days run much faster than real days. After a few sim weeks, the simulation's coalition, opposition, and political landscape may be completely different from reality. Real-world voting data is a **historical baseline** from the start of the simulation, NOT a live comparison. As the sim diverges, the comparison becomes a "how far has the simulation drifted from its starting point?" metric, not a correctness check. All UI and prompts must reflect this.

This plan adds three capabilities:
1. **Voting alignment matrix** -- party-to-party agreement percentages computed from simulation bill history, displayed as a heatmap widget. (Pure simulation data, no constraint issues.)
2. **Historical baseline comparison** -- store real-world voting patterns from abgeordnetenwatch as a one-time baseline snapshot and compare against simulation trends. Clearly labeled as "Ausgangslage" (starting point), NOT as "how things should be".
3. **Voting tendency seeding** -- use real voting patterns as initial behavioral tendency for party agents, but ONLY early in the simulation. As sim history grows, simulation's own voting history takes precedence.

---

## Step 1: Voting Alignment Calculation Module

**File**: `packages/engine/src/simulation/voting-analysis.ts`

### 1.1 Core Function: `calculateVotingAlignment`

```typescript
interface AlignmentMatrix {
  parties: Array<{ id: string; name: string; color: string }>;
  matrix: Record<string, Record<string, number | null>>;
  billCount: number;
  windowDays: number;
}

function calculateVotingAlignment(
  bills: Bill[],
  parties: Party[],
  windowDays?: number,  // optional: only count bills from last N sim days
): AlignmentMatrix
```

**Calculation logic**:
- For each pair of parties (A, B), iterate over all bills that have votes from both A and B.
- Count `agreed` (same vote: both yes, both no, or both abstain) and `total` (both voted).
- Agreement percentage = `Math.round((agreed / total) * 100)`.
- Return `null` if fewer than 3 shared votes (insufficient data), matching the existing `/api/parties/alignment` endpoint threshold.
- Self-pairs always return 100.
- Optional `windowDays` parameter filters bills to those with `proposedOnDay >= currentDay - windowDays`, enabling "last 30 days" vs "all time" views.

### 1.2 Core Function: `calculateVotingTendencies`

```typescript
interface PartyVotingTendency {
  partyId: string;
  totalBillsVoted: number;
  yesRate: number;      // 0-100
  noRate: number;       // 0-100
  abstainRate: number;  // 0-100
  governmentBillSupport: number;  // 0-100, % of govt bills voted yes
  oppositionBillSupport: number;  // 0-100, % of opposition bills voted yes
}

function calculateVotingTendencies(
  bills: Bill[],
  parties: Party[],
  coalitionParties: string[],
): PartyVotingTendency[]
```

**Calculation logic**:
- Per party, count total yes/no/abstain across all bills.
- Compute rates as percentages.
- Separately track support rates for government-originated bills (`isGovernmentBill === true` or `proposedBy` is in `coalitionParties`) vs opposition bills.

### 1.3 Export from Engine

Add exports to `packages/engine/src/index.ts`:
```typescript
export { calculateVotingAlignment, calculateVotingTendencies } from "./simulation/voting-analysis.js";
```

**Note**: These functions compute on-demand from bill data rather than storing in a separate table. The bill table already contains all necessary vote records, and the computation is O(parties^2 * bills) which is trivially fast for 6 parties and hundreds of bills.

---

## Step 2: Historical Baseline Data (Ausgangslage)

**Critical constraint**: This data represents a **one-time snapshot** of real Bundestag voting patterns captured at (or near) the start of the simulation. It is NOT a live comparison. As the simulation progresses, this baseline becomes increasingly historical — it shows "where parties started" rather than "where they should be". All labels, API responses, and UI must use terms like "Ausgangslage" (starting point) or "Historische Vergleichsbasis", NEVER "Realität" vs "Simulation".

### 2.1 New Knowledge Category: `voting_pattern`

**File**: `packages/engine/src/simulation/knowledge-fetch.ts`

Add a new `real_world_knowledge` category `"voting_pattern"` to store structured real-world voting data extracted from the abgeordnetenwatch poll breakdowns that are already fetched.

Currently, `fetchPollVoteBreakdown()` returns a human-readable string like `"SPD: 180 Ja, 0 Nein; CDU: 0 Ja, 196 Nein; ..."`. This string is appended to the poll detail text. The change:

1. **New function**: `buildVotingPatternDigest(breakdowns: string[])` -- takes the raw breakdown strings from the top 3 polls and produces a structured JSON digest:

```typescript
interface RealWorldVotingPattern {
  pollCount: number;
  pairwiseAgreement: Record<string, Record<string, number>>;  // party -> party -> % agreement
  partyDiscipline: Record<string, number>;  // party -> % voting unanimously
  capturedOnDay: number;  // sim day when this baseline was captured
}
```

2. **Calculation**: For each poll, determine each party's majority vote (yes/no/abstain based on plurality). Two parties "agree" on a poll if their majority votes match. Agreement % = polls where they agree / total polls.

3. **Storage**: Store as a single `real_world_knowledge` row with `category: "voting_pattern"`, `digest` containing the JSON string. **Only store once** — if a `voting_pattern` row already exists, do NOT replace it. The baseline is frozen at first capture. This prevents the comparison from "chasing" reality as the sim diverges.

### 2.2 Comparison Function

**File**: `packages/engine/src/simulation/voting-analysis.ts`

```typescript
interface VotingComparison {
  parties: Array<{ id: string; name: string; color: string }>;
  simulated: Record<string, Record<string, number | null>>;  // from calculateVotingAlignment
  baseline: Record<string, Record<string, number | null>>;   // frozen starting-point snapshot
  drift: Record<string, Record<string, number | null>>;      // sim - baseline (how far sim has drifted)
  baselineCapturedOnDay: number;                              // when the baseline was recorded
}

function compareVotingPatterns(
  bills: Bill[],
  parties: Party[],
): VotingComparison | null  // null if no baseline data available
```

**Logic**:
- Load the `voting_pattern` row from `real_world_knowledge` (frozen baseline).
- Compute simulated alignment via `calculateVotingAlignment`.
- For each party pair, compute drift = simulated% - baseline%.
- Return null if no baseline data exists.
- Include `baselineCapturedOnDay` so the UI can show "Ausgangslage vom Tag X".

### 2.3 Party Name Mapping

The abgeordnetenwatch API uses faction short names (e.g., "SPD", "CDU/CSU", "GRUNE", "FDP", "AfD", "DIE LINKE"). Map these to simulation party IDs:

```typescript
const FACTION_TO_PARTY_ID: Record<string, string> = {
  "SPD": "spd",
  "CDU/CSU": "cdu",
  "GRÜNE": "gruene",
  "Grüne": "gruene",
  "FDP": "fdp",
  "AfD": "afd",
  "DIE LINKE": "linke",
  "Die Linke": "linke",
  "BSW": null,  // no simulation equivalent, skip
};
```

Place this mapping in `voting-analysis.ts` since it bridges real and simulated data.

---

## Step 3: API Endpoints

**File**: `packages/api/src/routes/parties.ts`

### 3.1 Refactor Existing `/api/parties/alignment`

The existing endpoint (lines 62-92 of `parties.ts`) already computes a voting alignment matrix from bill data. Refactor it to use the new `calculateVotingAlignment()` function from the engine, replacing the inline computation. Add query parameter support:

```
GET /api/parties/alignment?window=30
```

- `window` (optional): number of simulation days to look back. Default: all time.

**Response shape** (unchanged, just computed by engine now):
```json
{
  "parties": [{ "id": "spd", "name": "SPD", "color": "#E3000F" }, ...],
  "matrix": { "spd": { "spd": 100, "cdu": 42, ... }, ... },
  "billCount": 87,
  "windowDays": null
}
```

### 3.2 New: `GET /api/parties/voting-comparison`

Returns baseline (starting-point snapshot) vs current simulated voting patterns.

**Response shape**:
```json
{
  "available": true,
  "parties": [{ "id": "spd", "name": "SPD", "color": "#E3000F" }, ...],
  "simulated": { "spd": { "cdu": 42, "gruene": 78, ... }, ... },
  "baseline": { "spd": { "cdu": 35, "gruene": 82, ... }, ... },
  "drift": { "spd": { "cdu": 7, "gruene": -4, ... }, ... },
  "baselinePollCount": 10,
  "baselineCapturedOnDay": 1
}
```

If no baseline data exists, return `{ "available": false }`.

### 3.3 New: `GET /api/parties/voting-tendencies`

Returns per-party voting behavior statistics.

**Response shape**:
```json
{
  "tendencies": [
    {
      "partyId": "spd",
      "totalBillsVoted": 54,
      "yesRate": 68,
      "noRate": 24,
      "abstainRate": 8,
      "governmentBillSupport": 92,
      "oppositionBillSupport": 31
    },
    ...
  ]
}
```

---

## Step 4: Voting Alignment Matrix Widget

**File**: `packages/web/src/components/VotingAlignmentMatrix.tsx`

### 4.1 Component Design

A heatmap grid showing party-to-party agreement percentages.

**Layout**:
- 6x6 grid with party names on both axes.
- Each cell shows the agreement percentage as a number.
- Cell background color interpolated from red (0%) through yellow (50%) to green (100%).
- Diagonal cells (self) shown in the party's own color at 100%.
- Cells with `null` (insufficient data) shown in gray with "--" text.

**Color scale** (CSS custom properties or inline styles):
```typescript
function alignmentColor(pct: number): string {
  // Red (0%) -> Yellow (50%) -> Green (100%)
  if (pct <= 50) {
    const ratio = pct / 50;
    const r = 220;
    const g = Math.round(50 + ratio * 170);
    const b = 50;
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const ratio = (pct - 50) / 50;
    const r = Math.round(220 - ratio * 170);
    const g = 200;
    const b = 50;
    return `rgb(${r}, ${g}, ${b})`;
  }
}
```

**Props**:
```typescript
interface VotingAlignmentMatrixProps {
  className?: string;
}
```

The component fetches data internally via `api.getAlignmentMatrix()`.

### 4.2 Responsive Behavior

- On desktop: full 6x6 grid with numbers.
- On mobile (< 640px): smaller cells, abbreviated party names (3 letters), smaller font.
- Use CSS Grid: `grid-template-columns: auto repeat(6, 1fr)`.

### 4.3 Integration Location

Add to the **Elections page** (`packages/web/src/pages/Elections.tsx`) as a new section below the hemicycle chart, since voting alignment is most contextually relevant alongside election results and coalition data.

Also add an optional compact version (3x3 showing top 3 most/least aligned pairs) to the **Dashboard** as a small card widget.

### 4.4 API Client Addition

**File**: `packages/web/src/api/index.ts`

```typescript
getAlignmentMatrix(window?: number): Promise<AlignmentMatrixResponse>
getVotingComparison(): Promise<VotingComparisonResponse>
getVotingTendencies(): Promise<VotingTendenciesResponse>
```

### 4.5 Type Definitions

**File**: `packages/web/src/api/types.ts` (or wherever the web package defines API response types)

Add `AlignmentMatrixResponse`, `VotingComparisonResponse`, `VotingTendenciesResponse` interfaces matching the API response shapes from Step 3.

---

## Step 5: Baseline Drift Comparison Widget

**File**: `packages/web/src/components/VotingComparisonChart.tsx`

### 5.1 Component Design

A side-by-side display of the frozen starting-point baseline and current simulated voting alignment for selected party pairs. This shows **how far the simulation has drifted from its initial conditions**, NOT a "correctness" comparison.

**Primary view**: Grouped bar chart (horizontal bars) showing the top 6 most interesting party pairs:
- For each pair, two bars: "Ausgangslage" (muted blue) and "Simulation aktuell" (amber/orange).
- Bar length = agreement percentage (0-100%).
- Pairs sorted by absolute drift (largest difference first) to highlight where the simulation has diverged most from its starting point.

**Header text**: "Wie hat sich das Abstimmungsverhalten seit Simulationsbeginn verändert?" (How has voting behavior changed since simulation start?)

**Subheader**: "Ausgangslage basiert auf Bundestag-Daten vom Tag {baselineCapturedOnDay}" (Baseline based on Bundestag data from day X)

**Implementation approach**: Use plain HTML/CSS bars (div with percentage width) rather than a charting library, consistent with the existing codebase which uses `VoteBar` and other custom bar components.

```typescript
interface VotingComparisonChartProps {
  className?: string;
}
```

### 5.2 Drift Indicator

Below each pair's bars, show a small drift label:
- `+7%` (green text) = parties have grown closer in the simulation.
- `-4%` (red text) = parties have grown apart in the simulation.
- `0%` (gray text) = unchanged.

### 5.3 Unavailable State

If `available: false` from the API, show an info card: "Keine Ausgangsdaten verfügbar. Abstimmungsdaten werden beim ersten Wissensabruf als Baseline gespeichert." (using `ALERT_STYLES.info` from `src/lib/colors.ts`).

### 5.4 Integration Location

Place on the **Elections page** below the VotingAlignmentMatrix, under a heading "Entwicklung seit Simulationsbeginn" (Development since simulation start). This keeps all voting analysis together.

---

## Step 6: Voting Tendency Seeding in Agent Prompts

**Critical constraint**: Real-world voting patterns are used ONLY as **initial behavioral tendencies** that **fade out** as the simulation builds its own history. After ~50 simulated bills, the simulation's own voting record is authoritative and the real-world seed becomes irrelevant. This prevents the sim from being permanently anchored to reality as it develops its own political dynamics.

**File**: `packages/engine/src/agent/prompt.ts`

### 6.1 Inject Voting Tendency Seed into Agent Context (Early Sim Only)

In `buildUserPrompt()`, add a new optional section when real-world voting pattern data is available **AND the simulation is still young** (fewer than 50 bills voted on). This gives each party agent initial behavioral guidance that fades naturally.

**New context section** (appended to the user prompt when conditions met):

```
ABSTIMMUNGSTENDENZEN (Ausgangslage):
Basierend auf historischen Bundestagsdaten tendiert Ihre Partei zu folgenden Übereinstimmungen:
- Mit CDU/CSU: 35% Übereinstimmung
- Mit Grüne: 82% Übereinstimmung
- Mit FDP: 45% Übereinstimmung
- Mit AfD: 12% Übereinstimmung
- Mit Die Linke: 58% Übereinstimmung
Diese Werte dienen als Orientierung. Ihre Abstimmungen sollten sich primär an der aktuellen Simulationslage orientieren.
```

### 6.2 Fade-Out Logic

**File**: `packages/engine/src/simulation/voting-analysis.ts`

```typescript
function getVotingCalibrationContext(partyId: string, totalBillsVoted: number): string | null
```

This function:
- Returns `null` if `totalBillsVoted >= 50` (simulation has enough own history).
- Returns `null` if no `voting_pattern` baseline exists in `real_world_knowledge`.
- Otherwise, loads the frozen baseline, parses the JSON digest.
- Formats the pairwise agreement data for the given `partyId` as a German-language string.
- Adds a softening note: "Diese Werte dienen als Orientierung" (These values serve as guidance).

The 50-bill threshold means the seed is active for roughly the first 1-2 simulation months (depending on bill frequency), then silently disappears. No configuration needed — the transition is natural.

### 6.3 Data Flow

1. `knowledge-fetch.ts` runs on first fetch. The `voting_pattern` category is stored once (Step 2) and frozen.
2. In `loop.ts`, when building agent prompts for each party, call the helper with the current total bill count:

```typescript
const totalBills = db.select({ count: sql`count(*)` }).from(schema.bills)
  .where(isNotNull(schema.bills.votes)).all()[0]?.count ?? 0;
const votingCalibration = getVotingCalibrationContext(partyId, totalBills);
```

3. In `buildUserPrompt()`, accept an optional `votingCalibration?: string` parameter and append it to the prompt if present.

### 6.3 Prompt Token Budget

The voting calibration section adds approximately 80-120 tokens per party prompt. At 6 parties per day, this is roughly 500-700 additional tokens/day, which is negligible relative to the existing prompt sizes (typically 2000-4000 tokens each). And it disappears entirely after ~50 bills.

### 6.4 Context Depth Gating

Only include voting calibration at `normal` and `high` context depth (not `low`). Check the `DepthConfig` from `getDepthConfig()`:

```typescript
const depth = getDepthConfig();
const votingCalibration = depth.contextDepth !== "low"
  ? getVotingCalibrationContext(partyId, totalBills)
  : null;
```

---

## Validation

### Automated Tests

**File**: `packages/engine/src/__tests__/voting-analysis.test.ts`

Test cases for `calculateVotingAlignment`:
- Two parties voting identically on all bills -> 100% alignment.
- Two parties voting opposite on all bills -> 0% alignment.
- Fewer than 3 shared votes -> returns `null`.
- Self-pair always 100%.
- Window filtering: only bills within the window are counted.
- Empty bills array -> all pairs null.

Test cases for `calculateVotingTendencies`:
- Party voting yes on all bills -> yesRate = 100.
- Government bill support calculation correctness.

Test cases for `compareVotingPatterns`:
- Returns null when no real-world data in DB.
- Correctly computes divergence = simulated - real.

### Manual Validation

1. Run `npm run seed && npm run simulate 10` to generate bill data.
2. Hit `GET /api/parties/alignment` and verify matrix values make sense (coalition partners should show higher agreement).
3. Hit `GET /api/parties/voting-comparison` -- likely `available: false` unless knowledge fetch has run.
4. Check the Elections page for the heatmap widget rendering.
5. Verify the alignment matrix is responsive at mobile widths.

### Performance

- Alignment calculation: O(P^2 * B) where P=6 parties and B=bills count. Even with 1000 bills, this is 36,000 comparisons -- sub-millisecond.
- No DB writes needed for alignment (computed on-demand).
- Real-world voting pattern is stored once per weekly fetch -- negligible DB overhead.
- API endpoints should respond in < 50ms.

---

## File Summary

| Action | File Path | Description |
|--------|-----------|-------------|
| New | `packages/engine/src/simulation/voting-analysis.ts` | Core alignment and comparison calculations |
| Modify | `packages/engine/src/index.ts` | Export new functions |
| Modify | `packages/engine/src/simulation/knowledge-fetch.ts` | Add `voting_pattern` category, `buildVotingPatternDigest()` |
| Modify | `packages/engine/src/agent/prompt.ts` | Add `votingCalibration` parameter to `buildUserPrompt()` |
| Modify | `packages/engine/src/simulation/loop.ts` | Pass voting calibration context to prompt builder |
| Modify | `packages/api/src/routes/parties.ts` | Refactor `/alignment`, add `/voting-comparison` and `/voting-tendencies` |
| New | `packages/web/src/components/VotingAlignmentMatrix.tsx` | Heatmap grid component |
| New | `packages/web/src/components/VotingComparisonChart.tsx` | Real vs simulated bar chart |
| Modify | `packages/web/src/pages/Elections.tsx` | Add both new widgets |
| Modify | `packages/web/src/pages/Dashboard.tsx` | Add compact alignment summary card |
| Modify | `packages/web/src/api/index.ts` | Add API client methods |
| Modify | `packages/web/src/api/types.ts` | Add response type interfaces |
| New | `packages/engine/src/__tests__/voting-analysis.test.ts` | Unit tests |

---

## Implementation Order

1. **Step 1** (engine: voting-analysis.ts) -- pure functions, no DB changes, testable immediately.
2. **Step 3.1** (API: refactor existing `/alignment`) -- swap inline logic for engine function.
3. **Step 4** (frontend: VotingAlignmentMatrix) -- can demo with existing data.
4. **Step 2** (engine: real-world voting pattern storage) -- extends knowledge-fetch.
5. **Step 3.2-3.3** (API: new endpoints) -- depends on Step 2 for comparison data.
6. **Step 5** (frontend: VotingComparisonChart) -- depends on Step 3.2.
7. **Step 6** (engine: prompt calibration) -- depends on Step 2, can be done in parallel with Steps 4-5.

Steps 1-3.1-4 form a self-contained deliverable (alignment heatmap from simulation data alone). Steps 2-3.2-5-6 form a second deliverable (real-world comparison and calibration).
