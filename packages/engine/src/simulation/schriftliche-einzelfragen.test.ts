import { describe, it, expect, vi } from "vitest";

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("../db/index.js", () => ({
  getDb: () => ({}),
  schema: { simulationMeta: {} },
}));

import {
  poissonDraw,
  clampedPoisson,
  sampleTemplates,
} from "./schriftliche-einzelfragen.js";
import { SCHRIFTLICHE_EINZELFRAGEN } from "../config/parliamentary-qa.js";

function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("poissonDraw", () => {
  it("returns a non-negative integer", () => {
    const rng = makeRng(42);
    for (let i = 0; i < 50; i++) {
      const n = poissonDraw(15, rng);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it("mean converges roughly to lambda across many draws", () => {
    const rng = makeRng(7);
    const lambda = 33;
    const N = 5000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += poissonDraw(lambda, rng);
    const observed = sum / N;
    expect(observed).toBeGreaterThan(lambda - 2.5);
    expect(observed).toBeLessThan(lambda + 2.5);
  });
});

describe("clampedPoisson", () => {
  it("respects the clip bounds over many draws", () => {
    const rng = makeRng(99);
    const { mean, min, max } = SCHRIFTLICHE_EINZELFRAGEN.filedPerDay;
    for (let i = 0; i < 10000; i++) {
      const n = clampedPoisson(mean, min, max, rng);
      expect(n).toBeGreaterThanOrEqual(min);
      expect(n).toBeLessThanOrEqual(max);
    }
  });

  it("answered-per-day config also respects clip bounds", () => {
    const rng = makeRng(101);
    const { mean, min, max } = SCHRIFTLICHE_EINZELFRAGEN.answeredPerDay;
    for (let i = 0; i < 10000; i++) {
      const n = clampedPoisson(mean, min, max, rng);
      expect(n).toBeGreaterThanOrEqual(min);
      expect(n).toBeLessThanOrEqual(max);
    }
  });
});

describe("sampleTemplates", () => {
  it("returns exactly `n` templates when pool has enough", () => {
    const rng = makeRng(3);
    const out = sampleTemplates(3, rng);
    expect(out).toHaveLength(3);
  });

  it("returns unique entries (without replacement)", () => {
    const rng = makeRng(3);
    const out = sampleTemplates(5, rng);
    const texts = new Set(out.map(t => t.text));
    expect(texts.size).toBe(out.length);
  });

  it("returns empty array when n <= 0", () => {
    const rng = makeRng(3);
    expect(sampleTemplates(0, rng)).toHaveLength(0);
  });

  it("returns full pool (no duplication) when n >= pool size", () => {
    const rng = makeRng(3);
    const out = sampleTemplates(1_000, rng);
    const texts = new Set(out.map(t => t.text));
    expect(texts.size).toBe(out.length);
  });
});
