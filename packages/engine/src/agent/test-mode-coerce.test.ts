import { describe, expect, it } from "vitest";
import { coerceTestModeActions } from "./test-mode-coerce.js";

describe("coerceTestModeActions", () => {
  describe("action-type aliasing", () => {
    it("rewrites past-tense bill_proposed → propose_bill", () => {
      const input = {
        actions: [{ type: "bill_proposed", title: "Bürgergeld 2026", description: "..." }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions[0].type).toBe("propose_bill");
    });

    it("rewrites motion_submitted, interpellation_filed, bill_vote", () => {
      const input = {
        actions: [
          { type: "motion_submitted", title: "x" },
          { type: "interpellation_filed", title: "y" },
          { type: "bill_vote", billId: "b1", vote: "yes" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions.map(a => a.type)).toEqual([
        "submit_motion",
        "file_interpellation",
        "vote",
      ]);
    });

    it("drops interpellation_answered (no valid imperative form)", () => {
      const input = {
        actions: [
          { type: "interpellation_answered", description: "..." },
          { type: "statement", title: "t", statement: "s" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions.length).toBe(1);
      expect(out.actions[0].type).toBe("statement");
    });

    it("drops kurzintervention (hallucinated, not in schema)", () => {
      const input = {
        actions: [{ type: "kurzintervention", target: "AfD", content: "..." }],
      };
      const out = coerceTestModeActions(input) as { actions: unknown[] };
      expect(out.actions.length).toBe(0);
    });

    it("leaves unknown action types unchanged (validator decides)", () => {
      const input = { actions: [{ type: "totally_unknown_xyz" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions[0].type).toBe("totally_unknown_xyz");
    });

    it("leaves valid action types unchanged", () => {
      const input = {
        actions: [
          { type: "vote", billId: "b1", vote: "yes" },
          { type: "propose_bill", title: "x" },
          { type: "statement", title: "t", statement: "s" },
          { type: "nothing" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions.map(a => a.type)).toEqual(["vote", "propose_bill", "statement", "nothing"]);
    });
  });

  describe("field-name aliasing", () => {
    it("rewrites bill_id → billId", () => {
      const input = { actions: [{ type: "vote", bill_id: "b1", vote: "yes" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].billId).toBe("b1");
      expect(out.actions[0].bill_id).toBeUndefined();
    });

    it("rewrites bill_name → title and motion_id → title", () => {
      const input = {
        actions: [
          { type: "propose_bill", bill_name: "Mein Gesetz" },
          { type: "submit_motion", motion_id: "Antrag X" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBe("Mein Gesetz");
      expect(out.actions[1].title).toBe("Antrag X");
    });

    it("rewrites snake_case impact + nested fields", () => {
      const input = {
        actions: [
          { type: "propose_bill", title: "x", impact_change: { gdp_growth: 0.1, public_sentiment: 1.0 } },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      // Top-level snake_case → camelCase
      expect(out.actions[0].impactChange).toBeDefined();
      // Inner snake_case fields are NOT recursively rewritten — that's
      // out of scope; the outer rewrite is enough for validator to accept.
    });
  });

  describe("statement field disambiguation", () => {
    it("statement.content → statement.statement, synthesizes title", () => {
      const input = {
        actions: [{ type: "statement", content: "Wir lehnen das Gesetz ab und fordern Neuwahlen." }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].statement).toBe("Wir lehnen das Gesetz ab und fordern Neuwahlen.");
      expect(typeof out.actions[0].title).toBe("string");
      expect((out.actions[0].title as string).length).toBeGreaterThan(0);
    });

    it("statement.description → statement.statement (when content absent)", () => {
      const input = { actions: [{ type: "statement", description: "Eine kurze Stellungnahme." }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].statement).toBe("Eine kurze Stellungnahme.");
    });

    it("statement_text → statement (via field alias)", () => {
      const input = { actions: [{ type: "statement", title: "t", statement_text: "..." }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].statement).toBe("...");
    });

    it("preserves existing title when present", () => {
      const input = {
        actions: [{ type: "statement", title: "Original Title", content: "Body text here" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBe("Original Title");
      expect(out.actions[0].statement).toBe("Body text here");
    });

    it("does NOT rewrite content/description for non-statement actions", () => {
      const input = {
        actions: [{ type: "propose_bill", title: "Gesetz", description: "Bill description" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      // description stays as description for propose_bill
      expect(out.actions[0].description).toBe("Bill description");
      expect(out.actions[0].statement).toBeUndefined();
    });
  });

  describe("vote-value aliasing", () => {
    it("rewrites English synonyms: for→yes, against→no, pass→abstain", () => {
      const input = {
        actions: [
          { type: "vote", billId: "b1", vote: "for" },
          { type: "vote", billId: "b2", vote: "against" },
          { type: "vote", billId: "b3", vote: "pass" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ vote: string }> };
      expect(out.actions.map(a => a.vote)).toEqual(["yes", "no", "abstain"]);
    });

    it("rewrites German synonyms: ja→yes, nein→no, enthaltung→abstain", () => {
      const input = {
        actions: [
          { type: "vote", billId: "b1", vote: "ja" },
          { type: "vote", billId: "b2", vote: "nein" },
          { type: "vote", billId: "b3", vote: "enthaltung" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ vote: string }> };
      expect(out.actions.map(a => a.vote)).toEqual(["yes", "no", "abstain"]);
    });

    it("is case-insensitive", () => {
      const input = { actions: [{ type: "vote", billId: "b1", vote: "JA" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ vote: string }> };
      expect(out.actions[0].vote).toBe("yes");
    });

    it("leaves valid vote values unchanged", () => {
      const input = {
        actions: [
          { type: "vote", billId: "b1", vote: "yes" },
          { type: "vote", billId: "b2", vote: "no" },
          { type: "vote", billId: "b3", vote: "abstain" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ vote: string }> };
      expect(out.actions.map(a => a.vote)).toEqual(["yes", "no", "abstain"]);
    });

    it("leaves unknown vote values unchanged (validator decides)", () => {
      const input = { actions: [{ type: "vote", billId: "b1", vote: "weird_word" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ vote: string }> };
      expect(out.actions[0].vote).toBe("weird_word");
    });
  });

  describe("object-instead-of-array structural fix (gruene case)", () => {
    it("converts {actions: {type: text}} → {actions: [{type, content: text}]}", () => {
      const input = {
        actions: {
          statement: "Wir bekräftigen unsere Position.",
          bill_proposed: "Ein Gesetz zur Förderung von X.",
        },
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string; content?: string; title?: string; statement?: string }> };
      expect(out.actions.length).toBe(2);
      expect(out.actions[0].type).toBe("statement");
      // statement-type gets content→statement disambiguation
      expect(out.actions[0].statement).toBe("Wir bekräftigen unsere Position.");
      // bill_proposed is then aliased to propose_bill
      expect(out.actions[1].type).toBe("propose_bill");
    });

    it("converts {actions: {type: object}} → {actions: [{type, ...object}]}", () => {
      const input = {
        actions: {
          vote: { billId: "b1", vote: "yes" },
        },
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].type).toBe("vote");
      expect(out.actions[0].billId).toBe("b1");
      expect(out.actions[0].vote).toBe("yes");
    });

    it("leaves array-structured input alone", () => {
      const input = { actions: [{ type: "statement", title: "t", statement: "s" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions.length).toBe(1);
      expect(out.actions[0].type).toBe("statement");
    });
  });

  describe("v2: bare-noun action types", () => {
    it("rewrites bare 'motion' → submit_motion", () => {
      const input = { actions: [{ type: "motion", content: "Antrag X" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions[0].type).toBe("submit_motion");
    });

    it("rewrites bare 'bill' → propose_bill", () => {
      const input = { actions: [{ type: "bill", title: "x", description: "y" }] };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions[0].type).toBe("propose_bill");
    });

    it("drops 'response' / 'reply' (contextual replies)", () => {
      const input = {
        actions: [
          { type: "response", content: "answer to interpellation" },
          { type: "reply", content: "answer" },
          { type: "statement", title: "t", statement: "s" },
        ],
      };
      const out = coerceTestModeActions(input) as { actions: Array<{ type: string }> };
      expect(out.actions.length).toBe(1);
      expect(out.actions[0].type).toBe("statement");
    });
  });

  describe("v2: details / body field aliases", () => {
    it("rewrites details → description for bills", () => {
      const input = { actions: [{ type: "bill_proposed", title: "Gesetz", details: "Body text" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].description).toBe("Body text");
      expect(out.actions[0].details).toBeUndefined();
    });

    it("rewrites body → description", () => {
      const input = { actions: [{ type: "submit_motion", title: "x", body: "..." }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].description).toBe("...");
    });
  });

  describe("v2: content-splitting for non-statement narrative actions", () => {
    it("splits content into title + description for bills with neither set", () => {
      const longContent = "SPD beantragt Gesetz zur Reform der Sozialversicherung. Dieses Gesetz soll die Finanzierung der Renten langfristig sichern und gleichzeitig die Beitragslast für Arbeitnehmer fair verteilen.";
      const input = { actions: [{ type: "bill_proposed", content: longContent }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(typeof out.actions[0].title).toBe("string");
      expect(out.actions[0].description).toBe(longContent);
    });

    it("title is truncated to ~80 chars with ellipsis", () => {
      const longContent = "x".repeat(200);
      const input = { actions: [{ type: "submit_motion", content: longContent }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      const title = out.actions[0].title as string;
      expect(title.length).toBeLessThanOrEqual(80);
      expect(title.endsWith("...")).toBe(true);
    });

    it("preserves existing title when present, fills missing description from content", () => {
      const input = {
        actions: [{ type: "bill_proposed", title: "Real Title", content: "Some narrative" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBe("Real Title");
      expect(out.actions[0].description).toBe("Some narrative");
    });

    it("does not split when both title + description already set", () => {
      const input = {
        actions: [{ type: "bill_proposed", title: "T", description: "D", content: "ignore" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBe("T");
      expect(out.actions[0].description).toBe("D");
    });
  });

  describe("v2: default required-field injection", () => {
    it("injects default impact for propose_bill when missing", () => {
      const input = { actions: [{ type: "bill_proposed", title: "x", description: "y" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      const impact = out.actions[0].impact as Record<string, number>;
      expect(impact).toBeDefined();
      expect(impact.budget).toBe(0);
      expect(impact.gdpGrowth).toBe(0);
    });

    it("preserves existing impact when present", () => {
      const input = {
        actions: [{
          type: "bill_proposed",
          title: "x",
          description: "y",
          impact: { budget: 0.5, unemployment: 0, inflation: 0, gdpGrowth: 0.1, publicSentiment: 1 },
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      const impact = out.actions[0].impact as Record<string, number>;
      expect(impact.budget).toBe(0.5);
    });

    it("injects default impactChange for propose_amendment when missing", () => {
      const input = {
        actions: [{ type: "amendment_proposed", billId: "b1", title: "x", description: "y" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].impactChange).toBeDefined();
    });

    it("injects default motionType=motion for submit_motion when missing", () => {
      const input = { actions: [{ type: "motion_submitted", title: "x", description: "y" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].motionType).toBe("motion");
    });

    it("injects default interpellationType + targetMinistry for file_interpellation", () => {
      const input = {
        actions: [{ type: "interpellation_filed", title: "x", question: "q" }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].interpellationType).toBe("kleine");
      expect(out.actions[0].targetMinistry).toBe("interior");
    });

    it("injects default category=economy for propose_bill when missing", () => {
      const input = { actions: [{ type: "bill_proposed", title: "x", description: "y" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].category).toBe("economy");
    });
  });

  describe("v3: salvage from arbitrary string fields (not just `content`)", () => {
    it("salvages from `reason` when title + description missing", () => {
      const input = {
        actions: [{
          type: "bill_proposed",
          reason: "Um die langfristige Stabilität des Rentensystems zu gewährleisten, beantragen wir dieses Gesetz.",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBeDefined();
      expect(out.actions[0].description).toBe(input.actions[0].reason);
    });

    it("salvages from arbitrary invented field name", () => {
      const input = {
        actions: [{
          type: "submit_motion",
          narrative: "Wir reichen Antrag auf Einsetzung einer Kommission ein.",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].description).toBe(input.actions[0].narrative);
    });

    it("picks the longest candidate when multiple non-reserved fields exist", () => {
      const short = "Brief note";
      const long = "Eine längere Beschreibung des vorgeschlagenen Gesetzes mit ausführlicher Begründung.";
      const input = {
        actions: [{
          type: "propose_bill",
          summary: short,
          rationale: long,
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].description).toBe(long);
    });

    it("CRITICAL: empty action with no salvageable text remains incomplete (validator must reject)", () => {
      // Load-bearing test — preserves the diagnostic signal for prompt-
      // improvement work. If this ever passes a fabricated value, the
      // mocking layer is hiding model errors.
      const input = { actions: [{ type: "propose_bill" }] };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBeUndefined();
      expect(out.actions[0].description).toBeUndefined();
    });

    it("does not salvage from short fields (< 10 chars) — avoids party IDs / ellipses", () => {
      const input = {
        actions: [{
          type: "propose_bill",
          target: "AfD",
          status: "...",
          tag: "x",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBeUndefined();
      expect(out.actions[0].description).toBeUndefined();
    });

    it("does not salvage from structural fields (billId, vote, motionType, etc.)", () => {
      const input = {
        actions: [{
          type: "propose_bill",
          billId: "bill-1-aq9ih9zrmofpjf8p",
          motionType: "motion",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      // billId is >10 chars but blacklisted as a salvage source
      expect(out.actions[0].title).toBeUndefined();
      expect(out.actions[0].description).toBeUndefined();
    });

    it("does not salvage when title + description are already set", () => {
      const input = {
        actions: [{
          type: "propose_bill",
          title: "Real Title",
          description: "Real description here",
          extra_field: "Some other narrative content that should be ignored",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBe("Real Title");
      expect(out.actions[0].description).toBe("Real description here");
    });

    it("salvages title only when description already exists", () => {
      const input = {
        actions: [{
          type: "submit_motion",
          description: "Existing description text",
          subject: "An invented subject field with substantive content",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].description).toBe("Existing description text");
      expect(typeof out.actions[0].title).toBe("string");
    });

    it("does NOT trigger salvage on action types outside SALVAGE_TARGET_TYPES (e.g. vote)", () => {
      const input = {
        actions: [{
          type: "vote",
          billId: "bill-1",
          vote: "yes",
          commentary: "A long bit of commentary that would otherwise be salvaged",
        }],
      };
      const out = coerceTestModeActions(input) as { actions: Array<Record<string, unknown>> };
      expect(out.actions[0].title).toBeUndefined();
      expect(out.actions[0].description).toBeUndefined();
    });
  });

  describe("safety", () => {
    it("returns null/non-object inputs unchanged", () => {
      expect(coerceTestModeActions(null)).toBe(null);
      expect(coerceTestModeActions(undefined)).toBe(undefined);
      expect(coerceTestModeActions("string")).toBe("string");
      expect(coerceTestModeActions(42)).toBe(42);
    });

    it("does not mutate the input", () => {
      const input = { actions: [{ type: "bill_proposed", bill_id: "b1" }] };
      const inputCopy = JSON.parse(JSON.stringify(input));
      coerceTestModeActions(input);
      expect(input).toEqual(inputCopy);
    });

    it("skips non-object items in the actions array", () => {
      const input = { actions: [null, "string", 42, { type: "statement", title: "t", statement: "s" }] };
      const out = coerceTestModeActions(input) as { actions: unknown[] };
      expect(out.actions.length).toBe(1);
    });
  });
});
