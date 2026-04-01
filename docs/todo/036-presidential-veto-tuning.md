# 036 — Presidential Veto Rate and Behavior Tuning

**Status**: done
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

- [x] Verify veto actually blocks bill implementation — confirmed: `loop.ts:1261` checks `!vetoed` before applying economic impact, `veto.ts` marks bill `rejected`
- [x] Reduce base probability to 1% (was 3%), bonus caps at +5% (was +13%) → effective range 1–6%
- [x] Veto events already tracked as `presidential_veto` simulation events and included in AI-generated daily summary
- [x] Veto count visible via `db-stats` workflow querying `simulation_events WHERE type = 'presidential_veto'`

## Affected Files

- `packages/engine/src/simulation/veto.ts`
- `packages/engine/src/simulation/bill-pipeline.ts`
