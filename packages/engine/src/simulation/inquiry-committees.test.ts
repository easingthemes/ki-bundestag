import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drizzle-orm — only `eq` is used.
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

// Controllable SQLite mock.
//
// `mockState.lastInquiryFiledDay` is read by `readLastInquiryFiledDay`;
// `mockState.activeCount` is read by `countActiveInquiries`;
// `mockState.partyActiveCount` is read by `countActiveInquiriesByParty`;
// `mockState.activeRows` is read by `listActiveInquiries`;
// `mockState.recordedInserts` and `recordedUpdates` capture writes for assertions.
//
// Each test resets `mockState` in `beforeEach`.
interface MockState {
  lastInquiryFiledDay: number | null;
  activeCount: number;
  partyActiveCount: number;
  activeRows: Array<Record<string, unknown>>;
  recordedInserts: Array<Record<string, unknown>>;
  recordedUpdates: Array<{ where: unknown; set: Record<string, unknown> }>;
  recordedMetaUpdates: Array<Record<string, unknown>>;
}

const mockState: MockState = {
  lastInquiryFiledDay: null,
  activeCount: 0,
  partyActiveCount: 0,
  activeRows: [],
  recordedInserts: [],
  recordedUpdates: [],
  recordedMetaUpdates: [],
};

function resetMock(): void {
  mockState.lastInquiryFiledDay = null;
  mockState.activeCount = 0;
  mockState.partyActiveCount = 0;
  mockState.activeRows = [];
  mockState.recordedInserts = [];
  mockState.recordedUpdates = [];
  mockState.recordedMetaUpdates = [];
}

vi.mock("../db/index.js", () => {
  const fakeSqlite = {
    prepare(sql: string) {
      return {
        all: () => {
          if (sql.includes("WHERE status = 'active'")) {
            return mockState.activeRows;
          }
          return [];
        },
        get: (..._args: unknown[]) => {
          if (sql.includes("COUNT(*)") && sql.includes("filing_party_id")) {
            return { n: mockState.partyActiveCount };
          }
          if (sql.includes("COUNT(*)")) {
            return { n: mockState.activeCount };
          }
          if (sql.includes("last_inquiry_filed_day")) {
            return { last_inquiry_filed_day: mockState.lastInquiryFiledDay };
          }
          if (sql.includes("FROM inquiry_committees WHERE id")) {
            return undefined; // not used in these tests
          }
          return undefined;
        },
        run: (..._args: unknown[]) => ({ changes: 0 }),
      };
    },
    transaction(fn: () => void) {
      // better-sqlite3 transaction() returns a callable; calling it executes fn.
      return () => fn();
    },
  };

  // Drizzle DB stub: insert/update return chainable builders that record into mockState.
  const fakeDb = {
    insert: (_tbl: unknown) => ({
      values: (vals: Record<string, unknown>) => ({
        run: () => {
          mockState.recordedInserts.push(vals);
          return { changes: 1 };
        },
      }),
    }),
    update: (tbl: unknown) => {
      const isMeta = String((tbl as { _?: { name?: string } })?._?.name ?? "")
        .includes("simulation_meta");
      return {
        set: (set: Record<string, unknown>) => ({
          where: (where: unknown) => ({
            run: () => {
              mockState.recordedUpdates.push({ where, set });
              return { changes: 1 };
            },
          }),
          // Some callers chain .run() directly without .where() (e.g. blanket meta updates).
          run: () => {
            if (isMeta) mockState.recordedMetaUpdates.push(set);
            else mockState.recordedUpdates.push({ where: null, set });
            return { changes: 1 };
          },
        }),
      };
    },
  };

  return {
    getSqlite: () => fakeSqlite,
    getDb: () => fakeDb,
    schema: {
      inquiryCommittees: { _: { name: "inquiry_committees" } },
      simulationMeta: { _: { name: "simulation_meta" } },
    },
  };
});

