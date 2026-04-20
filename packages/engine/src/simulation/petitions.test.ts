import { describe, it, expect, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  and: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), ne: vi.fn(), isNull: vi.fn(), desc: vi.fn(),
}));
vi.mock("../db/index.js", () => ({
  getDb: () => ({}),
  schema: { petitions: {} },
}));

import {
  logisticGrowthTick,
  computeSalience,
  pickTemplate,
  rollCommitteeOutcome,
  type Petition,
} from "./petitions.js";
import {
  PETITION_QUORUM,
  PETITION_PUBLIC_WINDOW_DAYS,
  PETITION_COMMITTEE_OUTCOMES,
  PETITION_TEMPLATES,
} from "../config/petitions.js";
import type { BillCategory, Crisis } from "@ki-bundestag/types";

function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function makePet(over: Partial<Petition> = {}): Petition {
  return {
    id: "p-1", title: "T", description: "D", category: "economy",
    authorDisplayName: "A", startedOnDay: 0, publicWindowEndDay: 28,
    signatureCount: 1000, signatureQuorum: PETITION_QUORUM, status: "collecting",
    quorumReachedOnDay: null, debatedOnDay: null, outcome: null,
    ...over,
  };
}

function makeCrisis(category: string, severity: "low" | "medium" | "high" = "high"): Crisis {
  return {
    id: "c-1", templateId: "t-1", name: "Test", description: "D",
    category, severity, startDay: 0, endDay: 50, dailyImpact: {}, resolved: false,
  } as Crisis;
}

// ── logisticGrowthTick ─────────────────────────────────────────────────

describe("logisticGrowthTick", () => {
  it("is monotonically non-decreasing", () => {
    const rng = makeRng(1);
    let current = 1000;
    for (let i = 0; i < 30; i++) {
      const next = logisticGrowthTick(current, PETITION_QUORUM, 1.0, rng);
      expect(next).toBeGreaterThanOrEqual(current);
      current = next;
    }
  });

  it("never exceeds the cap", () => {
    const rng = makeRng(2);
    const next = logisticGrowthTick(29_500, PETITION_QUORUM, 2.5, rng);
    expect(next).toBeLessThanOrEqual(PETITION_QUORUM);
  });

  it("higher salience accelerates growth", () => {
    const rngA = makeRng(42);
    const rngB = makeRng(42);
    const lowSal = logisticGrowthTick(10_000, PETITION_QUORUM, 1.0, rngA);
    const highSal = logisticGrowthTick(10_000, PETITION_QUORUM, 2.5, rngB);
    expect(highSal).toBeGreaterThan(lowSal);
  });

  it("applies bootstrap floor to low-signature petitions", () => {
    const rng = makeRng(3);
    // With 100 signatures, logistic term ~0 (0.38 * 100 * 0.997 = 38),
    // bootstrap floor 50-199 should dominate.
    const next = logisticGrowthTick(100, PETITION_QUORUM, 1.0, rng);
    expect(next).toBeGreaterThan(100);
  });
});

// ── computeSalience ────────────────────────────────────────────────────

describe("computeSalience", () => {
  it("baseline is 1.0 with no crises or bills", () => {
    const p = makePet({ category: "economy" });
    expect(computeSalience(p, [], [])).toBe(1.0);
  });

  it("stacks crisis bonuses", () => {
    const p = makePet({ category: "economy" });
    const crises = [makeCrisis("economy"), makeCrisis("economy"), makeCrisis("social")];
    const salience = computeSalience(p, crises, []);
    // Two matching crises: 1.0 + 0.6 + 0.6 = 2.2 (under 2.5 cap)
    expect(salience).toBeCloseTo(2.2, 2);
  });

  it("caps at 2.5", () => {
    const p = makePet({ category: "economy" });
    const crises = Array.from({ length: 10 }, () => makeCrisis("economy"));
    expect(computeSalience(p, crises, ["economy"])).toBe(2.5);
  });

  it("recent-bill bonus only fires for matching category", () => {
    const p = makePet({ category: "economy" });
    const baseline = computeSalience(p, [], []);
    const matched = computeSalience(p, [], ["economy" as BillCategory]);
    expect(matched).toBeGreaterThan(baseline);

    const unmatched = computeSalience(p, [], ["social" as BillCategory]);
    expect(unmatched).toBe(baseline);
  });
});

// ── pickTemplate ───────────────────────────────────────────────────────

describe("pickTemplate", () => {
  it("returns a template + author pair", () => {
    const rng = makeRng(5);
    const { template, author } = pickTemplate(rng);
    expect(PETITION_TEMPLATES).toContain(template);
    expect(typeof author).toBe("string");
    expect(author.length).toBeGreaterThan(0);
  });

  it("covers all categories over many draws", () => {
    const rng = makeRng(10);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pickTemplate(rng).template.category);
    // Pool has all 8 categories — expect most to surface within 200 draws.
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});

// ── rollCommitteeOutcome ───────────────────────────────────────────────

describe("rollCommitteeOutcome", () => {
  it("distribution matches PETITION_COMMITTEE_OUTCOMES over many rolls", () => {
    const rng = makeRng(100);
    const N = 5000;
    let accepted = 0;
    for (let i = 0; i < N; i++) {
      if (rollCommitteeOutcome(rng) === "accepted") accepted++;
    }
    const observed = accepted / N;
    const expected = PETITION_COMMITTEE_OUTCOMES.accepted;
    // ±0.03 absolute tolerance.
    expect(observed).toBeGreaterThan(expected - 0.03);
    expect(observed).toBeLessThan(expected + 0.03);
  });
});

// ── End-to-end growth sanity check ─────────────────────────────────────

describe("end-to-end signature growth", () => {
  it("a non-trivial share of petitions crosses quorum within the window", () => {
    const N = 200;
    let reached = 0;
    for (let seed = 1; seed <= N; seed++) {
      const rng = makeRng(seed);
      let count = Math.floor(rng() * 450) + 50; // 50-499 initial
      for (let d = 0; d < PETITION_PUBLIC_WINDOW_DAYS; d++) {
        count = logisticGrowthTick(count, PETITION_QUORUM, 1.0, rng);
        if (count >= PETITION_QUORUM) { reached++; break; }
      }
    }
    const rate = reached / N;
    // Target ~30%, loose band 15-55% to avoid flake.
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.55);
  });
});
