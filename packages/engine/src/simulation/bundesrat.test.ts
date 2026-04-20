import { describe, it, expect } from "vitest";
import type { Bill, BillCategory, Party } from "@ki-bundestag/types";
import {
  getBundesratMode,
  voteBundesrat,
} from "./bundesrat.js";
import {
  BUNDESRAT_TOTAL_VOTES,
  BUNDESRAT_MAJORITY,
  BUNDESRAT_LAENDER,
  BUNDESRAT_MODE_BY_CATEGORY,
  LAND_ABSTENTION_THRESHOLD,
} from "../config/bundesrat.js";

/** Party fixture — six federal parties with their seed policyPriorities. */
const PARTIES: Party[] = [
  {
    id: "spd", name: "SPD", color: "#E3000F", ideology: "center-left",
    seatCount: 206, approvalRating: 26, memberCount: 0, inactiveDays: 0,
    coalitionRole: "leader",
    policyPriorities: { economy: -0.2, social: 0.6, environment: 0.3, immigration: 0.3, spending: 0.5 },
  },
  {
    id: "cdu", name: "CDU/CSU", color: "#000000", ideology: "center-right",
    seatCount: 197, approvalRating: 28, memberCount: 0, inactiveDays: 0,
    coalitionRole: "opposition",
    policyPriorities: { economy: 0.5, social: -0.3, environment: -0.1, immigration: -0.3, spending: -0.4 },
  },
  {
    id: "gruene", name: "Bündnis 90/Die Grünen", color: "#64A12D", ideology: "green",
    seatCount: 118, approvalRating: 15, memberCount: 0, inactiveDays: 0,
    coalitionRole: "junior",
    policyPriorities: { economy: -0.3, social: 0.7, environment: 0.9, immigration: 0.5, spending: 0.3 },
  },
  {
    id: "fdp", name: "FDP", color: "#FFED00", ideology: "liberal",
    seatCount: 92, approvalRating: 8, memberCount: 0, inactiveDays: 0,
    coalitionRole: "junior",
    policyPriorities: { economy: 0.8, social: 0.3, environment: -0.2, immigration: 0.2, spending: -0.7 },
  },
  {
    id: "afd", name: "AfD", color: "#009EE0", ideology: "right-populist",
    seatCount: 83, approvalRating: 14, memberCount: 0, inactiveDays: 0,
    coalitionRole: "opposition",
    policyPriorities: { economy: 0.3, social: -0.7, environment: -0.6, immigration: -0.9, spending: -0.1 },
  },
  {
    id: "linke", name: "Die Linke", color: "#BE3075", ideology: "democratic-socialist",
    seatCount: 39, approvalRating: 5, memberCount: 0, inactiveDays: 0,
    coalitionRole: "opposition",
    policyPriorities: { economy: -0.8, social: 0.8, environment: 0.5, immigration: 0.6, spending: 0.8 },
  },
];

function makeBill(over: Partial<Bill>): Bill {
  return {
    id: "test-bill",
    title: "Test bill",
    description: "",
    category: "economy",
    proposedBy: "spd",
    status: "third_reading",
    impact: {},
    votes: [],
    proposedOnDay: 0,
    ...over,
  };
}

