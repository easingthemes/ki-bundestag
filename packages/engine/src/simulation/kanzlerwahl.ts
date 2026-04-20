/**
 * Kanzlerwahl (Art. 63 GG) — 3-phase chancellor election, pure state machine.
 *
 *   Phase 1: Bundeskanzler-Kandidat from the coalition agreement stands for a
 *            Kanzlermehrheit vote (>= 368 seats).
 *   Phase 2: 14-day window (KANZLERWAHL_PHASE2_WINDOW_DAYS) for further absolute-
 *            majority rounds. Sim-cap at KANZLERWAHL_PHASE2_MAX_ROUNDS to prevent
 *            runaway rounds. Candidate picked per round from the next-largest
 *            untried party by seat count.
 *   Phase 3: Relative majority vote; per sub-decision Q3, the Bundespräsident
 *            appoints the plurality winner — always resolves, no dissolution.
 *
 * Cycle 2a PR 3 is the scaffold only — no loop wiring.
 */

import type {
  ChancellorCandidate,
  CoalitionAgreement,
  KanzlerwahlPhase,
  KanzlerwahlRound,
  KanzlerwahlState,
  Party,
} from "@ki-bundestag/types";
import { FRAKTION_LEADERS } from "../config/parties.js";
import {
  KANZLERWAHL_PHASE2_MAX_ROUNDS,
  KANZLERWAHL_PHASE2_WINDOW_DAYS,
  MAJORITY_SEATS,
} from "../config/elections.js";
import { tallyChancellorVote } from "./voting.js";

export interface PhaseRunOpts {
  /** Transform "earliest-possible Amtseid day" → "actual next Sitzungstag".
   *  Default is identity (every day is a Sitzungstag in the pure module);
   *  the loop passes a real `nextSitzungsTag(startDate)`-bound closure. */
  nextSitzungsTag?: (day: number) => number;
}

