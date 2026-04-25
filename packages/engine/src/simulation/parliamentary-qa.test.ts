import { describe, it, expect, vi } from "vitest";

// Mock DB to prevent drizzle import resolution in unit tests.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({}),
  schema: { parliamentaryQaSessions: {} },
}));

import {
  pickQuestionsForSession,
  deriveMinisterPartyId,
  buildSession,
  buildSessionBatchRequest,
  parseSessionAnswers,
  applyAnswersToSession,
  questionsPerSession,
  type ParliamentaryQaSession,
} from "./parliamentary-qa.js";
import {
  MDB_QUESTION_POOL,
  MINISTRY_FALLBACK_PARTY,
  PARLIAMENTARY_QA_FALLBACK_ANSWER,
  REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION,
} from "../config/parliamentary-qa.js";
import type { Government, Minister, Party } from "@ki-bundestag/types";

// ── Fixtures ───────────────────────────────────────────────────────────

function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function makeParty(id: string, name: string): Party {
  return {
    id, name, color: "#000000", ideology: "center",
    seatCount: 100, approvalRating: 20,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "opposition", inactiveDays: 0,
  } as Party;
}

const PARTIES: Party[] = [
  { ...makeParty("spd", "SPD"), coalitionRole: "leader" } as Party,
  { ...makeParty("cdu", "CDU/CSU"), coalitionRole: "opposition" } as Party,
  { ...makeParty("gruene", "Grüne"), coalitionRole: "junior" } as Party,
  { ...makeParty("fdp", "FDP"), coalitionRole: "opposition" } as Party,
  { ...makeParty("afd", "AfD"), coalitionRole: "opposition" } as Party,
  { ...makeParty("linke", "Die Linke"), coalitionRole: "opposition" } as Party,
];

function makeGov(ministers: Minister[]): Government {
  return {
    id: "gov-test", electionId: "el-test",
    chancellorName: "Testkanzler*in", chancellorPartyId: "spd",
    ministers, formedOnDay: 0, dissolvedOnDay: null, active: true,
  };
}

// ── pickQuestionsForSession ────────────────────────────────────────────

describe("pickQuestionsForSession", () => {
  it("returns exactly `count` questions", () => {
    const rng = makeRng(42);
    const picked = pickQuestionsForSession(3, {}, rng);
    expect(picked).toHaveLength(3);
  });

  it("returns unique question ids", () => {
    const rng = makeRng(42);
    const picked = pickQuestionsForSession(5, {}, rng);
    const ids = new Set(picked.map(q => q.id));
    expect(ids.size).toBe(5);
  });

  it("respects excludeIds", () => {
    const rng = makeRng(42);
    const excluded = ["eco-1", "eco-2", "soc-1"];
    const picked = pickQuestionsForSession(3, { excludeIds: excluded }, rng);
    for (const q of picked) {
      expect(excluded).not.toContain(q.id);
    }
  });

  it("biases toward activeCategories (statistical — 100 draws)", () => {
    const rng = makeRng(100);
    let countInfra = 0;
    const N = 100;
    for (let i = 0; i < N; i++) {
      const picked = pickQuestionsForSession(2, { activeCategories: ["infrastructure"] }, rng);
      if (picked.some(q => q.category === "infrastructure")) countInfra++;
    }
    // Weighted 3x — expect significantly more than baseline (1/8 ≈ 23% of 100 draws
    // picking ≥1 infra in 2 tries). Assert loose lower bound to avoid flake.
    expect(countInfra).toBeGreaterThan(40);
  });

  it("handles degenerate case where exclude consumes all candidates", () => {
    const rng = makeRng(42);
    const allIds = MDB_QUESTION_POOL.map(q => q.id);
    const picked = pickQuestionsForSession(3, { excludeIds: allIds }, rng);
    expect(picked).toHaveLength(0);
  });
});

// ── deriveMinisterPartyId ──────────────────────────────────────────────

