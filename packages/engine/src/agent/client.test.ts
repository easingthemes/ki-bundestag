/**
 * E2E tests for callAI — covers all mock states: success, hard API limit,
 * transient 429 retry, network error retry, retry exhaustion, and circuit breaker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks (hoisted before imports) ---

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn().mockReturnValue({ _type: "mock-anthropic-model" }),
}));

vi.mock("@ai-sdk/xai", () => ({
  xai: vi.fn().mockReturnValue({ _type: "mock-xai-model" }),
}));

vi.mock("../cost-tracker.js", () => ({
  recordAICall: vi.fn(),
  calculateCost: vi.fn().mockReturnValue(0.001),
  getTrackingDay: vi.fn().mockReturnValue(1),
}));

import { generateText } from "ai";
import {
  detectLimitError,
  callAI,
  AIProviderLimitError,
  AIProviderAuthError,
  clearProviderLimits,
  markProviderLimited,
  markProviderAuthFailed,
  allProvidersUnavailable,
  parseResetTime,
} from "./client.js";

const mockGenerateText = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// detectLimitError
// ---------------------------------------------------------------------------

describe("detectLimitError", () => {
  it("returns 'none' for null input", () => {
    expect(detectLimitError(null)).toEqual({ type: "none" });
  });

  it("returns 'none' for string input", () => {
    expect(detectLimitError("error string")).toEqual({ type: "none" });
  });

  it("detects hard limit from responseBody", () => {
    const err = {
      responseBody:
        "You have reached your specified API usage limits. You will regain access on 2026-04-01T12:00:00Z",
    };
    const result = detectLimitError(err);
    expect(result.type).toBe("hard");
    if (result.type === "hard") {
      expect(result.until).toBe("2026-04-01T12:00:00Z");
      expect(result.provider).toBe("anthropic");
    }
  });

  it("detects hard limit from data field (JSON-stringified)", () => {
    const err = {
      data: {
        message:
          "usage limits reached. You will regain access on 2026-04-02T08:00:00Z",
      },
    };
    const result = detectLimitError(err);
    expect(result.type).toBe("hard");
    if (result.type === "hard") {
      expect(result.until).toBe("2026-04-02T08:00:00Z");
    }
  });

  it("detects hard limit from message field when responseBody absent", () => {
    const err = {
      message:
        "API usage limit reached. You will regain access on 2026-05-01T00:00:00Z",
    };
    const result = detectLimitError(err);
    expect(result.type).toBe("hard");
  });

  it("detects transient 429 rate-limit error", () => {
    const result = detectLimitError({ statusCode: 429 });
    expect(result.type).toBe("transient");
    if (result.type === "transient") {
      expect(result.provider).toBe("anthropic");
    }
  });

  it("detects network error by ECONNRESET code", () => {
    expect(detectLimitError({ code: "ECONNRESET" }).type).toBe("transient");
  });

  it("detects network error by ETIMEDOUT code", () => {
    expect(detectLimitError({ code: "ETIMEDOUT" }).type).toBe("transient");
  });

  it("detects network error by ENOTFOUND code", () => {
    expect(detectLimitError({ code: "ENOTFOUND" }).type).toBe("transient");
  });

  it("detects network error by 'fetch failed' message", () => {
    expect(detectLimitError({ message: "fetch failed" }).type).toBe(
      "transient",
    );
  });

  it("detects network error by 'socket hang up' message", () => {
    expect(detectLimitError({ message: "socket hang up" }).type).toBe(
      "transient",
    );
  });

  it("identifies xAI provider from x.ai URL on 429", () => {
    const err = { statusCode: 429, url: "https://api.x.ai/v1/messages" };
    const result = detectLimitError(err);
    expect(result.type).toBe("transient");
    if (result.type === "transient") {
      expect(result.provider).toBe("xai");
    }
  });

  it("identifies xAI provider from hard limit on x.ai URL", () => {
    const err = {
      url: "https://api.x.ai/v1/messages",
      responseBody:
        "usage limits. You will regain access on 2026-04-01T00:00:00Z",
    };
    const result = detectLimitError(err);
    if (result.type === "hard") {
      expect(result.provider).toBe("xai");
    }
  });

  it("detects 401 Unauthorized as auth error", () => {
    const result = detectLimitError({ status: 401, message: "Unauthorized" });
    expect(result.type).toBe("auth");
    if (result.type === "auth") {
      expect(result.reason).toContain("invalid or expired API key");
      expect(result.provider).toBe("anthropic");
    }
  });

  it("detects 403 Forbidden as auth error", () => {
    const result = detectLimitError({ status: 403, message: "Forbidden" });
    expect(result.type).toBe("auth");
    if (result.type === "auth") {
      expect(result.reason).toContain("access denied or key revoked");
    }
  });

  it("detects 402 Payment Required as auth error", () => {
    const result = detectLimitError({ statusCode: 402, message: "Payment Required" });
    expect(result.type).toBe("auth");
    if (result.type === "auth") {
      expect(result.reason).toContain("billing issue");
    }
  });

  it("detects Anthropic SDK AuthenticationError by class name", () => {
    const result = detectLimitError({ name: "AuthenticationError", message: "invalid x-api-key" });
    expect(result.type).toBe("auth");
    if (result.type === "auth") {
      expect(result.reason).toContain("AuthenticationError");
    }
  });

  it("detects xAI auth error from x.ai URL", () => {
    const result = detectLimitError({ status: 401, url: "https://api.x.ai/v1/messages" });
    expect(result.type).toBe("auth");
    if (result.type === "auth") {
      expect(result.provider).toBe("xai");
    }
  });

  it("returns 'none' for generic 500 server error", () => {
    expect(detectLimitError({ statusCode: 500, message: "Internal Server Error" }).type).toBe("none");
  });

  it("returns 'none' for unknown object error", () => {
    expect(detectLimitError({ something: "unexpected" }).type).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// parseResetTime
// ---------------------------------------------------------------------------

describe("parseResetTime", () => {
  it("parses valid future ISO date string", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const result = parseResetTime(future);
    expect(result).toBeGreaterThan(Date.now());
    expect(result).toBeLessThanOrEqual(Date.now() + 3_600_001);
  });

  it("defaults to ~10 minutes for invalid date string", () => {
    const before = Date.now();
    const result = parseResetTime("not-a-date");
    expect(result).toBeGreaterThanOrEqual(before + 9 * 60_000);
    expect(result).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 100);
  });

  it("defaults to ~10 minutes for past date", () => {
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const result = parseResetTime(past);
    expect(result).toBeGreaterThan(Date.now());
  });
});

// ---------------------------------------------------------------------------
// callAI
// ---------------------------------------------------------------------------

describe("callAI", () => {
  beforeEach(() => {
    clearProviderLimits();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("XAI_API_KEY", "test-xai-key");
    mockGenerateText.mockResolvedValue({
      text: "test response",
      usage: { inputTokens: 100, outputTokens: 50 },
    } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);
  });

  afterEach(() => {
    clearProviderLimits();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("returns text and token counts on successful call", async () => {
    const result = await callAI({
      system: "you are helpful",
      prompt: "hello",
      maxTokens: 100,
      roleKey: "daily",
    });
    expect(result.text).toBe("test response");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.provider).toBe("anthropic");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("uses partyId to select party model", async () => {
    await callAI({ system: "sys", prompt: "user", maxTokens: 100, partyId: "spd" });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("throws AIProviderLimitError immediately when provider is pre-marked limited", async () => {
    markProviderLimited("anthropic", "2099-01-01T00:00:00Z", Date.now() + 3_600_000);

    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderLimitError);

    // generateText should never be reached
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("detects hard limit error from API response → marks provider → throws AIProviderLimitError", async () => {
    mockGenerateText.mockRejectedValueOnce({
      responseBody:
        "You have reached your specified API usage limits. You will regain access on 2026-04-01T00:00:00Z",
    });

    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderLimitError);

    // Circuit breaker should now block further calls
    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderLimitError);

    // generateText called only once — second call blocked by circuit breaker
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("retries once on 429 transient error, then succeeds", async () => {
    mockGenerateText
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValueOnce({
        text: "retry success",
        usage: { inputTokens: 10, outputTokens: 5 },
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    vi.useFakeTimers();
    const promise = callAI({ system: "sys", prompt: "user", maxTokens: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe("retry success");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("retries twice on repeated 429, then throws after exhausting retries", async () => {
    mockGenerateText.mockRejectedValue({ statusCode: 429 });

    vi.useFakeTimers();
    const promise = callAI({ system: "sys", prompt: "user", maxTokens: 100 });
    // Attach .catch immediately to prevent unhandled rejection warning
    const settled = promise.catch(e => e);
    await vi.runAllTimersAsync();

    const error = await settled;
    expect(error).toMatchObject({ statusCode: 429 });
    // 1 initial + 2 retries = 3 calls total
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("retries on network error (ECONNRESET), then succeeds", async () => {
    mockGenerateText
      .mockRejectedValueOnce({ code: "ECONNRESET", message: "socket hang up" })
      .mockResolvedValueOnce({
        text: "network retry ok",
        usage: { inputTokens: 20, outputTokens: 10 },
      } as ReturnType<typeof generateText> extends Promise<infer T> ? T : never);

    vi.useFakeTimers();
    const promise = callAI({ system: "sys", prompt: "user", maxTokens: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.text).toBe("network retry ok");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("retries on 'fetch failed' message, exhausts retries, then throws", async () => {
    mockGenerateText.mockRejectedValue({ message: "fetch failed: connection refused" });

    vi.useFakeTimers();
    const promise = callAI({ system: "sys", prompt: "user", maxTokens: 100 });
    // Attach .catch immediately to prevent unhandled rejection warning
    const settled = promise.catch(e => e);
    await vi.runAllTimersAsync();

    const error = await settled;
    expect(error).toMatchObject({ message: expect.stringContaining("fetch failed") });
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });

  it("does not retry on generic non-transient errors", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("Internal server error"));

    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow("Internal server error");

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("detects 401 auth error → marks provider → throws AIProviderAuthError", async () => {
    mockGenerateText.mockRejectedValueOnce({
      status: 401,
      message: "invalid x-api-key",
      name: "AuthenticationError",
    });

    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderAuthError);

    // Circuit breaker should now block further calls without hitting the API
    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderAuthError);

    // generateText called only once — second call blocked by auth circuit breaker
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 auth errors", async () => {
    mockGenerateText.mockRejectedValueOnce({ status: 401, message: "Unauthorized" });

    await expect(
      callAI({ system: "sys", prompt: "user", maxTokens: 100 }),
    ).rejects.toThrow(AIProviderAuthError);

    // No retries — auth errors are immediately fatal
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("clears expired circuit breaker and retries the call", async () => {
    // Mark as limited but with a resetAt in the past
    markProviderLimited("anthropic", "2020-01-01T00:00:00Z", Date.now() - 1);

    // callAI should clear the expired limit and proceed
    const result = await callAI({ system: "sys", prompt: "user", maxTokens: 100 });
    expect(result.text).toBe("test response");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// allProvidersUnavailable
// ---------------------------------------------------------------------------

describe("allProvidersUnavailable", () => {
  beforeEach(() => {
    clearProviderLimits();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("XAI_API_KEY", "test-xai-key");
  });

  afterEach(() => {
    clearProviderLimits();
    vi.unstubAllEnvs();
  });

  it("returns false when no providers are failed", () => {
    expect(allProvidersUnavailable()).toBe(false);
  });

  it("returns false when only one provider is auth-failed (other is available)", () => {
    markProviderAuthFailed("anthropic");
    expect(allProvidersUnavailable()).toBe(false);
  });

  it("returns true when all providers are auth-failed", () => {
    markProviderAuthFailed("anthropic");
    markProviderAuthFailed("xai");
    expect(allProvidersUnavailable()).toBe(true);
  });

  it("returns true when one is auth-failed and other is limited", () => {
    markProviderAuthFailed("anthropic");
    markProviderLimited("xai", "2099-01-01T00:00:00Z", Date.now() + 3_600_000);
    expect(allProvidersUnavailable()).toBe(true);
  });
});
