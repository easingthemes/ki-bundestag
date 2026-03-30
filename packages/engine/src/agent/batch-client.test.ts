import { describe, it, expect } from "vitest";
import { findResult, type BatchResult } from "./batch-client.js";

describe("findResult", () => {
  const results: BatchResult[] = [
    { customId: "agent-spd-day5", text: "SPD response", model: "haiku", provider: "anthropic" },
    { customId: "agent-cdu-day5", text: "CDU response", model: "haiku", provider: "anthropic" },
    { customId: "media-day5", text: "", model: "haiku", provider: "anthropic" },
  ];

  it("finds result by customId", () => {
    const result = findResult(results, "agent-spd-day5");
    expect(result).toBeDefined();
    expect(result!.text).toBe("SPD response");
  });

  it("returns undefined for missing customId", () => {
    expect(findResult(results, "nonexistent")).toBeUndefined();
  });

  it("returns result even when text is empty", () => {
    const result = findResult(results, "media-day5");
    expect(result).toBeDefined();
    expect(result!.text).toBe("");
  });
});