describe("deriveMinisterPartyId", () => {
  it("reads partyId from live cabinet when present", () => {
    const cabinet: Minister[] = [
      { name: "X", partyId: "gruene", portfolio: "environment" },
      { name: "Y", partyId: "spd", portfolio: "finance" },
    ];
    expect(deriveMinisterPartyId(cabinet, "environment")).toBe("gruene");
    expect(deriveMinisterPartyId(cabinet, "finance")).toBe("spd");
  });

  it("falls back to MINISTRY_FALLBACK_PARTY when cabinet is empty", () => {
    expect(deriveMinisterPartyId([], "health")).toBe(MINISTRY_FALLBACK_PARTY.health);
    expect(deriveMinisterPartyId(null, "defence")).toBe(MINISTRY_FALLBACK_PARTY.defence);
  });

  it("falls back when cabinet has no entry for that portfolio", () => {
    const cabinet: Minister[] = [{ name: "X", partyId: "gruene", portfolio: "environment" }];
    expect(deriveMinisterPartyId(cabinet, "finance")).toBe(MINISTRY_FALLBACK_PARTY.finance);
  });
});

// ── buildSession ───────────────────────────────────────────────────────

describe("buildSession", () => {
  const templates = MDB_QUESTION_POOL.slice(0, 2);

  it("produces a session with one question per template", () => {
    const rng = makeRng(1);
    const gov = makeGov([]);
    const session = buildSession("s1", "regierungsbefragung", 42, templates, gov, PARTIES, rng);
    expect(session.id).toBe("s1");
    expect(session.kind).toBe("regierungsbefragung");
    expect(session.day).toBe(42);
    expect(session.questions).toHaveLength(2);
    expect(session.questions.every(q => q.answer === null)).toBe(true);
    expect(session.answeredOnDay).toBeNull();
    expect(session.batchAttempts).toBe(0);
  });

  it("Regierungsbefragung askers come from opposition when cabinet is set", () => {
    const rng = makeRng(2);
    const gov = makeGov([
      { name: "X", partyId: "gruene", portfolio: "environment" },
      { name: "Y", partyId: "spd", portfolio: "finance" },
    ]);
    const session = buildSession("s1", "regierungsbefragung", 42, templates, gov, PARTIES, rng);
    const opposition = new Set(["cdu", "fdp", "afd", "linke"]);
    for (const q of session.questions) {
      expect(opposition.has(q.askingPartyId)).toBe(true);
    }
  });

  it("falls back to all parties when no government is set", () => {
    const rng = makeRng(3);
    const session = buildSession("s1", "regierungsbefragung", 42, templates, null, PARTIES, rng);
    const validIds = new Set(PARTIES.map(p => p.id));
    for (const q of session.questions) {
      expect(validIds.has(q.askingPartyId)).toBe(true);
    }
  });

  it("minister mapping honours cabinet when present", () => {
    const rng = makeRng(4);
    const gov = makeGov([
      { name: "X", partyId: "cdu", portfolio: "finance" },
      { name: "Y", partyId: "gruene", portfolio: "environment" },
    ]);
    const ecoTemplate = MDB_QUESTION_POOL.find(q => q.ministry === "finance")!;
    const envTemplate = MDB_QUESTION_POOL.find(q => q.ministry === "environment")!;
    const session = buildSession("s1", "regierungsbefragung", 42, [ecoTemplate, envTemplate], gov, PARTIES, rng);
    expect(session.questions[0].ministerPartyId).toBe("cdu");
    expect(session.questions[1].ministerPartyId).toBe("gruene");
  });
});

// ── buildSessionBatchRequest ───────────────────────────────────────────

describe("buildSessionBatchRequest", () => {
  const session: ParliamentaryQaSession = {
    id: "s1", kind: "regierungsbefragung", day: 42,
    questions: [
      { questionId: "eco-1", askingPartyId: "cdu", askingPartyName: "CDU/CSU",
        text: "Test?", ministry: "finance", ministerPartyId: "spd", answer: null },
      { questionId: "soc-2", askingPartyId: "linke", askingPartyName: "Die Linke",
        text: "Lohn?", ministry: "labour", ministerPartyId: "spd", answer: null },
    ],
    batchRequestId: null, batchAttempts: 0, answeredOnDay: null,
  };

  it("customId encodes the session id", () => {
    const req = buildSessionBatchRequest(session);
    expect(req.customId).toBe("parl-qa-s1");
  });

  it("system prompt names the session kind in German", () => {
    const req = buildSessionBatchRequest(session);
    expect(req.system).toContain("Regierungsbefragung");
  });

  it("user prompt lists every question with its template id", () => {
    const req = buildSessionBatchRequest(session);
    expect(req.prompt).toContain("eco-1");
    expect(req.prompt).toContain("soc-2");
    expect(req.prompt).toContain("Test?");
    expect(req.prompt).toContain("Lohn?");
  });

  it("maxTokens scales with question count", () => {
    const req = buildSessionBatchRequest(session);
    expect(req.maxTokens).toBeGreaterThanOrEqual(256);
  });

  it("Fragestunde kind uses Fragestunde label", () => {
    const frag: ParliamentaryQaSession = { ...session, kind: "fragestunde" };
    const req = buildSessionBatchRequest(frag);
    expect(req.system).toContain("Fragestunde");
  });
});