describe("bundesrat config", () => {
  it("BUNDESRAT_TOTAL_VOTES is 69 (Art. 51 Abs. 2 GG)", () => {
    expect(BUNDESRAT_TOTAL_VOTES).toBe(69);
  });

  it("BUNDESRAT_MAJORITY is 35 (absolute majority of 69)", () => {
    expect(BUNDESRAT_MAJORITY).toBe(35);
  });

  it("16 Länder total", () => {
    expect(BUNDESRAT_LAENDER).toHaveLength(16);
  });

  it("Länder vote weights sum to 69", () => {
    const sum = BUNDESRAT_LAENDER.reduce((s, l) => s + l.votes, 0);
    expect(sum).toBe(69);
  });

  it("every Land has votes in {3,4,5,6} per Art. 51 Abs. 2 GG", () => {
    for (const land of BUNDESRAT_LAENDER) {
      expect([3, 4, 5, 6]).toContain(land.votes);
    }
  });

  it("every Land maps to at least one sim-party", () => {
    for (const land of BUNDESRAT_LAENDER) {
      expect(land.simParties.length).toBeGreaterThan(0);
    }
  });

  it("Bayern dedups CSU+Freie Wähler → [cdu] (sub-decision S2)", () => {
    const bayern = BUNDESRAT_LAENDER.find(l => l.id === "by");
    expect(bayern).toBeDefined();
    expect(bayern!.simParties).toEqual(["cdu"]);
    expect(bayern!.realParties).toContain("CSU");
    expect(bayern!.realParties).toContain("Freie Wähler");
  });

  it("LAND_ABSTENTION_THRESHOLD is 0.35 (ship-with-fixable constant)", () => {
    expect(LAND_ABSTENTION_THRESHOLD).toBe(0.35);
  });
});

describe("getBundesratMode (sub-decision S1)", () => {
  it("Länder-Verwaltung categories are Zustimmungsgesetze", () => {
    const zustimmung: BillCategory[] = ["education", "healthcare", "social", "infrastructure"];
    for (const cat of zustimmung) {
      expect(getBundesratMode(cat)).toBe("zustimmung");
    }
  });

  it("federal-competence categories are Einspruchsgesetze", () => {
    const einspruch: BillCategory[] = ["economy", "environment", "immigration", "defense"];
    for (const cat of einspruch) {
      expect(getBundesratMode(cat)).toBe("einspruch");
    }
  });

  it("BUNDESRAT_MODE_BY_CATEGORY covers every BillCategory", () => {
    const cats: BillCategory[] = ["economy", "social", "environment", "immigration", "defense", "education", "healthcare", "infrastructure"];
    for (const c of cats) {
      expect(BUNDESRAT_MODE_BY_CATEGORY[c]).toBeDefined();
    }
  });
});

describe("voteBundesrat — structure", () => {
  it("returns 16 Land results", () => {
    const bill = makeBill({ category: "education", impact: { publicSentiment: 0.5 } });
    const result = voteBundesrat(bill, PARTIES);
    expect(result.landResults).toHaveLength(16);
  });

  it("tally.ja + tally.nein + tally.enthaltung equals 69", () => {
    const bill = makeBill({ category: "education", impact: { publicSentiment: 0.5 } });
    const result = voteBundesrat(bill, PARTIES);
    expect(result.tally.ja + result.tally.nein + result.tally.enthaltung).toBe(69);
    expect(result.total).toBe(69);
  });

  it("mode reflects the bill category", () => {
    const zust = voteBundesrat(makeBill({ category: "education" }), PARTIES);
    const eins = voteBundesrat(makeBill({ category: "economy" }), PARTIES);
    expect(zust.mode).toBe("zustimmung");
    expect(eins.mode).toBe("einspruch");
  });
});

describe("voteBundesrat — Zustimmungsgesetz majority math", () => {
  it("passed=true when ja >= 35", () => {
    // Strongly-progressive education bill: SPD/Gruene/Linke-led Länder vote ja.
    const bill = makeBill({
      category: "education",
      impact: { publicSentiment: 1, budget: 1 },
    });
    const result = voteBundesrat(bill, PARTIES);
    if (result.tally.ja >= BUNDESRAT_MAJORITY) {
      expect(result.passed).toBe(true);
    } else {
      expect(result.passed).toBe(false);
    }
  });

  it("threshold exposed as 35", () => {
    const bill = makeBill({ category: "education", impact: { publicSentiment: 0.1 } });
    const result = voteBundesrat(bill, PARTIES);
    expect(result.threshold).toBe(35);
  });
});

