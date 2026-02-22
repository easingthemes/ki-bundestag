# Progress

## Goal

Decompose five large web page files (Dashboard, PartyDetail, Admin, Elections, BillDetail) into smaller focused components extracted into domain subfolders under `components/`.

## Ref

docs/plans/03-web-pages.md

## Steps

### Step 1: Extract Dashboard components

- **Status**: done
- **Files**: `src/components/dashboard/OnboardingOverlay.tsx`, `QuickActionsBar.tsx`, `MyImpactCard.tsx`, `CatchupCard.tsx`, `LiveEventTicker.tsx`, `AskPartyWidget.tsx`
- **Result**: Extracted 6 inline components from Dashboard.tsx into focused files under `components/dashboard/`. Typecheck pass.

### Step 2: Rewrite Dashboard.tsx shell

- **Status**: done
- **Files**: `src/pages/Dashboard.tsx`
- **Result**: Replaced 1110-line file with ~280-line shell that imports all 6 dashboard components. All imports from `@/components/dashboard/`. Typecheck pass.

### Step 3: Extract PartyDetail components

- **Status**: done
- **Files**: `src/components/party/ApprovalChart.tsx`, `PartyBillsList.tsx`, `MdbRosterTable.tsx`, `ProposalForm.tsx`, `QuestionForm.tsx`
- **Result**: Extracted 5 inline sections from PartyDetail.tsx into focused party components. Typecheck pass.

### Step 4: Rewrite PartyDetail.tsx shell

- **Status**: done
- **Files**: `src/pages/PartyDetail.tsx`
- **Result**: Replaced 950-line file with ~280-line shell that imports all 5 party components. Typecheck pass.

### Step 5: Extract Admin components

- **Status**: done
- **Files**: `src/components/admin/ActionsReference.tsx`, `InjectForms.tsx`, `ModelConfig.tsx`, `PresetSelector.tsx`
- **Result**: Extracted ACTIONS data, inject forms, model config table, and preset selector into focused admin components. Typecheck pass.

### Step 6: Rewrite Admin.tsx shell

- **Status**: done
- **Files**: `src/pages/Admin.tsx`
- **Result**: Replaced 800-line file with ~60-line shell importing all 4 admin components. Typecheck pass.

### Step 7: Extract Elections components

- **Status**: done
- **Files**: `src/components/elections/BundesadlerIcon.tsx`, `VoteBarChart.tsx`, `CoalitionChips.tsx`, `CoalitionCalculator.tsx`
- **Result**: Extracted 4 inline components from Elections.tsx into focused elections components. Typecheck pass.

### Step 8: Rewrite Elections.tsx shell

- **Status**: done
- **Files**: `src/pages/Elections.tsx`
- **Result**: Replaced 663-line file with ~250-line shell importing all 4 elections components. Removed local `fixColor` definition (now from lib/utils). Typecheck pass.

### Step 9: Extract BillDetail components

- **Status**: pending

### Step 10: Rewrite BillDetail.tsx shell

- **Status**: pending