// ── parseSessionAnswers ────────────────────────────────────────────────

describe("parseSessionAnswers", () => {
  it("parses a well-formed response", () => {
    const raw = JSON.stringify({ answers: [
      { id: "eco-1", answer: "Antwort A" },
      { id: "soc-2", answer: "Antwort B" },
    ]});
    const map = parseSessionAnswers(raw);
    expect(map.get("eco-1")).toBe("Antwort A");
    expect(map.get("soc-2")).toBe("Antwort B");
  });

  it("skips malformed entries", () => {
    const raw = JSON.stringify({ answers: [
      { id: "eco-1", answer: "OK" },
      { id: 42, answer: "bad id type" },
      { id: "soc-2", wrong_key: "bad shape" },
    ]});
    const map = parseSessionAnswers(raw);
    expect(map.size).toBe(1);
    expect(map.get("eco-1")).toBe("OK");
  });

  it("returns empty map on invalid JSON", () => {
    const map = parseSessionAnswers("not json at all");
    expect(map.size).toBe(0);
  });

  it("returns empty map when answers is not an array", () => {
    const map = parseSessionAnswers(JSON.stringify({ answers: "nope" }));
    expect(map.size).toBe(0);
  });

  it("strips code fences around the JSON (via safeParseJson)", () => {
    const raw = "```json\n" + JSON.stringify({ answers: [{ id: "x", answer: "y" }] }) + "\n```";
    const map = parseSessionAnswers(raw);
    expect(map.get("x")).toBe("y");
  });
});

// ── applyAnswersToSession ──────────────────────────────────────────────

describe("applyAnswersToSession", () => {
  const session: ParliamentaryQaSession = {
    id: "s1", kind: "regierungsbefragung", day: 42,
    questions: [
      { questionId: "a", askingPartyId: "cdu", askingPartyName: "CDU/CSU",
        text: "?", ministry: "finance", ministerPartyId: "spd", answer: null },
      { questionId: "b", askingPartyId: "linke", askingPartyName: "Die Linke",
        text: "?", ministry: "labour", ministerPartyId: "spd", answer: null },
    ],
    batchRequestId: null, batchAttempts: 0, answeredOnDay: null,
  };

  it("fills in answers that are present in the map", () => {
    const map = new Map([["a", "A-answer"], ["b", "B-answer"]]);
    const updated = applyAnswersToSession(session, map);
    expect(updated.questions[0].answer).toBe("A-answer");
    expect(updated.questions[1].answer).toBe("B-answer");
  });

  it("leaves missing answers null when force=false", () => {
    const map = new Map([["a", "A-answer"]]);
    const updated = applyAnswersToSession(session, map);
    expect(updated.questions[0].answer).toBe("A-answer");
    expect(updated.questions[1].answer).toBeNull();
  });

  it("fills missing answers with fallback text when force=true", () => {
    const map = new Map([["a", "A-answer"]]);
    const updated = applyAnswersToSession(session, map, { force: true });
    expect(updated.questions[0].answer).toBe("A-answer");
    expect(updated.questions[1].answer).toBe(PARLIAMENTARY_QA_FALLBACK_ANSWER);
  });

  it("preserves existing answers across repeat calls", () => {
    const map1 = new Map([["a", "A-answer"]]);
    const once = applyAnswersToSession(session, map1);
    const twice = applyAnswersToSession(once, new Map());
    expect(twice.questions[0].answer).toBe("A-answer");
  });
});

// ── questionsPerSession ────────────────────────────────────────────────

describe("questionsPerSession", () => {
  it("stays within the configured range", () => {
    const rng = makeRng(10);
    for (let i = 0; i < 100; i++) {
      const n = questionsPerSession("regierungsbefragung", rng);
      expect(n).toBeGreaterThanOrEqual(REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION.min);
      expect(n).toBeLessThanOrEqual(REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION.max);
    }
  });
});
