/**
 * E2E tests for submitBatch — covers Anthropic batch API, xAI sequential fallback,
 * and mixed-provider routing with mock states:
 * - API spending limit hit on batch.create
 * - Batch polling timeout
 * - Errored items in batch results
 * - Successful multi-item results
 * - xAI individual call failure (continues to next)
 * - xAI AIProviderLimitError breaks the sequential loop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock variables (must be defined before vi.mock calls)
// ---------------------------------------------------------------------------

const {
  mockBatchCreate,
  mockBatchRetrieve,
  mockBatchResults,
  mockCallAI,
  mockDetectLimitError,
  mockMarkProviderLimited,
  mockMarkProviderAuthFailed,
  mockIsProviderAuthFailed,
  mockParseResetTime,
  MockAIProviderLimitError,
  MockAIProviderAuthError,
} = vi.hoisted(() => {
  class MockAIProviderLimitError extends Error {
    provider: string;
    until: string;
    constructor(provider: string, until: string) {
      super(`[AI] ${provider} usage limit reached — access resumes ${until}`);
      this.name = "AIProviderLimitError";
      this.provider = provider;
      this.until = until;
    }
  }

  class MockAIProviderAuthError extends Error {
    provider: string;
    constructor(provider: string, reason: string) {
      super(`[AI] ${provider} authentication failed — ${reason}`);
      this.name = "AIProviderAuthError";
      this.provider = provider;
    }
  }

  return {
    mockBatchCreate: vi.fn(),
    mockBatchRetrieve: vi.fn(),
    mockBatchResults: vi.fn(),
    mockCallAI: vi.fn(),
    mockDetectLimitError: vi.fn(),
    mockMarkProviderLimited: vi.fn(),
    mockMarkProviderAuthFailed: vi.fn(),
    mockIsProviderAuthFailed: vi.fn().mockReturnValue(false),
    mockParseResetTime: vi.fn(),
    MockAIProviderLimitError,
    MockAIProviderAuthError,
  };
});

// ---------------------------------------------------------------------------
// Mock: Anthropic SDK
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => ({
  // Use regular function (not arrow) so `new Anthropic()` works as a constructor
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        batches: {
          create: mockBatchCreate,
          retrieve: mockBatchRetrieve,
          results: mockBatchResults,
        },
      },
    };
  }),
}));

// ---------------------------------------------------------------------------
// Mock: client.js (used by xAI sequential path and error detection)
// ---------------------------------------------------------------------------

vi.mock("./client.js", () => ({
  callAI: mockCallAI,
  AIProviderLimitError: MockAIProviderLimitError,
  AIProviderAuthError: MockAIProviderAuthError,
  detectLimitError: mockDetectLimitError,
  parseResetTime: mockParseResetTime,
  markProviderLimited: mockMarkProviderLimited,
  markProviderAuthFailed: mockMarkProviderAuthFailed,
  isProviderAuthFailed: mockIsProviderAuthFailed,
  clearProviderLimits: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: cost-tracker.js
// ---------------------------------------------------------------------------

vi.mock("../cost-tracker.js", () => ({
  recordAICall: vi.fn(),
  calculateCost: vi.fn().mockReturnValue(0.001),
  getTrackingDay: vi.fn().mockReturnValue(1),
}));

import { submitBatch, chunkItems, findResult, type BatchRequest } from "./batch-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an async iterable from an array (simulates the Anthropic batch results stream). */
function makeAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0;
      return {
        async next() {
          if (index < items.length) {
            return { value: items[index++], done: false as const };
          }
          return { value: undefined as unknown as T, done: true as const };
        },
      };
    },
  };
}

