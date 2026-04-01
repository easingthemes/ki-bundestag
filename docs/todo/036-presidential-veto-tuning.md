# 036 — Presidential Veto Rate and Behavior Tuning

**Status**: open
**Area**: Engine / Simulation
**Priority**: Low

## Observation

Production logs show presidential vetoes appearing on Days 47-48, both targeting FDP-sponsored bills. While the veto system is working correctly (3-16% probability based on impact magnitude), it's worth monitoring whether:

- Veto rate is realistic for German politics (historically very rare — ~8 times since 1949)
- Vetoes disproportionately target smaller parties
- Veto impact on simulation dynamics is meaningful or just noise

## Current Implementation

- `veto.ts`: probability = 3% base + up to 13% bonus for high-impact bills
- Only applies to passed bills (after third reading)
- Creates a simulation event but doesn't actually block the bill (needs verification)

## Action Items

- [ ] Verify veto actually blocks bill implementation (check `bill-pipeline.ts`)
- [ ] Consider reducing base probability to 1-2% for more realism
- [ ] Track veto statistics via `db-stats` or `error-analysis` workflow
- [ ] Add veto count to the daily simulation summary

## Affected Files

- `packages/engine/src/simulation/veto.ts`
- `packages/engine/src/simulation/bill-pipeline.ts`
