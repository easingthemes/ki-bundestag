/**
 * Cycle 5 PR 1 / S2 — EXPERTS_SEED ministry-coverage invariant.
 *
 * `pickExpertsForHearing` (S5) throws when the filtered pool < count. The S2
 * invariant ("≥ ANHOERUNG_EXPERTS_PER_HEARING experts per ministry portfolio
 * via expertise_areas overlap") is what prevents that throw at runtime.
 *
 * Test-asserted, not just doc-asserted, per the brainstorm decision.
 */

import { describe, it, expect } from "vitest";
import { EXPERTS_SEED } from "./experts.js";
import { ANHOERUNG_EXPERTS_PER_HEARING } from "./parliament.js";
import type { MinistryPortfolio } from "@ki-bundestag/types";

const MINISTRY_PORTFOLIOS: MinistryPortfolio[] = [
  "finance", "labour", "environment", "interior",
  "defence", "education", "health", "infrastructure",
];

describe("EXPERTS_SEED — S2 invariant", () => {
  it("covers every MinistryPortfolio with ≥ ANHOERUNG_EXPERTS_PER_HEARING experts", () => {
    for (const ministry of MINISTRY_PORTFOLIOS) {
      const matching = EXPERTS_SEED.filter(e => e.expertiseAreas.includes(ministry));
      expect(matching.length, `ministry ${ministry} needs ≥${ANHOERUNG_EXPERTS_PER_HEARING} experts, got ${matching.length}`)
        .toBeGreaterThanOrEqual(ANHOERUNG_EXPERTS_PER_HEARING);
    }
  });

  it("has unique expert ids (INSERT OR IGNORE keyed on id, S13)", () => {
    const ids = EXPERTS_SEED.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has at least 30 experts (S2 size target)", () => {
    expect(EXPERTS_SEED.length).toBeGreaterThanOrEqual(30);
  });

  it("every expert has a non-empty name + affiliation + at least one expertise area", () => {
    for (const e of EXPERTS_SEED) {
      expect(e.name.trim().length, `expert ${e.id} has empty name`).toBeGreaterThan(0);
      expect(e.affiliation.trim().length, `expert ${e.id} has empty affiliation`).toBeGreaterThan(0);
      expect(e.expertiseAreas.length, `expert ${e.id} has no expertise areas`).toBeGreaterThan(0);
    }
  });
});