import {
  pickInquiryOutcome,
  shouldFireHearing,
  shouldWatchdogConclude,
  findInquiryOpportunity,
  fileInquiry,
  concludeInquiry,
  type InquiryCommittee,
} from "./inquiry-committees.js";
import {
  INQUIRY_DURATION_MIN, INQUIRY_DURATION_MAX,
  INQUIRY_HEARING_INTERVAL,
  INQUIRY_MAX_ACTIVE,
  INQUIRY_MIN_DAYS_BETWEEN_FILINGS,
  INQUIRY_WATCHDOG_GRACE_DAYS,
  INQUIRY_FILER_FILING_BONUS,
  INQUIRY_WRONGDOING_TARGET_IMPACT,
  INQUIRY_WRONGDOING_FILER_IMPACT,
  INQUIRY_CLEARED_TARGET_IMPACT,
  INQUIRY_CLEARED_FILER_IMPACT,
} from "../config/parliament.js";
import type { Crisis, Government, Party } from "@ki-bundestag/types";

beforeEach(() => resetMock());

// Linear-congruential RNG for deterministic tests (project pattern).
function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function makeInquiry(over: Partial<InquiryCommittee> = {}): InquiryCommittee {
  return {
    id: "inq-1",
    subject: "Test",
    filingPartyId: "linke",
    targetPartyId: "spd",
    targetMinistry: null,
    filedOnDay: 0,
    scheduledEndDay: 200,
    concludedOnDay: null,
    status: "active",
    outcome: null,
    finalReport: null,
    hearingCount: 0,
    lastHearingDay: null,
    ...over,
  };
}

function makeParty(id: string, over: Partial<Party> = {}): Party {
  return {
    id, name: id.toUpperCase(), color: "#000",
    ideology: "centrist",
    seatCount: 100,
    approvalRating: 30,
    policyPriorities: { economy: 5, social: 5, environment: 5, immigration: 5, spending: 5 },
    coalitionRole: "opposition",
    inactiveDays: 0,
    ...over,
  } as Party;
}

// ── pickInquiryOutcome ───────────────────────────────────────────────────

describe("pickInquiryOutcome", () => {
  // Test 1: 50_000-trial LCG convergence at three approval tiers.
  it("converges to 70% wrongdoing-found at govt approval < 30", () => {
    const rng = makeRng(42);
    let wrongdoing = 0;
    for (let i = 0; i < 50_000; i++) {
      if (pickInquiryOutcome(20, rng) === "wrongdoing_found") wrongdoing++;
    }
    const ratio = wrongdoing / 50_000;
    // Expected 0.70, ±1.5pp tolerance.
    expect(ratio).toBeGreaterThan(0.685);
    expect(ratio).toBeLessThan(0.715);
  });

  it("converges to 40% wrongdoing-found at govt approval 30..50", () => {
    const rng = makeRng(43);
    let wrongdoing = 0;
    for (let i = 0; i < 50_000; i++) {
      if (pickInquiryOutcome(40, rng) === "wrongdoing_found") wrongdoing++;
    }
    const ratio = wrongdoing / 50_000;
    expect(ratio).toBeGreaterThan(0.385);
    expect(ratio).toBeLessThan(0.415);
  });

  it("converges to 20% wrongdoing-found at govt approval > 50", () => {
    const rng = makeRng(44);
    let wrongdoing = 0;
    for (let i = 0; i < 50_000; i++) {
      if (pickInquiryOutcome(60, rng) === "wrongdoing_found") wrongdoing++;
    }
    const ratio = wrongdoing / 50_000;
    expect(ratio).toBeGreaterThan(0.185);
    expect(ratio).toBeLessThan(0.215);
  });

  // Test 2: boundary determinism with seeded rng.
  it("is deterministic at boundary points with seeded rng", () => {
    // At approval=30 (boundary), the <30 branch is NOT taken — falls into the
    // 30..50 branch with prob=0.4. rng=0.39 fires (< 0.4 = wrongdoing); rng=0.41 misses.
    expect(pickInquiryOutcome(30, () => 0.39)).toBe("wrongdoing_found");
    expect(pickInquiryOutcome(30, () => 0.41)).toBe("cleared");
    // At approval=50 (boundary), the <=50 branch is taken with prob=0.4.
    expect(pickInquiryOutcome(50, () => 0.39)).toBe("wrongdoing_found");
    expect(pickInquiryOutcome(50, () => 0.41)).toBe("cleared");
    // At approval=29.999, the <30 branch with prob=0.7.
    expect(pickInquiryOutcome(29.999, () => 0.69)).toBe("wrongdoing_found");
    expect(pickInquiryOutcome(29.999, () => 0.71)).toBe("cleared");
    // At approval=50.001, the >50 branch with prob=0.2.
    expect(pickInquiryOutcome(50.001, () => 0.19)).toBe("wrongdoing_found");
    expect(pickInquiryOutcome(50.001, () => 0.21)).toBe("cleared");
  });
});

