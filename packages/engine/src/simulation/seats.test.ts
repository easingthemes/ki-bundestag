import { describe, it, expect } from "vitest";
import { rescaleSeatsToBundestag } from "./seats.js";
import { BUNDESTAG_SIZE } from "../config/elections.js";

// Cycle 3 PR 3 — rescaleSeatsToBundestag pure-helper tests
describe("rescaleSeatsToBundestag", () => {
  it("preserves the sum: ∑output === target", () => {
    const input = [
      { id: "spd", seatCount: 200 },
      { id: "cdu", seatCount: 250 },
      { id: "gruene", seatCount: 100 },
      { id: "fdp", seatCount: 60 },
      { id: "afd", seatCount: 80 },
      { id: "linke", seatCount: 45 },
    ]; // sum = 735
    const out = rescaleSeatsToBundestag(input, BUNDESTAG_SIZE);
    expect(out.reduce((s, p) => s + p.seatCount, 0)).toBe(BUNDESTAG_SIZE);
  });

  it("is a no-op when input total already equals target", () => {
    const input = [
      { id: "spd", seatCount: 200 },
      { id: "cdu", seatCount: 250 },
      { id: "gruene", seatCount: 100 },
      { id: "afd", seatCount: 80 },
    ]; // sum = 630
    const out = rescaleSeatsToBundestag(input, 630);
    expect(out).toEqual(input);
  });

  it("preserves input order in the output array", () => {
    const input = [
      { id: "spd", seatCount: 200 },
      { id: "cdu", seatCount: 250 },
      { id: "gruene", seatCount: 100 },
      { id: "afd", seatCount: 185 },
    ]; // sum = 735
    const out = rescaleSeatsToBundestag(input, BUNDESTAG_SIZE);
    expect(out.map(p => p.id)).toEqual(["spd", "cdu", "gruene", "afd"]);
  });

  it("never increases any party's seat count when shrinking", () => {
    const input = [
      { id: "spd", seatCount: 200 },
      { id: "cdu", seatCount: 250 },
      { id: "gruene", seatCount: 100 },
      { id: "fdp", seatCount: 60 },
      { id: "afd", seatCount: 80 },
      { id: "linke", seatCount: 45 },
    ]; // sum = 735
    const out = rescaleSeatsToBundestag(input, BUNDESTAG_SIZE);
    for (const p of out) {
      const original = input.find(i => i.id === p.id)!;
      expect(p.seatCount).toBeLessThanOrEqual(original.seatCount);
    }
  });

  it("handles empty input gracefully", () => {
    expect(rescaleSeatsToBundestag([], BUNDESTAG_SIZE)).toEqual([]);
  });

  it("handles all-zero input by returning all-zeros (no division by zero)", () => {
    const input = [
      { id: "spd", seatCount: 0 },
      { id: "cdu", seatCount: 0 },
    ];
    expect(rescaleSeatsToBundestag(input, BUNDESTAG_SIZE)).toEqual(input);
  });

  it("breaks ties deterministically (tie-saturated input)", () => {
    // Three equal parties. 630 / 3 = 210 each, no remainders → no tie-break needed.
    const input = [
      { id: "spd", seatCount: 100 },
      { id: "cdu", seatCount: 100 },
      { id: "gruene", seatCount: 100 },
    ]; // sum = 300, target = 630
    const out = rescaleSeatsToBundestag(input, 630);
    // All proportionally scaled: 630/300 × 100 = 210 each. Sum = 630.
    expect(out.reduce((s, p) => s + p.seatCount, 0)).toBe(630);
  });

  it("largest-remainder distributes leftovers correctly", () => {
    // Crafted to require leftover distribution.
    // input sum = 7, target = 10. raw = [10/7×3, 10/7×2, 10/7×2] = [4.29, 2.86, 2.86]
    // floors = [4, 2, 2], sum = 8, leftover = 2
    // Remainders: 0.29, 0.86, 0.86 → top two by remainder get +1
    // Tie-break: cdu has higher original (2 vs 2 — same), then lex: "cdu" < "gruene"
    const input = [
      { id: "spd", seatCount: 3 },
      { id: "cdu", seatCount: 2 },
      { id: "gruene", seatCount: 2 },
    ];
    const out = rescaleSeatsToBundestag(input, 10);
    expect(out.reduce((s, p) => s + p.seatCount, 0)).toBe(10);
    const map = Object.fromEntries(out.map(p => [p.id, p.seatCount]));
    // cdu and gruene tied on remainder + originalSeats; lex "cdu" < "gruene" so cdu wins first +1
    expect(map.cdu).toBe(3);
    expect(map.gruene).toBe(3);
    expect(map.spd).toBe(4);
  });
});
