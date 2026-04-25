import { describe, it, expect } from "vitest";
import type { CoalitionAgreement, KanzlerwahlState, Party } from "@ki-bundestag/types";
import {
  startKanzlerwahl,
  runPhase1,
  runPhase2Round,
  runPhase3,
} from "./kanzlerwahl.js";
import {
  KANZLERWAHL_PHASE2_MAX_ROUNDS,
  KANZLERWAHL_PHASE2_WINDOW_DAYS,
  MAJORITY_SEATS,
} from "../config/elections.js";

function makeParty(id: string, seatCount: number, role: Party["coalitionRole"] = "opposition"): Party {
  return {
    id,
    name: id.toUpperCase(),
    color: "#000",
    ideology: "x",
    seatCount,
    approvalRating: 20,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: role,
    memberCount: 0,
    inactiveDays: 0,
  };
}

const ELECTION_ID = "e1";

describe("startKanzlerwahl", () => {
  it("returns a fresh state with a pending Phase-1 round keyed to the agreement candidate", () => {
    const agreement: CoalitionAgreement = {
      parties: ["spd", "gruene"],
      keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "Olaf Scholz" },
    };
    const parties = [makeParty("spd", 200, "leader"), makeParty("gruene", 180, "junior")];
    const state = startKanzlerwahl(ELECTION_ID, agreement, ["spd", "gruene"], parties, 50);

    expect(state.electionId).toBe(ELECTION_ID);
    expect(state.startedOnDay).toBe(50);
    expect(state.status).toBe("phase1");
    expect(state.phase1?.outcome).toBe("pending");
    expect(state.phase1?.candidatePartyId).toBe("spd");
    expect(state.phase1?.candidateName).toBe("Olaf Scholz");
    expect(state.phase2Rounds).toEqual([]);
    expect(state.phase3).toBeNull();
    expect(state.amtseidDay).toBeNull();
    expect(state.electedCandidatePartyId).toBeNull();
  });

  it("falls back to FRAKTION_LEADERS when the agreement omits a chancellorCandidate", () => {
    const agreement: CoalitionAgreement = {
      parties: ["spd"], keyPolicies: [], summary: "", concessions: {},
    };
    const state = startKanzlerwahl(ELECTION_ID, agreement, ["spd"], [makeParty("spd", 400, "leader")], 10);
    expect(state.phase1?.candidatePartyId).toBe("spd");
    expect(state.phase1?.candidateName).toBe("Lars Klingbeil");  // FRAKTION_LEADERS.spd
  });

  it("accepts null agreement (algorithmic fallback coalition)", () => {
    const state = startKanzlerwahl(ELECTION_ID, null, ["cdu"], [makeParty("cdu", 400, "leader")], 0);
    expect(state.status).toBe("phase1");
    expect(state.phase1?.candidatePartyId).toBe("cdu");
    expect(state.phase1?.candidateName).toBe("Friedrich Merz");
  });
});

describe("runPhase1 — absolute majority", () => {
  function setup(yesSeats: number, agreement: CoalitionAgreement | null = null) {
    const parties = [
      makeParty("spd", yesSeats, "leader"),
      makeParty("cdu", 735 - yesSeats, "opposition"),
    ];
    const coalition = ["spd"];
    const state = startKanzlerwahl(ELECTION_ID, agreement ?? {
      parties: coalition, keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "Candidate A" },
    }, coalition, parties, 100);
    return { state, parties, coalition };
  }

  it("elects when the Phase-1 candidate reaches Kanzlermehrheit (>= MAJORITY_SEATS)", () => {
    const { state, parties, coalition } = setup(400);
    const result = runPhase1(state, parties, coalition, 101);
    expect(result.status).toBe("elected");
    expect(result.phase1?.outcome).toBe("elected");
    expect(result.phase1?.votesYes).toBe(400);
    expect(result.phase1?.required).toBe(MAJORITY_SEATS);
    expect(result.electedCandidatePartyId).toBe("spd");
    expect(result.electedCandidateName).toBe("Candidate A");
    expect(result.amtseidDay).toBe(102); // day + 1 via default nextWorkingDay
  });

  it("falls through to phase2 when Phase 1 fails (yes < MAJORITY_SEATS)", () => {
    const { state, parties, coalition } = setup(300);
    const result = runPhase1(state, parties, coalition, 101);
    expect(result.status).toBe("phase2");
    expect(result.phase1?.outcome).toBe("failed");
    expect(result.phase1?.votesYes).toBe(300);
    expect(result.phase2WindowEndDay).toBe(101 + KANZLERWAHL_PHASE2_WINDOW_DAYS);
    expect(result.electedCandidatePartyId).toBeNull();
    expect(result.amtseidDay).toBeNull();
  });

  it("uses an injected nextSitzungsTag when provided", () => {
    // amtseidDay = nextSitzungsTag(day + 1). With default identity this is
    // day + 1 (test above); with an injected transform (d) => d + 3 the
    // earliest Amtseid slides to day + 1 + 3 = day + 4.
    const { state, parties, coalition } = setup(400);
    const result = runPhase1(state, parties, coalition, 101, { nextSitzungsTag: (d) => d + 3 });
    expect(result.amtseidDay).toBe(105);
  });
});