// ── shouldFireHearing ────────────────────────────────────────────────────

describe("shouldFireHearing", () => {
  // Test 3: fires on day filedOnDay+30 and +60, not on +29.
  it("fires every INQUIRY_HEARING_INTERVAL days from filedOnDay", () => {
    const inq = makeInquiry({ filedOnDay: 0, scheduledEndDay: 200 });
    expect(shouldFireHearing(inq, INQUIRY_HEARING_INTERVAL - 1)).toBe(false);
    expect(shouldFireHearing(inq, INQUIRY_HEARING_INTERVAL)).toBe(true);

    const after1 = makeInquiry({ ...inq, lastHearingDay: INQUIRY_HEARING_INTERVAL });
    expect(shouldFireHearing(after1, INQUIRY_HEARING_INTERVAL * 2 - 1)).toBe(false);
    expect(shouldFireHearing(after1, INQUIRY_HEARING_INTERVAL * 2)).toBe(true);
  });

  // Test 4: never fires past scheduledEndDay.
  it("never fires on or after scheduledEndDay", () => {
    const inq = makeInquiry({ filedOnDay: 0, scheduledEndDay: 60, lastHearingDay: 30 });
    expect(shouldFireHearing(inq, 60)).toBe(false);
    expect(shouldFireHearing(inq, 90)).toBe(false);
    expect(shouldFireHearing({ ...inq, status: "concluded" }, 50)).toBe(false);
  });
});

// ── shouldWatchdogConclude ───────────────────────────────────────────────

describe("shouldWatchdogConclude", () => {
  // Test 5: fires past scheduledEndDay+grace AND no hearing in 60 days.
  it("fires past grace + no recent hearing", () => {
    const inq = makeInquiry({ filedOnDay: 0, scheduledEndDay: 100, lastHearingDay: 50 });
    // currentDay = 100 + 30 + 1 = 131; lastHearingDay was 50; gap = 81 > 60.
    expect(shouldWatchdogConclude(inq, 100 + INQUIRY_WATCHDOG_GRACE_DAYS + 1)).toBe(true);
  });

  // Test 6: does not fire if hearing within prior 60 days.
  it("does not fire when hearing was within INQUIRY_WATCHDOG_HEARING_GAP_DAYS", () => {
    const inq = makeInquiry({ filedOnDay: 0, scheduledEndDay: 100, lastHearingDay: 110 });
    // currentDay = 150; gap from lastHearingDay = 40 < 60.
    expect(shouldWatchdogConclude(inq, 150)).toBe(false);
  });

  it("does not fire on concluded inquiries", () => {
    const inq = makeInquiry({ status: "concluded", scheduledEndDay: 50 });
    expect(shouldWatchdogConclude(inq, 200)).toBe(false);
  });
});

// ── fileInquiry — invariants + happy path + duration ─────────────────────

describe("fileInquiry — invariants", () => {
  // Test 7: S17 invariant.
  it("throws when both targetPartyId and targetMinistry are null (S17)", () => {
    expect(() =>
      fileInquiry({ filingPartyId: "linke", subject: "S", targetPartyId: null, targetMinistry: null }, 100, []),
    ).toThrow(/target a party or a ministry/);
  });

  // Test 8: S9 active-cap.
  it("throws when active inquiry count is at the cap (S9)", () => {
    mockState.activeCount = INQUIRY_MAX_ACTIVE;
    expect(() =>
      fileInquiry({ filingPartyId: "linke", subject: "S", targetPartyId: "spd", targetMinistry: null }, 100, [makeParty("linke")]),
    ).toThrow(/cap/i);
  });

  // Test 9: S8 rate-limit.
  it("throws when within S8 rate-limit window", () => {
    mockState.lastInquiryFiledDay = 100;
    mockState.activeCount = 0;
    expect(() =>
      fileInquiry({ filingPartyId: "linke", subject: "S", targetPartyId: "spd", targetMinistry: null }, 100 + INQUIRY_MIN_DAYS_BETWEEN_FILINGS - 1, [makeParty("linke")]),
    ).toThrow(/rate-limit/i);
  });
});