describe("voteBundesrat — Einspruchsgesetz math", () => {
  it("passed reflects nein < 35 predicate", () => {
    // Mild economy bill — passed should be the complement of 'Einspruch filed'.
    const bill = makeBill({
      category: "economy",
      impact: { gdpGrowth: 0.1 },
    });
    const result = voteBundesrat(bill, PARTIES);
    expect(result.passed).toBe(result.tally.nein < BUNDESRAT_MAJORITY);
  });

  it("passed=false when nein >= 35 (Einspruch filed)", () => {
    // Extremely hostile-to-Länder economy bill. Force massive nein from all CDU/FDP-led Länder.
    const bill = makeBill({
      category: "economy",
      impact: { gdpGrowth: -1, budget: -1, publicSentiment: -1 },
    });
    const result = voteBundesrat(bill, PARTIES);
    // If majority of Länder oppose, nein >= 35 → Einspruch filed.
    if (result.tally.nein >= BUNDESRAT_MAJORITY) {
      expect(result.passed).toBe(false);
    }
  });
});

describe("voteBundesrat — intra-coalition abstention", () => {
  it("Bayern (single-party mapping) never abstains from variance", () => {
    // Polarising bill. Bayern's simParties=['cdu'] → variance=0 → never enthaltung from spread.
    const bill = makeBill({
      category: "education",
      impact: { publicSentiment: 1, budget: -1, gdpGrowth: -1 },
    });
    const result = voteBundesrat(bill, PARTIES);
    const bayern = result.landResults.find(l => l.landId === "by");
    expect(bayern).toBeDefined();
    // With a single mapped party the Land's intra-coalition spread is 0,
    // so the Land must vote ja or nein, never enthaltung from variance.
    expect(bayern!.vote === "ja" || bayern!.vote === "nein").toBe(true);
  });

  it("Thüringen (CDU+SPD+Linke) abstains on heavily-polarised bills", () => {
    // Thüringen's coalition spans the ideological spectrum;
    // variance should exceed threshold on an economy-hostile progressive bill.
    const bill = makeBill({
      category: "economy",
      impact: { budget: 1, gdpGrowth: -1, publicSentiment: 1 },
    });
    const result = voteBundesrat(bill, PARTIES);
    const thueringen = result.landResults.find(l => l.landId === "th");
    expect(thueringen).toBeDefined();
    expect(thueringen!.vote).toBe("enthaltung");
  });
});

describe("voteBundesrat — federal-coalition bonus", () => {
  it("government bill gets ja-bias in Länder governed by a federal-coalition party", () => {
    // Federal coalition = [spd, gruene]. An SPD-led Land should bias toward ja
    // on a government bill vs. the same bill marked non-government.
    PARTIES.forEach(p => { /* coalitionRole already seeded */ });
    const govBill = makeBill({
      category: "social",
      impact: { publicSentiment: 0.05, budget: 0.05 },   // gentle; bias matters
      isGovernmentBill: true,
    });
    const normalBill = { ...govBill, isGovernmentBill: false };
    const govResult = voteBundesrat(govBill, PARTIES);
    const normalResult = voteBundesrat(normalBill, PARTIES);
    // Government-bill path must tally at least as many ja as the non-government path.
    expect(govResult.tally.ja).toBeGreaterThanOrEqual(normalResult.tally.ja);
  });
});

describe("voteBundesrat — Land result payload", () => {
  it("each land result carries id, name, weight, vote, and coalitionPosition", () => {
    const bill = makeBill({ category: "education", impact: { publicSentiment: 0.5 } });
    const result = voteBundesrat(bill, PARTIES);
    for (const land of result.landResults) {
      expect(land.landId).toMatch(/^[a-z]{2}$/);
      expect(typeof land.landName).toBe("string");
      expect([3, 4, 5, 6]).toContain(land.votes);
      expect(["ja", "nein", "enthaltung"]).toContain(land.vote);
      expect(Array.isArray(land.coalitionPosition.parties)).toBe(true);
      expect(land.coalitionPosition.majoritySupport).toBeGreaterThanOrEqual(-1);
      expect(land.coalitionPosition.majoritySupport).toBeLessThanOrEqual(1);
    }
  });
});
