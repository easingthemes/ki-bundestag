# Refactor Plan: Web — Page Decomposition

## TL;DR

Five large page files contain inline components, helper functions, and section logic that belong in their own files. Each page is decomposed into a layout/data-fetching shell that imports smaller focused components. Shared infrastructure from [02-web-shared.md](./02-web-shared.md) must be in place first.

## Pages to Decompose

| Page | Current Lines | Target Lines | Components to Extract |
|------|--------------|--------------|----------------------|
| [Dashboard.tsx](../../packages/web/src/pages/Dashboard.tsx) | 1105 | ~200 | 6 components |
| [PartyDetail.tsx](../../packages/web/src/pages/PartyDetail.tsx) | 898 | ~150 | 5 components |
| [Admin.tsx](../../packages/web/src/pages/Admin.tsx) | 805 | ~100 | 4 components |
| [Elections.tsx](../../packages/web/src/pages/Elections.tsx) | 667 | ~150 | 4 components |
| [BillDetail.tsx](../../packages/web/src/pages/BillDetail.tsx) | 629 | ~150 | 3 components |

---

## Dashboard.tsx

### Target structure

```
packages/web/src/
  pages/
    Dashboard.tsx             ← layout shell + data fetching only (~200L)
  components/
    dashboard/
      OnboardingOverlay.tsx   ← ~240L currently at Dashboard.tsx L25
      QuickActionsBar.tsx     ← currently at Dashboard.tsx L268
      MyImpactCard.tsx        ← currently at Dashboard.tsx L321
      CatchupCard.tsx         ← currently at Dashboard.tsx L383
      LiveEventTicker.tsx     ← currently at Dashboard.tsx L449
      AskPartyWidget.tsx      ← currently at Dashboard.tsx L1042
```

### Steps

1. Create `components/dashboard/OnboardingOverlay.tsx`
   - Props: `{ user, parties, onJoin, onDismiss }` (infer exact shape from current implementation)

2. Create `components/dashboard/QuickActionsBar.tsx`
   - Props: all data + callbacks it currently closes over

3. Create `components/dashboard/MyImpactCard.tsx`
   - Props: impact data object

4. Create `components/dashboard/CatchupCard.tsx`
   - Props: catchup data object

5. Create `components/dashboard/LiveEventTicker.tsx`
   - Props: events array + party map

6. Create `components/dashboard/AskPartyWidget.tsx`
   - Props: parties array + submit handler

7. Rewrite `Dashboard.tsx`
   - Keep: all `useApiData` / `useState` data-fetching logic
   - Keep: the top-level JSX layout grid
   - Remove: all 6 inline component definitions
   - Import all 6 from `../components/dashboard/`

---

## PartyDetail.tsx

### Target structure

```
packages/web/src/
  pages/
    PartyDetail.tsx           ← tab-switcher + data fetch shell (~150L)
  components/
    party/
      ApprovalChart.tsx       ← currently inline at PartyDetail.tsx L23
      PartyBillsList.tsx      ← bills tab content
      MdbRosterTable.tsx      ← MdB seat table with discipline/proxy display
      ProposalForm.tsx        ← internal proposal submission form
      QuestionForm.tsx        ← citizen question to party form
```

### Steps

1. Create `components/party/ApprovalChart.tsx`
   - Props: `{ history: PartyHistory[] }`
   - Contains: Highcharts/chart rendering logic

2. Create `components/party/PartyBillsList.tsx`
   - Props: `{ bills: Bill[] }`

3. Create `components/party/MdbRosterTable.tsx`
   - Props: `{ seats: MdbSeat[]; partyId: string }`
   - Uses existing `MdbBadge` and `DisciplineBadge` from [components/MdbBadge.tsx](../../packages/web/src/components/MdbBadge.tsx)

4. Create `components/party/ProposalForm.tsx`
   - Props: `{ partyId: string; user; onSubmitted: () => void }`

5. Create `components/party/QuestionForm.tsx`
   - Props: `{ partyId: string; onSubmitted: () => void }`

6. Rewrite `PartyDetail.tsx`
   - Keep: tab state, all data fetching
   - Remove: all 5 inline sections
   - Import all 5 components from `../components/party/`

---

## Admin.tsx

### Target structure