describe("runPhase2Round — candidate iteration + window", () => {
  function makeParties(): Party[] {
    return [
      makeParty("spd", 300, "leader"),       // tried (and failed) in Phase 1
      makeParty("cdu", 200, "opposition"),   // biggest non-tried
      makeParty("gruene", 150, "opposition"),
      makeParty("fdp", 85, "opposition"),
    ];
  }

  it("picks the next-largest untried party as Phase 2 candidate", () => {
    const parties = makeParties();
    const coalition = ["spd"];
    let state = startKanzlerwahl(ELECTION_ID, {
      parties: coalition, keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "S1" },
    }, coalition, parties, 100);
    state = runPhase1(state, parties, coalition, 101);
    expect(state.status).toBe("phase2");  // 300 < MAJORITY_SEATS

    const r1 = runPhase2Round(state, parties, coalition, 105);
    expect(r1.phase2Rounds.length).toBe(1);
    expect(r1.phase2Rounds[0].candidatePartyId).toBe("cdu");  // largest untried
    expect(r1.phase2Rounds[0].outcome).toBe("failed");        // cdu alone doesn't hit MAJORITY_SEATS
  });

  it("elects a Phase-2 candidate with Kanzlermehrheit", () => {
    const parties = [
      makeParty("spd", 300, "leader"),
      makeParty("cdu", 400, "opposition"),   // commands absolute majority alone
    ];
    const coalition = ["spd"];
    let state = startKanzlerwahl(ELECTION_ID, {
      parties: coalition, keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "S1" },
    }, coalition, parties, 100);
    state = runPhase1(state, parties, coalition, 101);
    const r = runPhase2Round(state, parties, coalition, 105);
    expect(r.status).toBe("elected");
    expect(r.electedCandidatePartyId).toBe("cdu");
  });

  it("transitions to phase3 after KANZLERWAHL_PHASE2_MAX_ROUNDS failed rounds", () => {
    const parties = [
      makeParty("spd", 300, "leader"),
      makeParty("cdu", 150, "opposition"),
      makeParty("gruene", 150, "opposition"),
      makeParty("fdp", 70, "opposition"),
      makeParty("linke", 65, "opposition"),
    ];
    const coalition = ["spd"];
    let state = startKanzlerwahl(ELECTION_ID, {
      parties: coalition, keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "S1" },
    }, coalition, parties, 100);
    state = runPhase1(state, parties, coalition, 101);
    for (let i = 0; i < KANZLERWAHL_PHASE2_MAX_ROUNDS; i++) {
      state = runPhase2Round(state, parties, coalition, 105 + i);
    }
    expect(state.phase2Rounds.length).toBe(KANZLERWAHL_PHASE2_MAX_ROUNDS);
    expect(state.status).toBe("phase3");
  });

  it("transitions to phase3 when day exceeds phase2WindowEndDay", () => {
    const parties = [
      makeParty("spd", 300, "leader"),
      makeParty("cdu", 200, "opposition"),
    ];
    const coalition = ["spd"];
    let state = startKanzlerwahl(ELECTION_ID, {
      parties: coalition, keyPolicies: [], summary: "", concessions: {},
      chancellorCandidate: { partyId: "spd", name: "S1" },
    }, coalition, parties, 100);
    state = runPhase1(state, parties, coalition, 101);
    const beyond = state.phase2WindowEndDay! + 1;
    const r = runPhase2Round(state, parties, coalition, beyond);
    expect(r.status).toBe("phase3");
  });
});

describe("runPhase3 — always elects with relative majority", () => {
  it("picks the candidate with the highest Phase-2 yes count", () => {
    const parties = [
      makeParty("spd", 300, "leader"),
      makeParty("cdu", 200, "opposition"),
      makeParty("gruene", 150, "opposition"),
    ];
    const coalition = ["spd"];
    // Synthesise a phase3-ready state with 2 failed phase2 rounds.
    let state: KanzlerwahlState = {
      id: "kw-1",
      electionId: ELECTION_ID,
      startedOnDay: 100,
      phase1: { phase: 1, day: 101, candidatePartyId: "spd", candidateName: "S1",
        votesYes: 300, votesNo: 350, votesAbstain: 85, required: MAJORITY_SEATS, outcome: "failed" },
      phase2Rounds: [
        { phase: 2, day: 105, candidatePartyId: "cdu", candidateName: "C1",
          votesYes: 200, votesNo: 535, votesAbstain: 0, required: MAJORITY_SEATS, outcome: "failed" },
        { phase: 2, day: 108, candidatePartyId: "gruene", candidateName: "G1",
          votesYes: 150, votesNo: 585, votesAbstain: 0, required: MAJORITY_SEATS, outcome: "failed" },
      ],
      phase2WindowEndDay: 115,
      phase3: null,
      status: "phase3",
      electedCandidatePartyId: null,
      electedCandidateName: null,
      amtseidDay: null,
    };
    const r = runPhase3(state, parties, coalition, 120);
    expect(r.status).toBe("elected");
    expect(r.phase3?.outcome).toBe("elected");
    // CDU had the highest Phase 2 yes count (200 > 150).
    expect(r.electedCandidatePartyId).toBe("cdu");
    expect(r.amtseidDay).toBe(121);
  });

  it("falls back to the coalition leader when Phase 2 had zero rounds", () => {
    const parties = [makeParty("spd", 300, "leader"), makeParty("cdu", 435, "opposition")];
    const coalition = ["spd"];
    const state: KanzlerwahlState = {
      id: "kw-2",
      electionId: ELECTION_ID,
      startedOnDay: 100,
      phase1: { phase: 1, day: 101, candidatePartyId: "spd", candidateName: "S1",
        votesYes: 300, votesNo: 435, votesAbstain: 0, required: MAJORITY_SEATS, outcome: "failed" },
      phase2Rounds: [],
      phase2WindowEndDay: 115,
      phase3: null,
      status: "phase3",
      electedCandidatePartyId: null,
      electedCandidateName: null,
      amtseidDay: null,
    };
    const r = runPhase3(state, parties, coalition, 120);
    expect(r.status).toBe("elected");
    expect(r.electedCandidatePartyId).toBe("spd");
  });
});
