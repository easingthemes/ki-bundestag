import { describe, it, expect, vi, beforeEach } from "vitest";
import { findResult, chunkItems, type BatchResult, type BatchRequest } from "./batch-client.js";

// ---------------------------------------------------------------------------
// findResult — already covered, kept for regression
// ---------------------------------------------------------------------------

describe("findResult", () => {
  const results: BatchResult[] = [
    { customId: "agent-spd-day5", text: "SPD response", model: "haiku", provider: "anthropic", inputTokens: 100, outputTokens: 50 },
    { customId: "agent-cdu-day5", text: "CDU response", model: "haiku", provider: "anthropic", inputTokens: 100, outputTokens: 50 },
    { customId: "media-day5", text: "", model: "haiku", provider: "anthropic", inputTokens: 0, outputTokens: 0 },
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

// ---------------------------------------------------------------------------
// chunkItems — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("chunkItems", () => {
  it("returns one chunk when all items fit within budget", () => {
    const items = [1, 2, 3, 4, 5];
    const chunks = chunkItems(items, 1000, 10_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual([1, 2, 3, 4, 5]);
  });

  it("splits into multiple chunks when items exceed budget", () => {
    const items = [1, 2, 3, 4, 5, 6];
    // 2000 tokens per item, 4000 budget → 2 items per chunk
    const chunks = chunkItems(items, 2000, 4000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([1, 2]);
    expect(chunks[1]).toEqual([3, 4]);
    expect(chunks[2]).toEqual([5, 6]);
  });

  it("always produces at least 1 item per chunk even with huge token estimates", () => {
    const items = ["a", "b", "c"];
    const chunks = chunkItems(items, 999_999, 1);
    expect(chunks).toHaveLength(3);
    chunks.forEach(c => expect(c).toHaveLength(1));
  });

  it("returns empty array for empty input", () => {
    expect(chunkItems([], 100, 10_000)).toEqual([]);
  });

  it("handles exact budget boundary (no leftover chunk)", () => {
    const items = [1, 2, 3, 4];
    // 500 per item, 1000 budget → 2 per chunk, exactly 2 chunks
    const chunks = chunkItems(items, 500, 1000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual([1, 2]);
    expect(chunks[1]).toEqual([3, 4]);
  });
});

// ---------------------------------------------------------------------------
// submitBatch — error path tests via mocked Anthropic SDK + client.js
//
// vi.mock() is hoisted above all variable declarations in the file, so any
// variables referenced in the factory MUST be created via vi.hoisted() so
// they are initialized before the factory runs.
// ---------------------------------------------------------------------------

// Step 1: create mutable handles that vi.mock factories can safely reference
const mocks = vi.hoisted(() => ({
  // Anthropic SDK mock surfaces
  batches: {
    create: vi.fn(),
    retrieve: vi.fn(),
    results: vi.fn(),
  },
  // client.js helpers
  callAI: vi.fn(),
  detectLimitError: vi.fn(() => ({ type: "none" as const })),
  parseResetTime: vi.fn(() => Date.now() + 60_000),
  markProviderLimited: vi.fn(),
  // model-config mock
  getPartyModel: vi.fn(() => ({ provider: "anthropic" as const, model: "claude-haiku-4-5-20251001" })),
  getRoleModel: vi.fn(() => ({ provider: "anthropic" as const, model: "claude-haiku-4-5-20251001" })),
}));

// Step 2: register the mocks — factories only reference mocks.*, which is safe
vi.mock("@anthropic-ai/sdk", () => ({
  // Must be a regular function (not arrow) so `new Anthropic()` works in the module
  default: function MockAnthropic() {
    return { messages: { batches: mocks.batches } };
  },
}));

vi.mock("./client.js", () => {
  class AIProviderLimitError extends Error {
    provider: string;
    until: string;
    constructor(provider: string, until: string) {
      super(`${provider} limit reached until ${until}`);
      this.name = "AIProviderLimitError";
      this.provider = provider;
      this.until = until;
    }
  }
  return {
    AIProviderLimitError,
    callAI: mocks.callAI,
    detectLimitError: mocks.detectLimitError,
    parseResetTime: mocks.parseResetTime,
    markProviderLimited: mocks.markProviderLimited,
  };
});

vi.mock("./cost-tracker.js", () => ({
  recordAICall: vi.fn(),
  calculateCost: vi.fn(() => 0),
  getTrackingDay: vi.fn(() => 1),
}));

vi.mock("./model-config.js", () => ({
  getPartyModel: mocks.getPartyModel,
  getRoleModel: mocks.getRoleModel,
}));

// Step 3: import the module under test (after mocks are registered)
const { submitBatch } = await import("./batch-client.js");
const { AIProviderLimitError } = await import("./client.js");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeReq(id: string, overrides: Partial<BatchRequest> = {}): BatchRequest {
  return { customId: id, system: "sys", prompt: "prompt", maxTokens: 100, ...overrides };
}

/** Async generator — simulates the `results()` stream from the Anthropic SDK */
async function* asyncItems<T>(items: T[]) {
  for (const item of items) yield item;
}

function batchItem(customId: string, text: string) {
  return {
    custom_id: customId,
    result: {
      type: "succeeded",
      message: {
        content: [{ type: "text", text }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    },
  };
}

function batchItemErrored(customId: string) {
  return { custom_id: customId, result: { type: "errored" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Restore safe defaults after clearAllMocks resets return values
  mocks.detectLimitError.mockReturnValue({ type: "none" });
  mocks.parseResetTime.mockReturnValue(Date.now() + 60_000);
  mocks.getPartyModel.mockReturnValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  mocks.getRoleModel.mockReturnValue({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  process.env.ANTHROPIC_API_KEY = "test-key";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("submitBatch — empty input", () => {
  it("returns [] immediately without calling the API", async () => {
    const results = await submitBatch([]);
    expect(results).toEqual([]);
    expect(mocks.batches.create).not.toHaveBeenCalled();
  });
});

describe("submitBatch — Anthropic hard limit on batch create", () => {
  it("throws AIProviderLimitError and calls markProviderLimited", async () => {
    const resetAt = Date.now() + 60_000;
    mocks.batches.create.mockRejectedValueOnce(new Error("api limit error"));
    mocks.detectLimitError.mockReturnValue({
      type: "hard",
      provider: "anthropic",
      until: "2025-01-01T00:00:00Z",
    });
    mocks.parseResetTime.mockReturnValue(resetAt);

    await expect(submitBatch([makeReq("req-1")])).rejects.toBeInstanceOf(AIProviderLimitError);

    expect(mocks.markProviderLimited).toHaveBeenCalledWith(
      "anthropic",
      "2025-01-01T00:00:00Z",
      resetAt,
    );
  });
});

describe("submitBatch — Anthropic generic error on batch create", () => {
  it("re-throws unknown errors without calling markProviderLimited", async () => {
    mocks.batches.create.mockRejectedValueOnce(new Error("ECONNRESET"));
    mocks.detectLimitError.mockReturnValue({ type: "none" });

    await expect(submitBatch([makeReq("req-1")])).rejects.toThrow("ECONNRESET");
    expect(mocks.markProviderLimited).not.toHaveBeenCalled();
  });
});

describe("submitBatch — Anthropic batch timeout", () => {
  it("throws a timeout error when the batch never reaches 'ended' status", async () => {
    // BATCH_TIMEOUT_MS is computed at module load time (default 3600s), so we
    // can't override it via process.env in a test. Instead we use fake timers to
    // advance Date.now() and drain the setTimeout inside the polling loop.
    vi.useFakeTimers();

    mocks.batches.create.mockResolvedValueOnce({
      id: "batch-abc",
      processing_status: "in_progress",
    });
    mocks.batches.retrieve.mockResolvedValue({
      processing_status: "in_progress",
      request_counts: { succeeded: 0, processing: 1, errored: 0 },
    });

    // Catch the rejection immediately so it's never "unhandled" during timer advancement
    let caughtErr: Error | undefined;
    const batchPromise = submitBatch([makeReq("req-1")]).catch(e => { caughtErr = e as Error; });

    // Advance 4 hours — enough to exceed the 3600s default BATCH_TIMEOUT_MS
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    await batchPromise; // wait for the caught rejection to settle

    expect(caughtErr).toBeDefined();
    expect(caughtErr!.message).toMatch(/timed out/i);

    vi.useRealTimers();
  });
});

describe("submitBatch — individual request failure within batch", () => {
  it("returns empty text for errored items, non-empty text for succeeded items", async () => {
    mocks.batches.create.mockResolvedValueOnce({
      id: "batch-xyz",
      processing_status: "ended",
    });
    mocks.batches.results.mockReturnValueOnce(
      asyncItems([
        batchItem("req-ok", "Valid AI response"),
        batchItemErrored("req-fail"),
      ]),
    );

    const results = await submitBatch([makeReq("req-ok"), makeReq("req-fail")]);

    const ok = results.find(r => r.customId === "req-ok");
    const failed = results.find(r => r.customId === "req-fail");

    expect(ok?.text).toBe("Valid AI response");
    expect(failed?.text).toBe("");       // empty string, not undefined/missing
    expect(failed?.inputTokens).toBe(0);
    expect(results).toHaveLength(2);     // both IDs present in results
  });
});

describe("submitBatch — all Anthropic requests succeed", () => {
  it("returns full results with correct token counts and provider", async () => {
    mocks.batches.create.mockResolvedValueOnce({
      id: "batch-good",
      processing_status: "ended",
    });
    mocks.batches.results.mockReturnValueOnce(
      asyncItems([
        batchItem("spd-req", "SPD response text"),
        batchItem("cdu-req", "CDU response text"),
      ]),
    );

    const results = await submitBatch([makeReq("spd-req"), makeReq("cdu-req")]);

    expect(results).toHaveLength(2);
    expect(results.find(r => r.customId === "spd-req")?.text).toBe("SPD response text");
    expect(results.find(r => r.customId === "cdu-req")?.text).toBe("CDU response text");
    expect(results[0].inputTokens).toBe(10);
    expect(results[0].outputTokens).toBe(5);
    expect(results[0].provider).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// xAI sequential fallback
// ---------------------------------------------------------------------------

describe("submitBatch — xAI sequential fallback", () => {
  beforeEach(() => {
    // Switch model-config to return xAI for all requests in this block
    mocks.getPartyModel.mockReturnValue({ provider: "xai", model: "grok-3-mini" });
    mocks.getRoleModel.mockReturnValue({ provider: "xai", model: "grok-3-mini" });
  });

  it("returns successful xAI results", async () => {
    mocks.callAI.mockResolvedValueOnce({
      text: "xAI reply",
      model: "grok-3-mini",
      provider: "xai",
      inputTokens: 5,
      outputTokens: 3,
    });

    const results = await submitBatch([makeReq("xai-req-1", { roleKey: "daily" })]);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("xAI reply");
    expect(results[0].provider).toBe("xai");
  });

  it("returns empty text and continues when a single xAI call fails", async () => {
    mocks.callAI
      .mockRejectedValueOnce(new Error("xAI network error"))
      .mockResolvedValueOnce({
        text: "second ok",
        model: "grok-3-mini",
        provider: "xai",
        inputTokens: 5,
        outputTokens: 3,
      });

    const results = await submitBatch([
      makeReq("xai-fail", { roleKey: "daily" }),
      makeReq("xai-ok", { roleKey: "daily" }),
    ]);

    expect(results).toHaveLength(2);
    expect(results.find(r => r.customId === "xai-fail")?.text).toBe("");
    expect(results.find(r => r.customId === "xai-ok")?.text).toBe("second ok");
  });

  it("breaks out of the loop when xAI returns AIProviderLimitError", async () => {
    mocks.callAI.mockRejectedValueOnce(new AIProviderLimitError("xai", "2025-12-01"));

    const results = await submitBatch([
      makeReq("xai-limited", { roleKey: "daily" }),
      makeReq("xai-never-called", { roleKey: "daily" }),
    ]);

    // Only 1 result — loop broke after the limit error, second req never ran
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("");
    expect(mocks.callAI).toHaveBeenCalledTimes(1);
  });
});
