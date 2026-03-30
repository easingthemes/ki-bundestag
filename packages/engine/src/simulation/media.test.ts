import { describe, it, expect } from "vitest";
import { mediaSentimentImpact } from "./media.js";

// Note: buildMediaBatchRequest and processMediaBatchResult need DB mocks
// so we test the pure functions here. The NEWSWORTHY_TYPES filtering is
// covered indirectly via the mediaSentimentImpact tests.

describe("mediaSentimentImpact", () => {
  it("returns negative impact for crisis articles", () => {
    const articles = [{ category: "crisis" }, { category: "crisis" }];
    expect(mediaSentimentImpact(articles)).toBe(-0.4);
  });

  it("returns positive impact for economy/policy articles", () => {
    const articles = [{ category: "economy" }, { category: "policy" }];
    expect(mediaSentimentImpact(articles)).toBe(0.2);
  });

  it("caps at -0.5 for many crisis articles", () => {
    const articles = Array(10).fill({ category: "crisis" });
    expect(mediaSentimentImpact(articles)).toBe(-0.5);
  });

  it("caps at +0.5 for many positive articles", () => {
    const articles = Array(10).fill({ category: "economy" });
    expect(mediaSentimentImpact(articles)).toBe(0.5);
  });

  it("returns 0 for non-impactful categories", () => {
    const articles = [{ category: "politics" }, { category: "culture" }];
    expect(mediaSentimentImpact(articles)).toBe(0);
  });

  it("returns 0 for empty articles", () => {
    expect(mediaSentimentImpact([])).toBe(0);
  });

  it("nets out mixed articles", () => {
    // 2 crisis (-0.4) + 3 economy (+0.3) = -0.1
    const articles = [
      { category: "crisis" }, { category: "crisis" },
      { category: "economy" }, { category: "economy" }, { category: "economy" },
    ];
    expect(mediaSentimentImpact(articles)).toBe(-0.1);
  });
});
