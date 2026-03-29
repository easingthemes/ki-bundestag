import { describe, it, expect, afterEach, vi } from "vitest";
import { getPartyModel, getRoleModel, PARTY_MODELS, ROLE_MODELS } from "./model-config.js";

describe("getPartyModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configured model for known party", () => {
    const config = getPartyModel("spd");
    expect(config).toEqual(PARTY_MODELS.spd);
    expect(config.provider).toBe("anthropic");
  });

  it("returns xai model for AfD", () => {
    const config = getPartyModel("afd");
    expect(config.provider).toBe("xai");
  });

  it("falls back to daily role model for unknown party", () => {
    const config = getPartyModel("pirates");
    expect(config).toEqual(ROLE_MODELS.daily);
  });

  it("respects env var override", () => {
    vi.stubEnv("MODEL_PARTY_SPD", "xai:grok-4");
    const config = getPartyModel("spd");
    expect(config).toEqual({ provider: "xai", model: "grok-4" });
  });
});

describe("getRoleModel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configured model for known role", () => {
    const config = getRoleModel("synthesis");
    expect(config.provider).toBe("anthropic");
    expect(config.model).toContain("sonnet");
  });

  it("respects env var override with provider:model format", () => {
    vi.stubEnv("MODEL_SYNTHESIS", "xai:grok-4");
    const config = getRoleModel("synthesis");
    expect(config).toEqual({ provider: "xai", model: "grok-4" });
  });

  it("assumes anthropic provider when env var has no colon", () => {
    vi.stubEnv("MODEL_DAILY", "claude-haiku-4-5-20251001");
    const config = getRoleModel("daily");
    expect(config).toEqual({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  });
});
