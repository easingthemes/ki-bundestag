import { describe, it, expect, vi } from "vitest";

// Mock DB dependencies to prevent drizzle-orm import resolution errors
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getUserDb: () => ({}),
  schema: { users: {} },
}));

import {
  updateApproval,
  approvalFromBillOutcome,
  updateSentiment,
  membershipBonus,
  isPartyActive,
  inactivityPenalty,
} from "./opinion.js";
import type { Party } from "@ki-bundestag/types";

function makeParty(approvalRating: number): Party {
  return {
    id: "spd", name: "SPD", color: "#e3000f", ideology: "center-left",
    seatCount: 200, approvalRating,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "leader", memberCount: 100, inactiveDays: 0,
  };
}

describe("updateApproval", () => {
  it("increases approval with positive delta", () => {
    const result = updateApproval(makeParty(20), 1.5);
    expect(result).toBe(21.5);
  });

  it("clamps to max 60", () => {
    const result = updateApproval(makeParty(59.5), 2);
    expect(result).toBe(60);
  });

  it("clamps to min 1", () => {
    const result = updateApproval(makeParty(2), -5);
    expect(result).toBe(1);
  });
});

describe("approvalFromBillOutcome", () => {
  it("gives +0.3 when proposer's bill passes", () => {
    expect(approvalFromBillOutcome(true, true)).toBe(0.3);
  });

  it("gives -0.2 when proposer's bill fails", () => {
    expect(approvalFromBillOutcome(false, true)).toBe(-0.2);
  });

  it("gives 0 for non-proposer", () => {
    expect(approvalFromBillOutcome(true, false)).toBe(0);
    expect(approvalFromBillOutcome(false, false)).toBe(0);
  });
});

describe("updateSentiment", () => {
  it("increases sentiment with positive impact", () => {
    const result = updateSentiment(50, { publicSentiment: 1.5 });
    expect(result).toBe(51.5);
  });

  it("caps per-bill swing to +-2", () => {
    // Even with publicSentiment of 10, swing is capped to 2
    const result = updateSentiment(50, { publicSentiment: 10 });
    expect(result).toBe(52);
  });

  it("clamps to min 5", () => {
    const result = updateSentiment(6, { publicSentiment: -2 });
    expect(result).toBe(5);
  });

  it("clamps to max 75", () => {
    const result = updateSentiment(74, { publicSentiment: 2 });
    expect(result).toBe(75);
  });
});

describe("membershipBonus", () => {
  it("returns 0 for no members", () => {
    expect(membershipBonus(0)).toBe(0);
  });

  it("returns 0 for negative members", () => {
    expect(membershipBonus(-5)).toBe(0);
  });

  it("returns small bonus for ~10 members", () => {
    const bonus = membershipBonus(10);
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThan(0.05);
  });

  it("returns larger bonus for ~100 members", () => {
    const b10 = membershipBonus(10);
    const b100 = membershipBonus(100);
    expect(b100).toBeGreaterThan(b10);
  });
});

describe("isPartyActive", () => {
  it("returns false for empty actions", () => {
    expect(isPartyActive([])).toBe(false);
  });

  it("returns false for abstain-only votes", () => {
    expect(isPartyActive([
      { type: "vote", billId: "b1", vote: "abstain", reason: "" },
      { type: "vote", billId: "b2", vote: "abstain", reason: "" },
    ])).toBe(false);
  });

  it("returns false for nothing action", () => {
    expect(isPartyActive([{ type: "nothing" }])).toBe(false);
  });

  it("returns true for a yes vote", () => {
    expect(isPartyActive([
      { type: "vote", billId: "b1", vote: "yes", reason: "" },
    ])).toBe(true);
  });

  it("returns true for a proposal", () => {
    expect(isPartyActive([
      { type: "propose_bill", title: "T", description: "D", category: "economy", impact: {} },
    ])).toBe(true);
  });

  it("returns true for a statement", () => {
    expect(isPartyActive([
      { type: "statement", title: "T", statement: "S" },
    ])).toBe(true);
  });

  it("returns true when mixed abstains + one real action", () => {
    expect(isPartyActive([
      { type: "vote", billId: "b1", vote: "abstain", reason: "" },
      { type: "statement", title: "T", statement: "S" },
    ])).toBe(true);
  });
});

describe("inactivityPenalty", () => {
  it("returns 0 within grace period (5 days)", () => {
    expect(inactivityPenalty(0)).toBe(0);
    expect(inactivityPenalty(3)).toBe(0);
    expect(inactivityPenalty(5)).toBe(0);
  });

  it("returns base penalty just after grace period", () => {
    const penalty = inactivityPenalty(6);
    expect(penalty).toBeCloseTo(0.052, 2); // 0.05 + 1*0.002
  });

  it("scales up over time", () => {
    const p10 = inactivityPenalty(10);
    const p30 = inactivityPenalty(30);
    expect(p30).toBeGreaterThan(p10);
  });

  it("caps at 0.15", () => {
    expect(inactivityPenalty(200)).toBe(0.15);
    expect(inactivityPenalty(500)).toBe(0.15);
  });

  it("reaches cap around day 55", () => {
    // Day 55: 0.05 + (55-5)*0.002 = 0.05 + 0.1 = 0.15
    expect(inactivityPenalty(55)).toBe(0.15);
  });
});
