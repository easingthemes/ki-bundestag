// Bundestag size, majority threshold, and Fraktion threshold.
//
// MUST stay in lockstep with packages/engine/src/config/elections.ts. The web
// package has no workspace dep on engine (per CLAUDE.md), so these constants
// live here as a mirror. If the engine values ever change again, search for
// `BUNDESTAG_SIZE` / `MAJORITY_SEATS` / `FRAKTION_THRESHOLD` here AND grep for
// the literal numbers in `packages/web` before assuming the sweep is complete.
//
// Cycle 3 PR 3 changed these from 735 / 368 / 37 to:

export const BUNDESTAG_SIZE = 630;
export const MAJORITY_SEATS = 316;
export const FRAKTION_THRESHOLD = 32;
