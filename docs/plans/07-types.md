# Refactor Plan: Types Package Split

## TL;DR

[packages/types/src/index.ts](../../packages/types/src/index.ts) (623 lines) contains 60+ type definitions, interfaces, and type aliases in a single flat file with no grouping. This is the lowest-urgency refactor — the file is functional today — but splitting by domain makes it easier to navigate and extend. `index.ts` becomes a full re-export barrel so all cross-package consumers (`engine`, `api`) see zero changes.

## Current Single File

All of these currently live in `src/index.ts`:
- Economy & state: `EconomyState`, `NationalState`, `Crisis`, `Budget`
- Bills & parliament: `Bill`, `BillStatus`, `BillVote`, `Amendment`, `Motion`
- Elections & government: `Election`, `Government`, `Minister`, `ConfidenceVote`, `Fraktion`
- Parliament (other): `Interpellation`, `ConstitutionalChallenge`, `Poll`, `Referendum`, `CitizenQuestion`
- Parties: `Party`, `PolicyPriorities`
- Agent: `AgentAction` union + all 11 sub-interfaces, `AgentContext`, `AgentResponse`
- Meta: `SimulationMeta`

## Target Structure

```
packages/types/src/
  types/
    economy.ts        ← EconomyState, NationalState, Crisis, Budget
    bills.ts          ← Bill, BillStatus, BillVote, Amendment, Motion
    elections.ts      ← Election, Government, Minister, ConfidenceVote, Fraktion
    parliament.ts     ← Interpellation, ConstitutionalChallenge, Poll, Referendum, CitizenQuestion
    parties.ts        ← Party, PolicyPriorities
    agent.ts          ← AgentAction union + all 11 action sub-interfaces, AgentContext, AgentResponse
    meta.ts           ← SimulationMeta
  index.ts            ← re-exports everything from all 7 files (no new logic)
```

## Steps

1. Create `src/types/parties.ts`
   - Move `PolicyPriorities` interface
   - Move `Party` interface

2. Create `src/types/economy.ts`
   - Move `EconomyState` interface
   - Move `NationalState` interface
   - Move `Crisis` interface
   - Move `Budget` type/interface
   - Import `Party` from `./parties.js` if needed for cross-references

3. Create `src/types/bills.ts`
   - Move `BillStatus` type alias
   - Move `BillVote` interface
   - Move `Amendment` interface
   - Move `Bill` interface
   - Move `Motion` interface

4. Create `src/types/elections.ts`
   - Move `Election` interface
   - Move `Minister` interface
   - Move `Government` interface
   - Move `ConfidenceVote` interface
   - Move `Fraktion` interface

5. Create `src/types/parliament.ts`
   - Move `Interpellation` interface
   - Move `ConstitutionalChallenge` interface
   - Move `Poll` interface
   - Move `Referendum` interface
   - Move `CitizenQuestion` interface

6. Create `src/types/agent.ts`
   - Move `AgentContext` interface
   - Move `AgentResponse` interface
   - Move `AgentAction` discriminated union type
   - Move all 11 action sub-interfaces:
     `ProposeBillAction`, `AmendBillAction`, `VoteAction`, `IssueStatementAction`,
     `ProposeMotionAction`, `FileInterpellationAction`, `FileConstitutionalChallengeAction`,
     `FileConfidenceVoteAction`, `FileMisstrauensvotumAction`, `SpeakAction`, (+ any others)
   - May import bill/party types from sibling files for action payload types

7. Create `src/types/meta.ts`
   - Move `SimulationMeta` interface

8. Rewrite `src/index.ts`
   - Remove all type definitions
   - Add re-exports:
     ```typescript
     export * from "./types/parties.js";
     export * from "./types/economy.js";
     export * from "./types/bills.js";
     export * from "./types/elections.js";
     export * from "./types/parliament.js";
     export * from "./types/agent.js";
     export * from "./types/meta.js";
     ```
   - All existing consumers import from `@ki-bundestag/types` (resolved via `package.json` exports to `./src/index.ts`) — zero consumer changes needed

## Cross-reference Note

Some interfaces reference others (e.g., `Bill` may reference `BillVote`, `AgentContext` may reference `Party`). When splitting:
- Resolve import order: `parties.ts` → `bills.ts` → `elections.ts` → `agent.ts` (or use index barrel import where circular references are a risk)
- TypeScript handles cross-file type imports cleanly as long as there are no circular `value` dependencies (there aren't, since this is all types/interfaces)

## Verification

```bash
npm run typecheck    # all packages (engine, api, types itself) must pass
```

Since `index.ts` re-exports everything, no import paths change anywhere. The typecheck passing is the complete verification for this refactor.