/** Minimal Anthropic batch succeeded item. */
function makeSucceededItem(customId: string, text: string, inputTokens = 100, outputTokens = 50) {
  return {
    custom_id: customId,
    result: {
      type: "succeeded" as const,
      message: {
        content: [{ type: "text" as const, text }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      },
    },
  };
}

/** Anthropic batch errored item. */
function makeErroredItem(customId: string) {
  return {
    custom_id: customId,
    result: { type: "errored" as const, error: { type: "server_error", message: "Internal error" } },
  };
}

// Anthropic-routed requests (no partyId → defaults to "daily" anthropic model)
const anthropicRequests: BatchRequest[] = [
  { customId: "agent-spd-day5", system: "sys", prompt: "user", maxTokens: 512 },
  { customId: "agent-cdu-day5", system: "sys", prompt: "user", maxTokens: 512 },
];

// xAI-routed request (afd → grok-3-mini)
const xaiRequests: BatchRequest[] = [
  { customId: "agent-afd-day5", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
];

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no limit errors, generic reset time
  mockDetectLimitError.mockReturnValue({ type: "none" });
  mockParseResetTime.mockReturnValue(Date.now() + 600_000);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("XAI_API_KEY", "test-xai-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// chunkItems
// ---------------------------------------------------------------------------

describe("chunkItems", () => {
  it("returns all items in a single chunk when they fit in the budget", () => {
    const chunks = chunkItems(["a", "b", "c"], 1_000, 160_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["a", "b", "c"]);
  });

  it("splits items across multiple chunks when budget is exceeded", () => {
    // 160_000 / 60_000 = 2 per chunk → [0,1], [2,3], [4]
    const items = [0, 1, 2, 3, 4];
    const chunks = chunkItems(items, 60_000, 160_000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual([0, 1]);
    expect(chunks[1]).toEqual([2, 3]);
    expect(chunks[2]).toEqual([4]);
  });

  it("returns empty array for empty input", () => {
    expect(chunkItems([], 1_000, 160_000)).toEqual([]);
  });

  it("always returns at least 1 item per chunk even if it exceeds token budget", () => {
    // 200_000 tokens per item > 160_000 budget → 1 per chunk
    const chunks = chunkItems([1, 2, 3], 200_000, 160_000);
    expect(chunks).toHaveLength(3);
    chunks.forEach(chunk => expect(chunk).toHaveLength(1));
  });
});

// ---------------------------------------------------------------------------
// submitBatch — empty input
// ---------------------------------------------------------------------------

describe("submitBatch — empty requests", () => {
  it("returns empty array immediately without making any API calls", async () => {
    const results = await submitBatch([]);
    expect(results).toEqual([]);
    expect(mockBatchCreate).not.toHaveBeenCalled();
    expect(mockCallAI).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// submitBatch — Anthropic batch
// ---------------------------------------------------------------------------

describe("submitBatch — Anthropic batch", () => {
  it("returns correct results for all succeeded items", async () => {
    mockBatchCreate.mockResolvedValue({
      id: "batch-ok",
      processing_status: "ended",
    });
    mockBatchResults.mockResolvedValue(
      makeAsyncIterable([
        makeSucceededItem("agent-spd-day5", "SPD response", 200, 80),
        makeSucceededItem("agent-cdu-day5", "CDU response", 150, 60),
      ]),
    );

    const results = await submitBatch(anthropicRequests);

    expect(results).toHaveLength(2);
    const spd = results.find(r => r.customId === "agent-spd-day5")!;
    expect(spd.text).toBe("SPD response");
    expect(spd.inputTokens).toBe(200);
    expect(spd.outputTokens).toBe(80);
    expect(spd.provider).toBe("anthropic");

    const cdu = results.find(r => r.customId === "agent-cdu-day5")!;
    expect(cdu.text).toBe("CDU response");
  });

  it("concatenates multiple text blocks in a single result", async () => {
    mockBatchCreate.mockResolvedValue({ id: "batch-multi", processing_status: "ended" });
    mockBatchResults.mockResolvedValue(
      makeAsyncIterable([
        {
          custom_id: "agent-spd-day5",
          result: {
            type: "succeeded" as const,
            message: {
              content: [
                { type: "text" as const, text: "Part one. " },
                { type: "text" as const, text: "Part two." },
              ],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          },
        },
      ]),
    );

    const results = await submitBatch([anthropicRequests[0]]);
    expect(results[0].text).toBe("Part one. Part two.");
  });

  it("returns empty text for errored batch items", async () => {
    mockBatchCreate.mockResolvedValue({ id: "batch-errs", processing_status: "ended" });
    mockBatchResults.mockResolvedValue(
      makeAsyncIterable([
        makeErroredItem("agent-spd-day5"),
        makeSucceededItem("agent-cdu-day5", "CDU ok"),
      ]),
    );

    const results = await submitBatch(anthropicRequests);
    const spd = results.find(r => r.customId === "agent-spd-day5")!;
    const cdu = results.find(r => r.customId === "agent-cdu-day5")!;

    expect(spd.text).toBe("");
    expect(spd.inputTokens).toBe(0);
    expect(cdu.text).toBe("CDU ok");
  });

  it("throws AIProviderLimitError when batch.create hits the spending limit", async () => {
    const limitErr = {
      message: "You have reached your specified API usage limits. You will regain access on 2026-04-01T00:00:00Z",
    };
    mockBatchCreate.mockRejectedValueOnce(limitErr);
    mockDetectLimitError.mockReturnValueOnce({
      type: "hard",
      provider: "anthropic",
      until: "2026-04-01T00:00:00Z",
    });

    await expect(submitBatch(anthropicRequests)).rejects.toThrow(MockAIProviderLimitError);
    expect(mockMarkProviderLimited).toHaveBeenCalledWith(
      "anthropic",
      "2026-04-01T00:00:00Z",
      expect.any(Number),
    );
  });

  it("rethrows non-limit errors from batch.create", async () => {
    const networkErr = new Error("Network connection failed");
    mockBatchCreate.mockRejectedValueOnce(networkErr);
    mockDetectLimitError.mockReturnValueOnce({ type: "none" });

    await expect(submitBatch(anthropicRequests)).rejects.toThrow("Network connection failed");
  });

  it("polls retrieve until status is 'ended', then fetches results", async () => {
    vi.useFakeTimers();

    mockBatchCreate.mockResolvedValue({
      id: "batch-poll",
      processing_status: "processing",
    });

    // First two polls: still processing; third: ended
    mockBatchRetrieve
      .mockResolvedValueOnce({
        processing_status: "processing",
        request_counts: { succeeded: 0, processing: 2, errored: 0 },
      })
      .mockResolvedValueOnce({
        processing_status: "processing",
        request_counts: { succeeded: 1, processing: 1, errored: 0 },
      })
      .mockResolvedValueOnce({
        processing_status: "ended",
        request_counts: { succeeded: 2, processing: 0, errored: 0 },
      });

    mockBatchResults.mockResolvedValue(
      makeAsyncIterable([
        makeSucceededItem("agent-spd-day5", "SPD done"),
        makeSucceededItem("agent-cdu-day5", "CDU done"),
      ]),
    );

    const batchPromise = submitBatch(anthropicRequests);
    // Advance through 3 poll intervals (default 60s each → 180s)
    await vi.advanceTimersByTimeAsync(3 * 60_000 + 100);
    const results = await batchPromise;

    expect(mockBatchRetrieve).toHaveBeenCalledTimes(3);
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("SPD done");
  });

  it("throws timeout error when batch never reaches 'ended' status", async () => {
    vi.useFakeTimers();

    mockBatchCreate.mockResolvedValue({
      id: "batch-timeout",
      processing_status: "processing",
    });
    mockBatchRetrieve.mockResolvedValue({
      processing_status: "processing",
      request_counts: { succeeded: 0, processing: 2, errored: 0 },
    });

    const batchPromise = submitBatch(anthropicRequests);
    // Attach .catch immediately to prevent unhandled rejection warning before assertion
    const settled = batchPromise.catch(e => e);
    // Advance beyond default BATCH_TIMEOUT_MS (5400s) + extra headroom
    await vi.advanceTimersByTimeAsync(6_000_000);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/timed out/);
  });
});

// ---------------------------------------------------------------------------
// submitBatch — xAI sequential fallback
// ---------------------------------------------------------------------------

describe("submitBatch — xAI sequential fallback", () => {
  it("returns results from sequential callAI for xAI requests", async () => {
    mockCallAI.mockResolvedValueOnce({
      text: "AfD response",
      model: "grok-3-mini",
      provider: "xai",
      inputTokens: 100,
      outputTokens: 40,
    });

    const results = await submitBatch(xaiRequests);

    expect(results).toHaveLength(1);
    expect(results[0].customId).toBe("agent-afd-day5");
    expect(results[0].text).toBe("AfD response");
    expect(results[0].provider).toBe("xai");
    expect(results[0].inputTokens).toBe(100);
  });

  it("pushes empty result and continues when an individual callAI throws", async () => {
    const twoXaiRequests: BatchRequest[] = [
      { customId: "xai-1", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
      { customId: "xai-2", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
    ];

    mockCallAI
      .mockRejectedValueOnce(new Error("xAI internal error"))
      .mockResolvedValueOnce({
        text: "second ok",
        model: "grok-3-mini",
        provider: "xai",
        inputTokens: 50,
        outputTokens: 20,
      });

    const results = await submitBatch(twoXaiRequests);

    expect(results).toHaveLength(2);
    expect(results[0].customId).toBe("xai-1");
    expect(results[0].text).toBe(""); // empty on failure
    expect(results[1].customId).toBe("xai-2");
    expect(results[1].text).toBe("second ok");
  });

  it("breaks the sequential loop when callAI throws AIProviderLimitError", async () => {
    const threeXaiRequests: BatchRequest[] = [
      { customId: "xai-1", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
      { customId: "xai-2", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
      { customId: "xai-3", system: "sys", prompt: "user", maxTokens: 512, partyId: "afd" },
    ];

    mockCallAI
      .mockResolvedValueOnce({
        text: "first ok",
        model: "grok-3-mini",
        provider: "xai",
        inputTokens: 50,
        outputTokens: 20,
      })
      .mockRejectedValueOnce(new MockAIProviderLimitError("xai", "2026-04-01T00:00:00Z"));
    // xai-3 should never be called

    const results = await submitBatch(threeXaiRequests);

    // First result present, second empty (limit error), third not attempted
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe("first ok");
    expect(results[1].text).toBe(""); // limit error → empty
    expect(mockCallAI).toHaveBeenCalledTimes(2); // xai-3 never reached
  });

  it("returns empty array when xAI-only batch starts with limit error", async () => {
    mockCallAI.mockRejectedValueOnce(
      new MockAIProviderLimitError("xai", "2026-04-01T00:00:00Z"),
    );

    const results = await submitBatch(xaiRequests);

    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("");
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// submitBatch — mixed providers
// ---------------------------------------------------------------------------

describe("submitBatch — mixed providers (Anthropic + xAI)", () => {
  it("routes anthropic requests to batch API and xAI requests to sequential calls", async () => {
    const mixedRequests: BatchRequest[] = [...anthropicRequests, ...xaiRequests];

    // Anthropic batch
    mockBatchCreate.mockResolvedValue({ id: "batch-mixed", processing_status: "ended" });
    mockBatchResults.mockResolvedValue(
      makeAsyncIterable([
        makeSucceededItem("agent-spd-day5", "SPD"),
        makeSucceededItem("agent-cdu-day5", "CDU"),
      ]),
    );

    // xAI sequential
    mockCallAI.mockResolvedValueOnce({
      text: "AfD",
      model: "grok-3-mini",
      provider: "xai",
      inputTokens: 80,
      outputTokens: 30,
    });

    const results = await submitBatch(mixedRequests);

    expect(results).toHaveLength(3);
    const ids = results.map(r => r.customId);
    expect(ids).toContain("agent-spd-day5");
    expect(ids).toContain("agent-cdu-day5");
    expect(ids).toContain("agent-afd-day5");

    // Both paths were used
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// findResult (utility)
// ---------------------------------------------------------------------------

describe("findResult", () => {
  const results = [
    { customId: "a", text: "A", model: "haiku", provider: "anthropic" as const, inputTokens: 10, outputTokens: 5 },
    { customId: "b", text: "", model: "haiku", provider: "anthropic" as const, inputTokens: 0, outputTokens: 0 },
  ];

  it("finds result by customId", () => {
    expect(findResult(results, "a")?.text).toBe("A");
  });

  it("returns undefined for unknown customId", () => {
    expect(findResult(results, "z")).toBeUndefined();
  });

  it("finds result with empty text", () => {
    expect(findResult(results, "b")).toBeDefined();
    expect(findResult(results, "b")?.text).toBe("");
  });
});
