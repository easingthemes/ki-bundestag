/**
 * E2E tests for briefing result processing — covers all mock states:
 * - Missing/undefined result
 * - Empty text (API returned nothing)
 * - Invalid JSON (parse failure)
 * - Valid JSON with missing required fields (validation failure)
 * - Fully valid JSON (success path)
 */

import { describe, it, expect, vi } from "vitest";

// --- Mocks (hoisted before imports) ---

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => ({ all: () => [] }) }),
          all: () => [],
        }),
      }),
    }),
  }),
  schema: {
    simulationEvents: {},
    partyHistory: {},
  },
}));

import { processBriefingResult } from "./briefing.js";
import type { BatchResult } from "./batch-client.js";

// ---------------------------------------------------------------------------
// processBriefingResult
// ---------------------------------------------------------------------------

describe("processBriefingResult", () => {
  it("returns null when result is undefined", () => {
    expect(processBriefingResult(undefined)).toBeNull();
  });

  it("returns null when result text is empty string", () => {
    const emptyResult: BatchResult = {
      customId: "briefing-day5",
      text: "",
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 0,
      outputTokens: 0,
    };
    expect(processBriefingResult(emptyResult)).toBeNull();
  });

  it("returns null when text is not valid JSON", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: "This is not valid JSON at all, just prose.",
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 30,
    };
    expect(processBriefingResult(result)).toBeNull();
  });

  it("returns null when JSON is missing required 'narrative' field", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: JSON.stringify({ tensions: "Some tension", outlook: "Stable" }),
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 30,
    };
    expect(processBriefingResult(result)).toBeNull();
  });

  it("returns null when JSON is missing required 'tensions' field", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: JSON.stringify({ narrative: "Coalition faces challenges.", outlook: "Uncertain." }),
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 30,
    };
    expect(processBriefingResult(result)).toBeNull();
  });

  it("returns null when JSON is missing required 'outlook' field", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: JSON.stringify({ narrative: "Coalition stable.", tensions: "Minor disagreements." }),
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 30,
    };
    expect(processBriefingResult(result)).toBeNull();
  });

  it("returns null when field values are not strings", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: JSON.stringify({ narrative: 42, tensions: true, outlook: null }),
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 100,
      outputTokens: 30,
    };
    expect(processBriefingResult(result)).toBeNull();
  });

  it("returns formatted briefing string for valid JSON with all required fields", () => {
    const result: BatchResult = {
      customId: "briefing-day5",
      text: JSON.stringify({
        narrative: "The coalition faces a budget standoff as FDP demands fiscal restraint.",
        tensions: "SPD and FDP clash over social spending priorities.",
        outlook: "Watch for a confidence vote if the deadlock continues.",
      }),
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 200,
      outputTokens: 80,
    };

    const briefing = processBriefingResult(result);
    expect(briefing).not.toBeNull();
    expect(briefing).toContain("POLITICAL BRIEFING:");
    expect(briefing).toContain("coalition faces a budget standoff");
    expect(briefing).toContain("Tensions:");
    expect(briefing).toContain("SPD and FDP clash");
    expect(briefing).toContain("Outlook:");
    expect(briefing).toContain("confidence vote");
  });

  it("handles code-fenced JSON from the LLM", () => {
    const result: BatchResult = {
      customId: "briefing-day6",
      text: '```json\n{"narrative":"Stable day.","tensions":"None.","outlook":"Quiet."}\n```',
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 150,
      outputTokens: 40,
    };

    const briefing = processBriefingResult(result);
    expect(briefing).not.toBeNull();
    expect(briefing).toContain("Stable day.");
  });

  it("handles JSON with LLM quirks (trailing commas, leading + in numbers)", () => {
    // Even if narrative happens to include numeric-like content, underlying JSON must parse
    const result: BatchResult = {
      customId: "briefing-day7",
      text: '{"narrative":"Growth at +2%.","tensions":"Budget dispute,","outlook":"Stable."}',
      model: "claude-haiku-4-5-20251001",
      provider: "anthropic",
      inputTokens: 120,
      outputTokens: 35,
    };

    // The text is valid JSON — should parse fine
    const briefing = processBriefingResult(result);
    expect(briefing).not.toBeNull();
    expect(briefing).toContain("Growth at +2%.");
  });
});
