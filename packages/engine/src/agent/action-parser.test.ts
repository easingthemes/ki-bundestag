import { describe, it, expect } from "vitest";
import { parseAgentResponse, validateActions } from "./action-parser.js";
import { buildValidationRetryPrompt } from "./prompt.js";
import type { ValidationError } from "./action-parser.js";
import type { AgentAction, Bill } from "@ki-bundestag/types";

describe("parseAgentResponse", () => {
  it("parses a valid JSON response with actions array", () => {
    const raw = '{"actions": [{"type": "nothing"}]}';
    const result = parseAgentResponse(raw);
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe("nothing");
  });

  it("handles code-fenced response from LLM", () => {
    const raw = '```json\n{"actions": [{"type": "statement", "title": "Test", "statement": "Hello"}]}\n```';
    const result = parseAgentResponse(raw);
    expect(result.actions).toHaveLength(1);
  });

  it("throws on missing actions array", () => {
    expect(() => parseAgentResponse('{"data": "no actions"}')).toThrow("actions");
  });

  it("handles LLM quirks like trailing commas", () => {
    const raw = '{"actions": [{"type": "nothing",},]}';
    const result = parseAgentResponse(raw);
    expect(result.actions).toHaveLength(1);
  });
});

describe("validateActions", () => {
  const makeBill = (id: string): Bill => ({
    id,
    title: "Test Bill",
    description: "A test",
    category: "economy",
    proposedBy: "spd",
    status: "third_reading",
    impact: {},
    votes: [],
    proposedOnDay: 1,
  });

  const makeProposal = (): AgentAction => ({
    type: "propose_bill",
    title: "New Law",
    description: "Details",
    category: "economy",
    impact: { budget: 0.5 },
  });

  it("passes through valid vote actions", () => {
    const bills = [makeBill("bill-1")];
    const actions: AgentAction[] = [
      { type: "vote", billId: "bill-1", vote: "yes", reason: "Good bill" },
    ];
    const result = validateActions(actions, bills, "spd");
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].type).toBe("vote");
    expect(result.errors).toHaveLength(0);
  });

  it("skips duplicate votes for the same bill", () => {
    const bills = [makeBill("bill-1")];
    const actions: AgentAction[] = [
      { type: "vote", billId: "bill-1", vote: "yes", reason: "Good" },
      { type: "vote", billId: "bill-1", vote: "no", reason: "Changed mind" },
    ];
    const result = validateActions(actions, bills, "spd");
    const votes = result.valid.filter((a): a is Extract<AgentAction, { type: "vote" }> => a.type === "vote");
    expect(votes).toHaveLength(1);
    expect(votes[0].vote).toBe("yes");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fixable).toBe(true);
  });

  it("auto-adds abstain for unvoted bills", () => {
    const bills = [makeBill("bill-1"), makeBill("bill-2")];
    const actions: AgentAction[] = [
      { type: "vote", billId: "bill-1", vote: "yes", reason: "OK" },
    ];
    const result = validateActions(actions, bills, "spd");
    const abstain = result.valid.find((a): a is Extract<AgentAction, { type: "vote" }> => a.type === "vote" && a.billId === "bill-2");
    expect(abstain).toBeDefined();
    expect(abstain!.vote).toBe("abstain");
    expect(result.autoAbstainBillIds).toEqual(["bill-2"]);
  });

  it("skips parliamentary actions for parties without Fraktion", () => {
    const bills = [makeBill("bill-1")];
    const actions: AgentAction[] = [
      { type: "vote", billId: "bill-1", vote: "yes", reason: "OK" },
      makeProposal(),
    ];
    const result = validateActions(actions, bills, "afd", undefined, false);
    expect(result.valid.filter(a => a.type === "vote")).toHaveLength(0);
    expect(result.valid.filter(a => a.type === "propose_bill")).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every(e => e.fixable === false)).toBe(true);
  });

  it("allows statements for parties without Fraktion", () => {
    const actions: AgentAction[] = [
      { type: "statement", title: "Press Release", statement: "We stand firm." },
    ];
    const result = validateActions(actions, [], "afd", undefined, false);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].type).toBe("statement");
  });

  it("limits proposals to 1 per turn", () => {
    const actions: AgentAction[] = [
      { type: "propose_bill", title: "Bill A", description: "First", category: "economy", impact: { budget: 0.5 } },
      { type: "propose_bill", title: "Bill B", description: "Second", category: "social", impact: { budget: 0.3 } },
    ];
    const result = validateActions(actions, [], "spd");
    expect(result.valid.filter(a => a.type === "propose_bill")).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fixable).toBe(true);
  });

  it("defaults invalid category to economy", () => {
    const actions: AgentAction[] = [
      { type: "propose_bill", title: "Bill A", description: "Details", category: "invalid" as any, impact: { budget: 0.1 } },
    ];
    const result = validateActions(actions, [], "spd");
    const proposal = result.valid.find((a): a is Extract<AgentAction, { type: "propose_bill" }> => a.type === "propose_bill");
    expect(proposal!.category).toBe("economy");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fixable).toBe(true);
  });

  it("marks unknown action types as fixable", () => {
    const actions = [{ type: "filibuster" }] as unknown as AgentAction[];
    const result = validateActions(actions, [], "spd");
    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].actionType).toBe("filibuster");
    expect(result.errors[0].fixable).toBe(true);
  });

  it("marks vote for non-existent bill as fixable with valid IDs in message", () => {
    const bills = [makeBill("bill-1")];
    const actions: AgentAction[] = [
      { type: "vote", billId: "bill-999", vote: "yes", reason: "OK" },
    ];
    const result = validateActions(actions, bills, "spd");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fixable).toBe(true);
    expect(result.errors[0].message).toContain("bill-1");
  });

  it("marks interpellation from non-opposition as non-fixable", () => {
    const actions: AgentAction[] = [
      { type: "file_interpellation", interpellationType: "kleine", title: "Test", question: "Why?", targetMinistry: "finance" },
    ];
    const result = validateActions(actions, [], "spd", undefined, true, undefined, false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fixable).toBe(false);
  });
});

describe("buildValidationRetryPrompt", () => {
  it("includes original prompt and error details", () => {
    const errors: ValidationError[] = [
      { actionIndex: 0, actionType: "vote", message: "Bill bill-99 does not exist", fixable: true },
      { actionIndex: 2, actionType: "filibuster", message: 'Unknown action type "filibuster"', fixable: true },
    ];
    const result = buildValidationRetryPrompt("Original prompt here", errors, []);
    expect(result).toContain("Original prompt here");
    expect(result).toContain("VALIDATION ERRORS");
    expect(result).toContain('[action #1, type "vote"]');
    expect(result).toContain('[action #3, type "filibuster"]');
    expect(result).toContain("Bill bill-99 does not exist");
  });

  it("includes auto-abstain bill IDs", () => {
    const errors: ValidationError[] = [
      { actionIndex: 0, actionType: "vote", message: "Bad vote", fixable: true },
    ];
    const result = buildValidationRetryPrompt("Prompt", errors, ["bill-1", "bill-2"]);
    expect(result).toContain("Missing votes for bills: bill-1, bill-2");
  });

  it("includes re-generation instruction", () => {
    const result = buildValidationRetryPrompt("Prompt", [], []);
    expect(result).toContain("Re-generate your complete actions JSON");
  });
});