describe("fileInquiry — happy path", () => {
  // Test 10: writes row + meta + applies +0.3 to filer.
  it("inserts inquiry, sets lastInquiryFiledDay, applies filing bonus to filer", () => {
    mockState.lastInquiryFiledDay = null;
    mockState.activeCount = 0;
    const filer = makeParty("linke", { approvalRating: 25 });
    const target = makeParty("spd", { coalitionRole: "leader", approvalRating: 50 });
    const parties = [filer, target];

    const { inquiry, event } = fileInquiry(
      { filingPartyId: "linke", subject: "Maskenaffäre", targetPartyId: "spd", targetMinistry: null },
      200,
      parties,
      makeRng(7),
    );

    expect(inquiry.status).toBe("active");
    expect(inquiry.filingPartyId).toBe("linke");
    expect(inquiry.targetPartyId).toBe("spd");
    expect(inquiry.scheduledEndDay).toBeGreaterThanOrEqual(200 + INQUIRY_DURATION_MIN);
    expect(inquiry.scheduledEndDay).toBeLessThanOrEqual(200 + INQUIRY_DURATION_MAX);
    expect(event.type).toBe("inquiry_filed");
    expect(event.actor).toBe("linke");

    // DB writes recorded.
    expect(mockState.recordedInserts.length).toBe(1);
    expect(mockState.recordedInserts[0].id).toBe(inquiry.id);
    expect(mockState.recordedMetaUpdates.length).toBe(1);
    expect(mockState.recordedMetaUpdates[0].lastInquiryFiledDay).toBe(200);

    // Approval bonus applied (clamped via clampApproval, so within [5, 75]).
    expect(filer.approvalRating).toBeCloseTo(25 + INQUIRY_FILER_FILING_BONUS, 5);
    // Target untouched at filing time (drag is per-day, applied via tickActiveInquiries).
    expect(target.approvalRating).toBe(50);
  });

  // Test 11: duration draw is uniform[INQUIRY_DURATION_MIN, INQUIRY_DURATION_MAX].
  it("draws duration uniformly within [MIN, MAX] (1000-trial range check)", () => {
    mockState.lastInquiryFiledDay = null;
    mockState.activeCount = 0;
    const rng = makeRng(11);
    let minSeen = Number.POSITIVE_INFINITY;
    let maxSeen = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 1000; i++) {
      mockState.recordedInserts = [];
      mockState.recordedMetaUpdates = [];
      const filer = makeParty("linke");
      const { inquiry } = fileInquiry(
        { filingPartyId: "linke", subject: "S", targetPartyId: "spd", targetMinistry: null },
        500,
        [filer],
        rng,
      );
      const dur = inquiry.scheduledEndDay - inquiry.filedOnDay;
      if (dur < minSeen) minSeen = dur;
      if (dur > maxSeen) maxSeen = dur;
    }
    expect(minSeen).toBeGreaterThanOrEqual(INQUIRY_DURATION_MIN);
    expect(maxSeen).toBeLessThanOrEqual(INQUIRY_DURATION_MAX);
    // 1000 trials over a 361-wide range ought to cover most of the span;
    // assert the spread covers >50% of the range to catch a stuck-at-min bug.
    expect(maxSeen - minSeen).toBeGreaterThan((INQUIRY_DURATION_MAX - INQUIRY_DURATION_MIN) * 0.5);
  });
});

// ── concludeInquiry — outcome impacts + R3 ───────────────────────────────