```
packages/web/src/
  pages/
    Admin.tsx                       ← state + layout shell (~100L)
  components/
    admin/
      PresetSelector.tsx            ← speed preset selector card
      InjectForms.tsx               ← all inject forms (crisis / election / shock / budget)
      ModelConfig.tsx               ← AI model display table
      ActionsReference.tsx          ← static ACTIONS data array + expandable reference table
```

### Steps

1. Create `components/admin/ActionsReference.tsx`
   - Move the full `ACTIONS` array (~200L) and `ACTION_CATEGORIES` constant
   - Renders the expandable action reference table
   - No props needed (static data)

2. Create `components/admin/InjectForms.tsx`
   - Props: `{ onInjected: () => void; isParticipatory: boolean }`
   - Contains all inject form sections: crisis, snap election, economic shock, budget trigger

3. Create `components/admin/ModelConfig.tsx`
   - No props (reads from static model config)
   - Renders the AI model config table

4. Create `components/admin/PresetSelector.tsx`
   - Props: `{ currentPreset: string; onApply: (preset: string) => void }`

5. Rewrite `Admin.tsx`
   - Keep: state for current preset, loading states
   - Import all 4 from `../components/admin/`
   - Target: ~100 lines

---

## Elections.tsx

### Target structure

```
packages/web/src/
  pages/
    Elections.tsx                   ← data fetch + layout shell (~150L)
  components/
    elections/
      CoalitionCalculator.tsx       ← currently at Elections.tsx L47 (~80L)
      VoteBarChart.tsx              ← currently at Elections.tsx L141 (~80L)
      CoalitionChips.tsx            ← currently at Elections.tsx L219
      BundesadlerIcon.tsx           ← currently at Elections.tsx L127
```

### Steps

1. Create `components/elections/BundesadlerIcon.tsx`
   - Pure SVG/icon component, no props needed

2. Create `components/elections/VoteBarChart.tsx`
   - Props: `{ parties: ...; results: ...; }` — infer from current implementation
   - Can use `VoteBar` from step in [02-web-shared.md](./02-web-shared.md) for the underlying bar if applicable

3. Create `components/elections/CoalitionChips.tsx`
   - Props: coalition and opposition party arrays

4. Create `components/elections/CoalitionCalculator.tsx`
   - Props: `{ parties: Party[]; totalSeats: number }`
   - Self-contained interactive calculator with its own local `useState`

5. Remove `fixColor` inline definition — now imported from `lib/utils.ts` (done in step 02)

6. Rewrite `Elections.tsx`
   - Keep: data fetching, tab/view state
   - Import all 4 from `../components/elections/`

---

## BillDetail.tsx

### Target structure

```
packages/web/src/
  pages/
    BillDetail.tsx                  ← tab-switcher + data fetch shell (~150L)
  components/
    bills/
      BillImpactDisplay.tsx         ← fmtImpact/fmtDelta helpers + impact card rendering
      MdbVoteButtons.tsx            ← third-reading direct Yes/No/Abstain vote UI
      SpeechDisplay.tsx             ← speech list per reading stage + MdB badge
      SpeechSubmitForm.tsx          ← speech submission form
```

### Steps

1. Create `components/bills/BillImpactDisplay.tsx`
   - Move `fmtImpact()` and `fmtDelta()` helper functions here
   - Props: `{ bill: Bill }`

2. Create `components/bills/MdbVoteButtons.tsx`
   - Props: `{ billId: string; userSeat; onVoted: () => void }`

3. Create `components/bills/SpeechDisplay.tsx`
   - Props: `{ speeches: Speech[]; stage: string }`

4. Create `components/bills/SpeechSubmitForm.tsx`
   - Props: `{ billId: string; stage: string; userSeat; onSubmitted: () => void }`

5. Rewrite `BillDetail.tsx`
   - Keep: tab state, all data fetches
   - Import all 4 from `../components/bills/`

---

## Verification

```bash
npm run typecheck
npm run dev:web
```

Manual checks:
- Dashboard loads with all sections visible and onboarding overlay functional
- Party detail tabs (bills, MdB roster, proposal form, question form) all work
- Admin inject forms submit correctly, preset selector applies
- Elections hemicycle, vote chart, coalition calculator all function
- Bill detail tabs (impact, votes, speeches, amendments) all work
