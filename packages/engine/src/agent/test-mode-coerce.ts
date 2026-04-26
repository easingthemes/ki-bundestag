/**
 * Test-mode action coercion layer.
 *
 * Open-weight LLMs (gemma3:12b, qwen2.5, etc. via TEST_MODE) consistently
 * produce action JSON with predictable but invalid variants — past-tense
 * action types, snake_case field names, German or English vote synonyms,
 * and occasional structural failures (object-instead-of-array).
 *
 * This module rewrites those variants into the canonical schema BEFORE
 * validation, so the simulation flow can run end-to-end on local models.
 * Quality is unchanged (the model still picks whatever it picks); coercion
 * only normalizes the representation.
 *
 * Production is unaffected — coercion is invoked only when
 * `process.env.TEST_MODE` is set. See parseAgentResponse for the call site.
 *
 * Background: docs/research/agent-output-failures.md catalogs the variants
 * observed empirically. This module is the deterministic alias table
 * derived from that catalog.
 */

/** Past-tense / event-name action types → imperative form. */
const ACTION_TYPE_ALIASES: Record<string, string> = {
  bill_proposed: "propose_bill",
  bill_proposal: "propose_bill",
  propose_a_bill: "propose_bill",
  amendment_proposed: "propose_amendment",
  motion_submitted: "submit_motion",
  motion_filed: "submit_motion",
  resolution_submitted: "submit_motion",
  interpellation_filed: "file_interpellation",
  kleine_anfrage: "file_interpellation",
  große_anfrage: "file_interpellation",
  grosse_anfrage: "file_interpellation",
  vertrauensfrage_called: "call_vertrauensfrage",
  misstrauensvotum_filed: "file_misstrauensvotum",
  inquiry_committee_filed: "file_inquiry_committee",
  untersuchungsausschuss: "file_inquiry_committee",
  constitutional_challenge_filed: "file_constitutional_challenge",
  fiscal_emergency_proposed: "propose_fiscal_emergency",
  enquete_kommission_requested: "request_enquete_kommission",
  bill_vote: "vote",
  cast_vote: "vote",
  // Bare-noun forms — model uses the action name without the imperative verb.
  motion: "submit_motion",
  bill: "propose_bill",
  amendment: "propose_amendment",
  interpellation: "file_interpellation",
  // Drop-only — these are responses to events, not actions, and have no
  // valid imperative form. The empty-string sentinel signals "drop this".
  interpellation_answered: "",
  kurzintervention: "",
  response: "", // contextual reply to an interpellation, not an agent action
  reply: "",
  question_response: "",
  // Keep nothing/statement/etc. as-is — they're already valid.
};

/** snake_case / alternate field names → camelCase / canonical. */
const FIELD_ALIASES: Record<string, string> = {
  bill_id: "billId",
  bill_title: "billId", // model sometimes uses bill title as id; we'll drop later if no match
  bill_name: "title",
  motion_id: "title", // hallucinated id field on motions
  proposed_chancellor: "proposedChancellor",
  proposed_chancellor_party_id: "proposedChancellorPartyId",
  target_party_id: "targetPartyId",
  target_ministry: "targetMinistry",
  motion_type: "motionType",
  interpellation_type: "interpellationType",
  impact_change: "impactChange",
  active_crisis_id: "activeCrisisId",
  gdp_growth: "gdpGrowth",
  public_sentiment: "publicSentiment",
  // Statement-specific narrative fields → "statement" (only when type === "statement")
  statement_text: "statement",
  // For non-statement actions, "content"/"description" usually means description.
  // For statement actions, "content" means statement. The two-pass coercion
  // below disambiguates by inspecting the action's `type` field.
  // Common synonyms for "description" used by gemma3 across action types.
  details: "description",
  body: "description",
};

/** Default impact bag — neutral, applied to propose_bill / propose_amendment when missing. */
const DEFAULT_IMPACT = {
  budget: 0,
  unemployment: 0,
  inflation: 0,
  gdpGrowth: 0,
  publicSentiment: 0,
};

/** Vote value synonyms → canonical {yes, no, abstain}. */
const VOTE_VALUE_ALIASES: Record<string, "yes" | "no" | "abstain"> = {
  // English synonyms
  for: "yes",
  in_favor: "yes",
  approve: "yes",
  support: "yes",
  against: "no",
  oppose: "no",
  reject: "no",
  pass: "abstain",
  abstention: "abstain",
  neutral: "abstain",
  // German synonyms (gemma3:12b emits these frequently)
  ja: "yes",
  zustimmung: "yes",
  dafür: "yes",
  nein: "no",
  ablehnung: "no",
  dagegen: "no",
  enthaltung: "abstain",
  enthalten: "abstain",
};

