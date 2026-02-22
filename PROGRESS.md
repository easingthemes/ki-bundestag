# Progress: Types Package Split

**Goal**: Split `packages/types/src/index.ts` (623 lines, 60+ types) into 7 domain files under `src/types/`, keeping `index.ts` as a barrel re-export so all consumers see zero changes.

**Ref**: docs/plans/07-types.md

---

### Step 1: Create `src/types/parties.ts`

- **Status**: done
- **Files**: `packages/types/src/types/parties.ts` (created)
- **Result**: Moved PolicyPriorities, CoalitionRole, Party interfaces into dedicated file.

### Step 2: Create `src/types/economy.ts`

- **Status**: done
- **Files**: `packages/types/src/types/economy.ts` (created)
- **Result**: Moved EconomyState, NationalState, CrisisSeverity, CrisisCategory, Crisis, BudgetAllocations, BudgetVote, Budget; imports BillCategory+BillImpact from bills.js.

### Step 3: Create `src/types/bills.ts`

- **Status**: done
- **Files**: `packages/types/src/types/bills.ts` (created)
- **Result**: Moved BillCategory, BillStatus, CommitteeRecommendation, BillImpact, VoteChoice, BillVote, Amendment, Bill, MotionType, MotionStatus, Motion into dedicated file.

### Step 4: Create `src/types/elections.ts`

- **Status**: done
- **Files**: `packages/types/src/types/elections.ts` (created)
- **Result**: Moved MinistryPortfolio, Minister, Government, Election types, ConfidenceVote, Fraktion; imports BillVote from bills.js.

### Step 5: Create `src/types/parliament.ts`

- **Status**: done
- **Files**: `packages/types/src/types/parliament.ts` (created)
- **Result**: Moved Interpellation, ConstitutionalChallenge, Poll, CitizenQuestion, Referendum, MediaArticle, MdB types into dedicated file; imports BillImpact+VoteChoice from bills.js and MinistryPortfolio from elections.js.

### Step 6: Create `src/types/agent.ts`

- **Status**: done
- **Files**: `packages/types/src/types/agent.ts` (created)
- **Result**: Moved AgentContext, all action interfaces, AgentAction union, AgentResponse; imports from all sibling type files.

### Step 7: Create `src/types/meta.ts`

- **Status**: done
- **Files**: `packages/types/src/types/meta.ts` (created); `parties.ts` updated with InternalProposal
- **Result**: Moved SimulationEventType, SimulationEvent, SimulationMeta, PartyHistoryEntry, PendingInjection into meta.ts; added InternalProposal to parties.ts.

### Step 8: Rewrite `src/index.ts` as barrel re-export

- **Status**: done
- **Files**: `packages/types/src/index.ts` (rewritten)
- **Result**: index.ts now 7 lines of re-exports covering all 7 domain files. Typecheck passed across all 4 packages.
