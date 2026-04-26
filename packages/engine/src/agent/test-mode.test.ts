import { describe, it, expect, afterEach, vi } from "vitest";
import { getTestMode, _resetTestModeCache } from "./test-mode.js";

describe("getTestMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    _resetTestModeCache();
  });

  it("returns null when TEST_MODE is unset", () => {
    expect(getTestMode()).toBeNull();
  });

  it("resolves the ollama preset", () => {
    vi.stubEnv("TEST_MODE", "ollama");
    const cfg = getTestMode();
    expect(cfg).not.toBeNull();
    expect(cfg!.preset).toBe("ollama");
    expect(cfg!.baseURL).toBe("http://localhost:11434/v1");
    expect(cfg!.model).toEqual({ provider: "openai-compatible", model: "gemma3:4b" });
    expect(cfg!.apiKey).toBe("");
  });

  it("resolves the groq preset and reads GROQ_API_KEY", () => {
    vi.stubEnv("TEST_MODE", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const cfg = getTestMode();
    expect(cfg!.preset).toBe("groq");
    expect(cfg!.baseURL).toBe("https://api.groq.com/openai/v1");
    expect(cfg!.model.model).toBe("llama-3.3-70b-versatile");
    expect(cfg!.apiKey).toBe("gsk_test");
  });

  it("allows TEST_MODEL / TEST_BASE_URL / TEST_API_KEY overrides", () => {
    vi.stubEnv("TEST_MODE", "ollama");
    vi.stubEnv("TEST_MODEL", "qwen3:8b");
    vi.stubEnv("TEST_BASE_URL", "http://other:9000/v1");
    vi.stubEnv("TEST_API_KEY", "k");
    const cfg = getTestMode();
    expect(cfg!.model.model).toBe("qwen3:8b");
    expect(cfg!.baseURL).toBe("http://other:9000/v1");
    expect(cfg!.apiKey).toBe("k");
  });

  it("requires TEST_BASE_URL + TEST_MODEL when mode=custom", () => {
    vi.stubEnv("TEST_MODE", "custom");
    expect(() => getTestMode()).toThrow(/TEST_BASE_URL and TEST_MODEL/);
  });

  it("accepts custom mode with explicit knobs", () => {
    vi.stubEnv("TEST_MODE", "custom");
    vi.stubEnv("TEST_BASE_URL", "http://my-proxy/v1");
    vi.stubEnv("TEST_MODEL", "my-model");
    const cfg = getTestMode();
    expect(cfg!.preset).toBe("custom");
    expect(cfg!.baseURL).toBe("http://my-proxy/v1");
    expect(cfg!.model.model).toBe("my-model");
  });

  it("rejects unknown TEST_MODE values", () => {
    vi.stubEnv("TEST_MODE", "bogus");
    expect(() => getTestMode()).toThrow(/Unknown TEST_MODE/);
  });
});