function generateId(): string {
  return "kw-" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function resolveInitialCandidate(
  agreement: CoalitionAgreement | null,
  coalition: string[],
): ChancellorCandidate {
  if (agreement?.chancellorCandidate) return agreement.chancellorCandidate;
  const partyId = coalition[0];
  return { partyId, name: FRAKTION_LEADERS[partyId] ?? "Unknown" };
}

function amtseidDayFrom(day: number, opts?: PhaseRunOpts): number {
  const nextSitzungsTag = opts?.nextSitzungsTag ?? ((d: number) => d);
  return nextSitzungsTag(day + 1);
}

function makeRound(
  phase: KanzlerwahlPhase,
  day: number,
  candidate: ChancellorCandidate,
  yes: number,
  no: number,
  abstain: number,
  required: number,
  outcome: KanzlerwahlRound["outcome"],
): KanzlerwahlRound {
  return {
    phase,
    day,
    candidatePartyId: candidate.partyId,
    candidateName: candidate.name,
    votesYes: yes,
    votesNo: no,
    votesAbstain: abstain,
    required,
    outcome,
  };
}

/**
 * Kick off a new Kanzlerwahl with the Phase-1 candidate stored as a pending
 * round. The caller then runs runPhase1() on the actual election day (KS day
 * or later).
 */
export function startKanzlerwahl(
  electionId: string,
  agreement: CoalitionAgreement | null,
  coalition: string[],
  _allParties: Party[],
  day: number,
): KanzlerwahlState {
  const candidate = resolveInitialCandidate(agreement, coalition);
  return {
    id: generateId(),
    electionId,
    startedOnDay: day,
    phase1: makeRound(1, day, candidate, 0, 0, 0, MAJORITY_SEATS, "pending"),
    phase2Rounds: [],
    phase2WindowEndDay: null,
    phase3: null,
    status: "phase1",
    electedCandidatePartyId: null,
    electedCandidateName: null,
    amtseidDay: null,
  };
}

/**
 * Tally Phase 1. On pass → elected + amtseidDay set. On fail → transition to
 * Phase 2 with a 14-day window.
 */
export function runPhase1(
  state: KanzlerwahlState,
  allParties: Party[],
  coalitionParties: string[],
  day: number,
  opts?: PhaseRunOpts,
): KanzlerwahlState {
  const pending = state.phase1;
  if (!pending) {
    throw new Error("runPhase1: state.phase1 is null — did you call startKanzlerwahl?");
  }
  const candidate: ChancellorCandidate = {
    partyId: pending.candidatePartyId,
    name: pending.candidateName,
  };
  const tally = tallyChancellorVote(candidate.partyId, allParties, coalitionParties, "absolute");
  const outcome: KanzlerwahlRound["outcome"] = tally.passed ? "elected" : "failed";
  const phase1 = makeRound(1, day, candidate, tally.yes, tally.no, tally.abstain, MAJORITY_SEATS, outcome);

  if (tally.passed) {
    return {
      ...state,
      phase1,
      status: "elected",
      electedCandidatePartyId: candidate.partyId,
      electedCandidateName: candidate.name,
      amtseidDay: amtseidDayFrom(day, opts),
    };
  }
  return {
    ...state,
    phase1,
    status: "phase2",
    phase2WindowEndDay: day + KANZLERWAHL_PHASE2_WINDOW_DAYS,
  };
}

function pickPhase2Candidate(
  state: KanzlerwahlState,
  allParties: Party[],
): ChancellorCandidate | null {
  const tried = new Set<string>();
  if (state.phase1) tried.add(state.phase1.candidatePartyId);
  for (const r of state.phase2Rounds) tried.add(r.candidatePartyId);

  const sorted = [...allParties].sort((a, b) => b.seatCount - a.seatCount);
  for (const p of sorted) {
    if (!tried.has(p.id)) {
      return { partyId: p.id, name: FRAKTION_LEADERS[p.id] ?? p.name };
    }
  }
  return null;
}

/**
 * Run one Phase 2 absolute-majority round. Auto-transitions to Phase 3 when the
 * window closes or the round cap is hit.
 */
export function runPhase2Round(
  state: KanzlerwahlState,
  allParties: Party[],
  coalitionParties: string[],
  day: number,
  opts?: PhaseRunOpts,
): KanzlerwahlState {
  if (state.phase2WindowEndDay != null && day > state.phase2WindowEndDay) {
    return { ...state, status: "phase3" };
  }
  if (state.phase2Rounds.length >= KANZLERWAHL_PHASE2_MAX_ROUNDS) {
    return { ...state, status: "phase3" };
  }
  const candidate = pickPhase2Candidate(state, allParties);
  if (!candidate) {
    return { ...state, status: "phase3" };
  }
  const tally = tallyChancellorVote(candidate.partyId, allParties, coalitionParties, "absolute");
  const outcome: KanzlerwahlRound["outcome"] = tally.passed ? "elected" : "failed";
  const round = makeRound(2, day, candidate, tally.yes, tally.no, tally.abstain, MAJORITY_SEATS, outcome);
  const phase2Rounds = [...state.phase2Rounds, round];

  if (tally.passed) {
    return {
      ...state,
      phase2Rounds,
      status: "elected",
      electedCandidatePartyId: candidate.partyId,
      electedCandidateName: candidate.name,
      amtseidDay: amtseidDayFrom(day, opts),
    };
  }
  const nextStatus = phase2Rounds.length >= KANZLERWAHL_PHASE2_MAX_ROUNDS ? "phase3" : "phase2";
  return { ...state, phase2Rounds, status: nextStatus };
}

/**
 * Phase 3: Bundespräsident appoints the plurality winner (sub-decision Q3 —
 * no dissolution path until Bundespräsident modelling lands). Always elects.
 */
export function runPhase3(
  state: KanzlerwahlState,
  allParties: Party[],
  coalitionParties: string[],
  day: number,
  opts?: PhaseRunOpts,
): KanzlerwahlState {
  let candidate: ChancellorCandidate;
  if (state.phase2Rounds.length > 0) {
    const best = [...state.phase2Rounds].sort((a, b) => b.votesYes - a.votesYes)[0];
    candidate = { partyId: best.candidatePartyId, name: best.candidateName };
  } else {
    candidate = { partyId: coalitionParties[0], name: FRAKTION_LEADERS[coalitionParties[0]] ?? "Unknown" };
  }
  const tally = tallyChancellorVote(candidate.partyId, allParties, coalitionParties, "relative");
  const phase3 = makeRound(3, day, candidate, tally.yes, tally.no, tally.abstain, 0, "elected");
  return {
    ...state,
    phase3,
    status: "elected",
    electedCandidatePartyId: candidate.partyId,
    electedCandidateName: candidate.name,
    amtseidDay: amtseidDayFrom(day, opts),
  };
}
