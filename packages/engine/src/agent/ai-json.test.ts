import { describe, it, expect } from "vitest";
import {
  extractJson,
  stripLeadingPlusInJsonNumbers,
  stripTrailingCommasInJson,
  safeParseJson,
  parseAIJson,
} from "./ai-json.js";

describe("extractJson", () => {
  it("strips markdown code fences", () => {
    const input = '```json\n{"actions": []}\n```';
    expect(extractJson(input)).toBe('{"actions": []}');
  });

  it("strips fences without json language tag", () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJson(input)).toBe('{"key": "value"}');
  });

  it("returns trimmed string when no fences present", () => {
    expect(extractJson('  {"a": 1}  ')).toBe('{"a": 1}');
  });
});

describe("stripLeadingPlusInJsonNumbers", () => {
  it("removes + before numbers after colons", () => {
    expect(stripLeadingPlusInJsonNumbers('{"val": +3.5}')).toBe('{"val": 3.5}');
  });

  it("removes + before numbers after commas in arrays", () => {
    expect(stripLeadingPlusInJsonNumbers("[+1, +2]")).toBe("[1, 2]");
  });

  it("preserves + inside string values", () => {
    expect(stripLeadingPlusInJsonNumbers('{"msg": "+1 approved"}')).toBe('{"msg": "+1 approved"}');
  });
});

describe("stripTrailingCommasInJson", () => {
  it("removes trailing comma before closing brace", () => {
    expect(stripTrailingCommasInJson('{"a": 1,}')).toBe('{"a": 1}');
  });

  it("removes trailing comma before closing bracket", () => {
    expect(stripTrailingCommasInJson("[1, 2,]")).toBe("[1, 2]");
  });

  it("preserves commas inside strings", () => {
    expect(stripTrailingCommasInJson('{"a": "hello,"}'))
      .toBe('{"a": "hello,"}');
  });
});

describe("safeParseJson", () => {
  it("parses clean JSON", () => {
    expect(safeParseJson('{"x": 1}')).toEqual({ x: 1 });
  });

  it("parses JSON with LLM quirks (leading +, trailing commas)", () => {
    expect(safeParseJson('{"val": +2,}')).toEqual({ val: 2 });
  });

  it("returns null for completely invalid input", () => {
    expect(safeParseJson("not json at all")).toBeNull();
  });

  it("handles code-fenced input", () => {
    expect(safeParseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });
});

describe("parseAIJson", () => {
  it("parses and validates successfully", () => {
    const result = parseAIJson<{ count: number }>(
      '{"count": 5}',
      (v) => {
        const obj = v as Record<string, unknown>;
        return typeof obj.count === "number" ? { count: obj.count } : null;
      },
      "test",
    );
    expect(result).toEqual({ count: 5 });
  });

  it("returns null when validator rejects", () => {
    const result = parseAIJson<{ count: number }>(
      '{"count": "not a number"}',
      (v) => {
        const obj = v as Record<string, unknown>;
        return typeof obj.count === "number" ? { count: obj.count } : null;
      },
      "test",
    );
    expect(result).toBeNull();
  });
});