describe("concludeInquiry", () => {
  // Test 12: wrongdoing applies -1.5/+0.8.
  it("wrongdoing_found applies INQUIRY_WRONGDOING impacts to target + filer", () => {
    const filer = makeParty("linke", { approvalRating: 25 });
    const target = makeParty("spd", { approvalRating: 50, coalitionRole: "leader" });
    const inq = makeInquiry({ filingPartyId: "linke", targetPartyId: "spd", scheduledEndDay: 100 });

    const event = concludeInquiry(inq, 100, "wrongdoing_found", false, [filer, target]);

    expect(event.type).toBe("inquiry_concluded");
    expect(event.title).toContain("Verfehlungen");
    expect(target.approvalRating).toBeCloseTo(50 + INQUIRY_WRONGDOING_TARGET_IMPACT, 5);
    expect(filer.approvalRating).toBeCloseTo(25 + INQUIRY_WRONGDOING_FILER_IMPACT, 5);
  });

  // Test 13: cleared applies +0.5/-0.3.
  it("cleared applies INQUIRY_CLEARED impacts to target + filer", () => {
    const filer = makeParty("linke", { approvalRating: 25 });
    const target = makeParty("spd", { approvalRating: 50, coalitionRole: "leader" });
    const inq = makeInquiry({ filingPartyId: "linke", targetPartyId: "spd" });

    concludeInquiry(inq, 200, "cleared", false, [filer, target]);

    expect(target.approvalRating).toBeCloseTo(50 + INQUIRY_CLEARED_TARGET_IMPACT, 5);
    expect(filer.approvalRating).toBeCloseTo(25 + INQUIRY_CLEARED_FILER_IMPACT, 5);
  });

  // Test 14: R3 — target party no longer exists. The concludeInquiry call must
  // not throw, and the filer impact should still apply.
  it("R3: target party no longer exists — no-throw, filer impact still applies", () => {
    const filer = makeParty("linke", { approvalRating: 25 });
    const inq = makeInquiry({ filingPartyId: "linke", targetPartyId: "spd-defunct" });

    expect(() => concludeInquiry(inq, 200, "wrongdoing_found", false, [filer])).not.toThrow();
    // Filer impact still applies even when target is gone.
    expect(filer.approvalRating).toBeCloseTo(25 + INQUIRY_WRONGDOING_FILER_IMPACT, 5);
  });
});

// ── findInquiryOpportunity ───────────────────────────────────────────────

describe("findInquiryOpportunity", () => {
  function makeCrisis(over: Partial<Crisis> = {}): Crisis {
    return {
      id: "c-1", templateId: "t", name: "n", description: "d",
      category: "defense", severity: "high",
      startDay: 0, endDay: 50,
      dailyImpact: {}, resolved: false,
      ...over,
    } as Crisis;
  }

  function makeGovernment(over: Partial<Government> = {}): Government {
    return {
      id: "gov", electionId: null,
      chancellorName: "Test", chancellorPartyId: "spd",
      ministers: [{ name: "M", partyId: "spd", portfolio: "defence" }],
      formedOnDay: 0, dissolvedOnDay: null, active: true,
      ...over,
    };
  }

  // Test 15: returns null when no high-severity crisis OR no coalition match;
  // returns a populated opportunity otherwise.
  it("returns null when no government", () => {
    expect(findInquiryOpportunity([makeCrisis()], null, [])).toBeNull();
  });

  it("returns null when crisis is not high-severity", () => {
    const result = findInquiryOpportunity(
      [makeCrisis({ severity: "medium" })],
      makeGovernment(),
      [],
    );
    expect(result).toBeNull();
  });

  it("returns null when crisis category does not map to any held ministry", () => {
    // Government has only `defence` portfolio; crisis is `economy` → maps to `finance` → no minister.
    const result = findInquiryOpportunity(
      [makeCrisis({ category: "economy" })],
      makeGovernment(),
      [],
    );
    expect(result).toBeNull();
  });

  it("returns opportunity when high-severity crisis maps to a coalition-held ministry", () => {
    const result = findInquiryOpportunity(
      [makeCrisis({ category: "defense", severity: "high" })], // defense → defence
      makeGovernment(),
      [],
    );
    expect(result).not.toBeNull();
    expect(result?.targetPartyId).toBe("spd");
    expect(result?.severity).toBe("high");
    expect(result?.triggerCrisisId).toBe("c-1");
  });

  it("skips already-resolved crises", () => {
    const result = findInquiryOpportunity(
      [makeCrisis({ resolved: true })],
      makeGovernment(),
      [],
    );
    expect(result).toBeNull();
  });
});