/**
 * Normalize an action's `type` field. Past-tense forms are aliased; truly
 * unknown types are returned unchanged so the validator can flag them.
 * Returns null if the action should be dropped entirely.
 */
function coerceActionType(type: unknown): string | null {
  if (typeof type !== "string") return null;
  const aliased = ACTION_TYPE_ALIASES[type];
  if (aliased === "") return null; // drop
  return aliased ?? type;
}

/** Rewrite an action's field names according to FIELD_ALIASES + type-aware rules. */
function coerceFields(action: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(action)) {
    if (k === "type") {
      out[k] = v;
      continue;
    }
    const aliased = FIELD_ALIASES[k];
    out[aliased ?? k] = v;
  }

  // Type-aware narrative-field disambiguation.
  // Statement actions: `content`/`description` → `statement` (if not already set).
  if (out.type === "statement") {
    if (!out.statement && typeof out.content === "string") {
      out.statement = out.content;
      delete out.content;
    }
    if (!out.statement && typeof out.description === "string") {
      out.statement = out.description;
      delete out.description;
    }
    if (!out.title && typeof out.statement === "string") {
      out.title = synthesizeTitle(out.statement);
    }
  }

  // Bill / motion / amendment / interpellation actions: salvage missing
  // title + description from any non-structural string field on the action.
  // Open-weight models routinely route narrative text to invented field names
  // (`reason`, `details`, `narrative`, etc.); rather than reject the action,
  // we re-route the content. CRITICAL: this only fires when the model produced
  // SOME usable text — actions with no salvageable string remain incomplete
  // and get rejected by the validator (preserves the diagnostic signal for
  // prompt-improvement work).
  if (typeof out.type === "string" && SALVAGE_TARGET_TYPES.has(out.type)) {
    const hasTitle = typeof out.title === "string" && out.title.trim().length > 0;
    const hasDescription = typeof out.description === "string" && out.description.trim().length > 0;
    if (!hasTitle || !hasDescription) {
      const source = findSalvageSource(out);
      if (source) {
        if (!hasTitle) {
          out.title = synthesizeTitle(source.value);
          logSalvage(out.type, "title", source.key);
        }
        if (!hasDescription) {
          out.description = source.value;
          logSalvage(out.type, "description", source.key);
        }
      }
      // No candidate: leave action incomplete, validator will reject it.
    }
  }

  // Inject default impact bags for actions where the DB requires them but
  // the model omitted them. These defaults are zero/neutral — coercion's job
  // is to make actions land, not to invent realistic effects.
  if (out.type === "propose_bill" && out.impact == null) {
    out.impact = { ...DEFAULT_IMPACT };
  }
  if (out.type === "propose_amendment" && out.impactChange == null) {
    out.impactChange = { ...DEFAULT_IMPACT };
  }
  // submit_motion needs a motionType; default to "motion" (Antrag) when absent.
  if (out.type === "submit_motion" && out.motionType == null) {
    out.motionType = "motion";
  }
  // file_interpellation needs an interpellationType + targetMinistry.
  // Default to "kleine" (Kleine Anfrage) and "interior" — neutral choices.
  if (out.type === "file_interpellation") {
    if (out.interpellationType == null) out.interpellationType = "kleine";
    if (out.targetMinistry == null) out.targetMinistry = "interior";
  }
  // propose_bill needs a category; "economy" is a safe default.
  if (out.type === "propose_bill" && out.category == null) {
    out.category = "economy";
  }

  return out;
}

/** Title from a longer narrative — first ~80 chars, ellipsis if truncated. */
function synthesizeTitle(text: string): string {
  const s = text.trim();
  return s.length > 80 ? s.slice(0, 77) + "..." : s;
}

/** Normalize a vote action's `vote` field through VOTE_VALUE_ALIASES. */
function coerceVoteValue(action: Record<string, unknown>): Record<string, unknown> {
  if (action.type !== "vote") return action;
  const v = action.vote;
  if (typeof v !== "string") return action;
  const lower = v.toLowerCase().replace(/-/g, "_");
  const aliased = VOTE_VALUE_ALIASES[lower];
  if (aliased) {
    return { ...action, vote: aliased };
  }
  return action;
}

/**
 * Action types that need `title` + `description` salvage when the model
 * routes narrative text to invented field names. Listed explicitly rather
 * than computed so a future action type doesn't accidentally inherit
 * salvage behaviour (some action types like `nothing` or `vote` shouldn't).
 */
