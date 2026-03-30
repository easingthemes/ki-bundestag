import { describe, it, expect, vi } from "vitest";

// Mock drizzle-orm and DB (required before imports)
vi.mock("drizzle-orm", () => ({ and: vi.fn(), count: vi.fn(), eq: vi.fn(), gte: vi.fn(), desc: vi.fn() }));
vi.mock("../db/index.js", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ all: () => [] }), orderBy: () => ({ limit: () => ({ all: () => [] }) }) }) }) }),
  getUserDb: () => ({ select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) }),
  schema: { mediaArticles: {}, bundestagSeats: {}, simulationEvents: {} },
}));

import { processPartyAgentResult } from "./party-agent.js";
import type { AgentContext, Bill, Party, PolicyPriorities } from "@ki-bundestag/types";
import type { BatchResult } from "./batch-client.js";

const POLICY: PolicyPriorities = { economy: 5, social: 5, environment: 5, immigration: 5, spending: 5 };

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: "spd",
    name: "SPD",
    shortName: "SPD",
    color: "#e3000f",
    ideology: "center-left",
    seatCount: 206,
    approvalRating: 25,
    policyPriorities: POLICY,
    coalitionRole: "leader",
    ...overrides,
  } as Party;
}

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    title: "Test Bill",
    description: "A test bill",
    category: "economy",
    proposedBy: "cdu",
    status: "third_reading",
    reading: 3,
    impact: { budget: 1, publicSentiment: 0.5 },
    votes: [],
    proposedOnDay: 1,
    statusChangedOnDay: 3,
    ...overrides,
  } as Bill;
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  const party = makeParty();
  return {
    party,
    allParties: [party],
    nationalState: { coalitionParties: ["spd", "gruene", "fdp"], oppositionParties: ["cdu", "afd", "linke"], budget: 45, unemployment: 5, inflation: 2, gdpGrowth: 0.8, publicSentiment: 50 },
    pendingBills: [],
    recentEvents: [],
    currentDay: 10,
    activeCrises: [],
    recentMedia: [],
    activeElection: null,
    hasFraktion: true,
    ...overrides,
  } as AgentContext;
}

describe("processPartyAgentResult", () => {
  const bills = [makeBill(), makeBill({ id: "bill-2", title: "Bill 2" })];

  it("returns abstain for all bills when result is undefined", () => {
    const actions = processPartyAgentResult(undefined, makeContext(), bills);
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.type === "vote" && a.vote === "abstain")).toBe(true);
  });

  it("returns abstain for all bills when result text is empty", () => {
    const emptyResult: BatchResult = { customId: "agent-spd-day10", text: "", model: "haiku", provider: "anthropic" };
    const actions = processPartyAgentResult(emptyResult, makeContext(), bills);
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.type === "vote" && a.vote === "abstain")).toBe(true);
  });

  it("returns abstain when JSON is unparseable", () => {
    const badResult: BatchResult = { customId: "test", text: "not json at all", model: "haiku", provider: "anthropic" };
    const actions = processPartyAgentResult(badResult, makeContext(), bills);
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.type === "vote" && a.vote === "abstain")).toBe(true);
  });

  it("parses valid agent response with votes", () => {
    const validResponse = JSON.stringify({
      actions: [
        { type: "vote", billId: "bill-1", vote: "yes", reason: "Good bill" },
        { type: "vote", billId: "bill-2", vote: "no", reason: "Bad bill" },
      ],
    });
    const result: BatchResult = { customId: "test", text: validResponse, model: "haiku", provider: "anthropic" };
    const actions = processPartyAgentResult(result, makeContext(), bills);

    const votes = actions.filter(a => a.type === "vote");
    expect(votes.length).toBeGreaterThanOrEqual(2);
    expect(votes.find(v => v.billId === "bill-1")?.vote).toBe("yes");
    expect(votes.find(v => v.billId === "bill-2")?.vote).toBe("no");
  });

  it("auto-abstains on bills not voted on in response", () => {
    const partialResponse = JSON.stringify({
      actions: [
        { type: "vote", billId: "bill-1", vote: "yes", reason: "Good" },
        // bill-2 not mentioned
      ],
    });
    const result: BatchResult = { customId: "test", text: partialResponse, model: "haiku", provider: "anthropic" };
    const actions = processPartyAgentResult(result, makeContext(), bills);

    const bill2Vote = actions.find(a => a.type === "vote" && a.billId === "bill-2");
    expect(bill2Vote).toBeDefined();
    expect(bill2Vote!.vote).toBe("abstain");
  });
});
