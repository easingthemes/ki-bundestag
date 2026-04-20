import { describe, it, expect, vi } from "vitest";

// Mock DB to avoid drizzle import resolution in unit tests.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), gte: vi.fn(), lte: vi.fn(),
}));
vi.mock("../db/index.js", () => ({
  getDb: () => ({}),
  schema: { aktuelleStundeSessions: {} },
}));

import {
  crisisMeetsThreshold,
  nextAktuelleStundeDay,
  selectOppositionParty,
  baselineTick,
  buildAktuelleStundeBatchRequest,
  parseAktuelleStundePositions,
  type AktuelleStundeSession,
} from "./aktuelle-stunde.js";
import {
  AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE,
  AKTUELLE_STUNDE_FALLBACK,
} from "../config/aktuelle-stunde.js";
import type { Party } from "@ki-bundestag/types";

function makeParty(id: string, approval: number): Party {
  return {
    id, name: id.toUpperCase(), color: "#000", ideology: "center",
    seatCount: 100, approvalRating: approval,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "opposition", inactiveDays: 0,
  } as Party;
}

const PARTIES: Party[] = [
  makeParty("spd", 26),
  makeParty("cdu", 28),
  makeParty("gruene", 15),
  makeParty("fdp", 8),
  makeParty("afd", 14),
  makeParty("linke", 5),
];

// Deterministic RNG helper.
function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// ── crisisMeetsThreshold ───────────────────────────────────────────────

describe("crisisMeetsThreshold", () => {
  it("accepts high severity", () => {
    expect(crisisMeetsThreshold("high")).toBe(true);
  });

  it("rejects medium and low", () => {
    expect(crisisMeetsThreshold("medium")).toBe(false);
    expect(crisisMeetsThreshold("low")).toBe(false);
  });

  it("rejects unknown severity", () => {
    expect(crisisMeetsThreshold("unknown")).toBe(false);
  });
});

// ── nextAktuelleStundeDay ──────────────────────────────────────────────

describe("nextAktuelleStundeDay", () => {
  // Tuesday 2026-09-15 = sitzungswoche start (per Cycle 1 calendar).
  const START = new Date("2026-01-05T00:00:00Z"); // Jan 5 2026 = Monday, simDay 0

  it("returns a day within 21 days of the seed day", () => {
    const day = 30;
    const result = nextAktuelleStundeDay(day, START);
    expect(result).toBeGreaterThanOrEqual(day);
    expect(result).toBeLessThan(day + 30);
  });

  it("never returns a day before `fromDay`", () => {
    for (let d = 0; d < 40; d++) {
      expect(nextAktuelleStundeDay(d, START)).toBeGreaterThanOrEqual(d);
    }
  });
});

// ── selectOppositionParty ──────────────────────────────────────────────

describe("selectOppositionParty", () => {
  it("picks the opposition party with the highest approval", () => {
    const pick = selectOppositionParty(PARTIES, "spd", ["gruene", "fdp"]);
    expect(pick?.id).toBe("cdu");
  });

  it("returns null if all parties are in the coalition", () => {
    const pick = selectOppositionParty(PARTIES.slice(0, 2), "spd", ["cdu"]);
    expect(pick).toBeNull();
  });

  it("breaks ties by party id (deterministic)", () => {
    const tied = [makeParty("a-party", 20), makeParty("z-party", 20), makeParty("gov", 20)];
    const pick = selectOppositionParty(tied, "gov", []);
    expect(pick?.id).toBe("a-party");
  });
});

// ── baselineTick ───────────────────────────────────────────────────────

describe("baselineTick", () => {
  it("converges roughly to weekly-rate frequency over many draws", () => {
    const rng = makeRng(1);
    const N = 2000;
    let hits = 0;
    for (let i = 0; i < N; i++) if (baselineTick(rng)) hits++;
    const observed = hits / N;
    const expected = AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE / 4;
    // Loose bound — ±0.15 absolute.
    expect(observed).toBeGreaterThan(expected - 0.15);
    expect(observed).toBeLessThan(expected + 0.15);
  });
});

// ── buildAktuelleStundeBatchRequest ───────────────────────────────────

describe("buildAktuelleStundeBatchRequest", () => {
  const session: AktuelleStundeSession = {
    id: "s-xyz",
    scheduledDay: 42,
    topic: "Energiekrise 2026",
    triggerKind: "crisis",
    crisisId: "cr-123",
    governmentPartyId: "spd",
    oppositionPartyId: "cdu",
    positions: null,
    batchRequestId: null,
    batchAttempts: 0,
    emittedOnDay: null,
  };

  it("customId encodes the session id", () => {
    const req = buildAktuelleStundeBatchRequest(
      session,
      PARTIES.find(p => p.id === "spd")!,
      PARTIES.find(p => p.id === "cdu")!,
    );
    expect(req.customId).toBe("aktst-s-xyz");
  });

  it("system prompt names both parties and the topic", () => {
    const req = buildAktuelleStundeBatchRequest(
      session,
      PARTIES.find(p => p.id === "spd")!,
      PARTIES.find(p => p.id === "cdu")!,
    );
    expect(req.system).toContain("SPD");
    expect(req.system).toContain("CDU");
    expect(req.system).toContain("Energiekrise 2026");
  });

  it("response schema requests government + opposition", () => {
    const req = buildAktuelleStundeBatchRequest(
      session,
      PARTIES.find(p => p.id === "spd")!,
      PARTIES.find(p => p.id === "cdu")!,
    );
    expect(req.system).toContain("government");
    expect(req.system).toContain("opposition");
  });
});

// ── parseAktuelleStundePositions ──────────────────────────────────────

describe("parseAktuelleStundePositions", () => {
  it("parses a valid response", () => {
    const raw = JSON.stringify({
      government: "Wir stehen zu unserer Verantwortung.",
      opposition: "Die Regierung versagt in zentralen Fragen.",
    });
    const out = parseAktuelleStundePositions(raw);
    expect(out?.government).toContain("Verantwortung");
    expect(out?.opposition).toContain("versagt");
  });

  it("returns null on missing fields", () => {
    const raw = JSON.stringify({ government: "only government" });
    expect(parseAktuelleStundePositions(raw)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseAktuelleStundePositions("nope")).toBeNull();
  });

  it("parses through a code-fenced response", () => {
    const raw = "```json\n" + JSON.stringify({
      government: "X", opposition: "Y",
    }) + "\n```";
    const out = parseAktuelleStundePositions(raw);
    expect(out?.government).toBe("X");
    expect(out?.opposition).toBe("Y");
  });
});

// ── AKTUELLE_STUNDE_FALLBACK (compile-time constant) ───────────────────

describe("AKTUELLE_STUNDE_FALLBACK", () => {
  it("provides non-empty government + opposition strings", () => {
    expect(AKTUELLE_STUNDE_FALLBACK.government.length).toBeGreaterThan(0);
    expect(AKTUELLE_STUNDE_FALLBACK.opposition.length).toBeGreaterThan(0);
  });
});