const SALVAGE_TARGET_TYPES = new Set([
  "propose_bill",
  "propose_amendment",
  "submit_motion",
  "file_interpellation",
  "call_vertrauensfrage",
  "file_misstrauensvotum",
  "file_inquiry_committee",
  "file_constitutional_challenge",
  "propose_fiscal_emergency",
  "request_enquete_kommission",
  "campaign_statement",
]);

/**
 * Fields we never salvage FROM (they have structural meaning, not narrative
 * content). The salvage source must be a non-reserved string field with
 * substantial text.
 */
const SALVAGE_BLACKLIST = new Set([
  "type", "title", "description",
  "billId", "vote", "motionType", "interpellationType", "targetMinistry",
  "category", "impact", "impactChange",
  "proposedChancellor", "proposedChancellorPartyId", "targetPartyId",
  "activeCrisisId", "interpellationId",
]);

/** Minimum string length for a field to count as a salvage candidate.
 *  10 chars excludes party IDs ("spd", "afd") and short fragments ("...", "x")
 *  while accepting brief but real content like "Some narrative" or "Body text". */
const MIN_SALVAGE_LENGTH = 10;

/**
 * Search for the best salvage source on an action — the longest non-reserved
 * string field with at least MIN_SALVAGE_LENGTH characters. Returns null when
 * the action has no usable narrative text, in which case salvage is skipped
 * and the action remains incomplete (validator rejects it). This is by design:
 * empty actions must surface as failures so prompt-improvement work can see
 * them, not be silently fabricated through.
 */
function findSalvageSource(
  action: Record<string, unknown>,
): { key: string; value: string } | null {
  let best: { key: string; value: string } | null = null;
  for (const [k, v] of Object.entries(action)) {
    if (SALVAGE_BLACKLIST.has(k)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length < MIN_SALVAGE_LENGTH) continue;
    if (!best || v.length > best.value.length) {
      best = { key: k, value: v };
    }
  }
  return best;
}

/** Observability: emit one line per salvage event so volume is grep-able. */
function logSalvage(actionType: string, targetField: string, sourceField: string): void {
  console.warn(
    `  [test-mode salvage] ${actionType} filled ${targetField} from "${sourceField}"`,
  );
}

/**
 * Top-level structural normalizer. Handles the gruene-style failure where
 * the model emits `{"actions": {key1: val1, key2: val2}}` instead of an
 * array — by treating each key as an action `type` and the value as a
 * payload (statement/description). Best-effort recovery; model-specific.
 */
function normalizeActionsContainer(parsed: unknown): unknown {
  if (
    parsed == null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return parsed;
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.actions)) return parsed;
  if (obj.actions == null || typeof obj.actions !== "object") return parsed;

  // Convert {actions: {type1: text1, type2: text2}} → {actions: [{type:type1, ...}]}.
  // Each key becomes the action `type` (subject to alias remapping).
  const inner = obj.actions as Record<string, unknown>;
  const arr: Array<Record<string, unknown>> = [];
  for (const [type, payload] of Object.entries(inner)) {
    if (typeof payload === "string") {
      arr.push({ type, content: payload });
    } else if (payload != null && typeof payload === "object") {
      arr.push({ type, ...(payload as Record<string, unknown>) });
    }
  }
  return { ...obj, actions: arr };
}

/**
 * Public entry point. Applies all coercions in order:
 *   1. Top-level object→array (if needed)
 *   2. Per-action type aliasing + drop signals
 *   3. Per-action field-name aliasing
 *   4. Per-action vote-value aliasing
 *
 * Returns a new object — input is not mutated. Safe to call on already-clean
 * inputs (no-op).
 */
export function coerceTestModeActions(parsed: unknown): unknown {
  const normalized = normalizeActionsContainer(parsed);

  if (
    normalized == null ||
    typeof normalized !== "object" ||
    Array.isArray(normalized)
  ) {
    return normalized;
  }

  const obj = normalized as Record<string, unknown>;
  if (!Array.isArray(obj.actions)) return normalized;

  const coercedActions: Array<Record<string, unknown>> = [];
  for (const raw of obj.actions) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const action = raw as Record<string, unknown>;

    const newType = coerceActionType(action.type);
    if (newType === null) continue; // drop signal

    const retyped = { ...action, type: newType };
    const fielded = coerceFields(retyped);
    const voted = coerceVoteValue(fielded);
    coercedActions.push(voted);
  }

  return { ...obj, actions: coercedActions };
}
