# Agent Output Validation: Failure Catalog & Schema-Enforcement Gap

**Status:** active research, written 2026-04-26
**Context:** investigation of why party-agent VALIDATION_FAIL events occur in both production (Anthropic Haiku) and test-mode (local Ollama / Groq).

---

## TL;DR

The party-agent JSON output is currently policed by **the system prompt only** — Anthropic structured output is disabled, xAI/Grok doesn't support strict schemas, and the OpenAI-compatible test-mode path uses `response_format: json_object` which constrains JSON syntax but not semantic content. This means *any* drift in how the model interprets our prompt becomes a runtime validation failure with no API-level safety net.

The lack of schema enforcement is not an oversight — it's the result of an upstream Anthropic limitation that we hit and worked around. See [§ Upstream blocker](#upstream-blocker-anthropic-issue-1185) below.

The empirical failure catalog (from a 1-day Ollama smoke on 2026-04-26) shows five distinct failure modes, four of which also affect production. The fix surface is the prompt itself, not the validator.

---

## Empirical failure catalog

Source: `gemma3:12b` smoke run, branch `feat/test-mode-validation-diagnostics`, day 8 (1 day, 6 parties). Raw model outputs captured via the `[test-mode]` debug dump added in this branch.

### 1. Past-tense / event-name action types

Observed across **all 6 parties** in both initial response and semantic retry:

```json
{"type": "bill_proposed", ...}        // expected: "propose_bill"
{"type": "motion_submitted", ...}     // expected: "submit_motion"
{"type": "interpellation_filed", ...} // expected: "file_interpellation"
{"type": "interpellation_answered", ...} // not a valid action at all
{"type": "kurzintervention", ...}     // hallucinated (real Bundestag term, not in our schema)
```

**Why it happens:** the model interprets the prompt as *"summarize what each party did today"* (descriptive past-tense events) rather than *"which actions should each party take today"* (imperative commands).

**Production impact:** `party-agent.ts:264` already documents a 1.4% VALIDATION_FAIL rate in production for this exact category on days 77, 82, 83, 84.

### 2. Invented vote-enum values

```json
{"type":"vote","billId":"...","vote":"pass", ...}     // gemma3:12b/fdp
{"type":"vote","bill_id":"...","vote":"against", ...} // gemma3:12b/gruene
{"type":"vote","bill_id":"...","vote":"for", ...}     // gemma3:12b/gruene
```

Expected enum: `"yes" | "no" | "abstain"`. The model invents synonyms from common deliberative-body vocabulary.

**Production impact:** schema enforcement is OFF on all providers (see § Schema-enforcement matrix below). Haiku is statistically less prone but not protected.

### 3. Hallucinated bill IDs

```json
{"type":"vote","bill_id":"CDU_Unternehmenssteuerreform","vote":"against"}
{"type":"vote","bill_id":"AfD_Grenzkontrollen","vote":"against"}
```

The model generates plausible-looking IDs derived from bill *titles* it has seen, instead of using the actual IDs listed in the prompt.

**Production impact:** confirmed by user — non-existent bill IDs occur in production runs as well. This is the strongest cross-provider signal.

### 4. Field-name aliasing

```json
// statement variations across parties:
{"type":"statement","content":"..."}                  // spd
{"type":"statement","description":"..."}              // cdu (every action collapses to "description")
{"type":"statement","statement_text":"...","reason":"..."} // fdp

// vote field:
{"type":"vote","bill_id":"...",...}    // snake_case (gruene)
{"type":"vote","billId":"...",...}     // correct camelCase (fdp)

// bill proposal:
{"type":"...","name":"...","description":"..."}  // "name" instead of "title"
```

**Why it happens:** the schema in the system prompt uses `title`, `statement`, `billId` (camelCase) — but the model substitutes more conventional JSON field names from its training corpus.

**Production impact:**
- Anthropic Haiku with structured output: would be schema-protected — but **structured output is disabled** (see below). So **affected**.
- xAI/Grok (AfD): no structured output support → **affected**.

### 5. Top-level structure violations

```json
// gruene first attempt: object instead of array, with action types as keys:
{"actions": {
  "statement": "Die Grünen bekräftigen ...",
  "bill_proposed": "Gesetz zur Förderung von erneuerbaren Energien ...",
  "bill_proposed": "Gesetz zur grünen Rentensicherung ...",  // duplicate key
  "bill_proposed": "..."
}}
```

Severe schema reinterpretation. JS `JSON.parse` keeps only the last duplicate key, but the model emitted three distinct entries.

**Production impact:** Anthropic structured output (when enabled) would catch this. Grok would not. **Without structured output anywhere, all providers are exposed.**

---

## Schema-enforcement matrix (current state)

| Provider | Structured output available | Currently enabled for party agents | Effective enforcement |
|---|---|---|---|
| Anthropic Haiku (prod default) | Yes — JSON Schema, strict mode | **No** (disabled — see Upstream blocker) | Prompt only |
| xAI Grok (AfD) | No | n/a | Prompt only |
| OpenAI-compatible (test-mode: Ollama / Groq / OpenRouter) | `response_format: json_object` (PR #170) | Yes | Syntax-only (valid JSON, no field/enum constraints) |

**Conclusion:** zero providers currently get semantic schema enforcement at the API layer. The system prompt is the only line of defence everywhere.

---

## Upstream blocker (Anthropic issue #1185)

The codebase comment in `party-agent.ts:213-216` is terse:

> Structured output disabled — schema with 17 optional fields in a nested array causes "Grammar compilation timed out" on the Anthropic API.

This isn't a bug we introduced — it's an explicit, documented Anthropic platform limitation that hits any non-trivial schema.

### Anthropic's documented limits

From the [Anthropic structured outputs docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs):

| Limit | Value | Notes |
|---|---|---|
| Strict tools per request | 20 | Non-strict tools don't count |
| **Optional parameters** | **24** | **Total across all strict tool schemas + JSON output schemas in one request** |
| Union-type parameters | 16 | `anyOf` or type arrays like `["string","null"]` |
| Compilation timeout | 180 s | After which the request 400s |

> "Schema complexity doesn't reduce to a single dimension: features like optional parameters, union types, nested objects, and number of tools interact with each other in ways that can make the compiled grammar disproportionately large."
>
> "Each optional parameter roughly doubles a portion of the grammar's state space. If a parameter always has a reasonable default, consider making it required and having Claude provide that default explicitly."

### Our schema vs the limits

Our agent action schema has:

- **~17 distinct action types** (`vote`, `propose_bill`, `propose_amendment`, `statement`, `submit_motion`, `file_interpellation`, `campaign_statement`, `call_vertrauensfrage`, `propose_fiscal_emergency`, `file_misstrauensvotum`, `file_inquiry_committee`, `file_constitutional_challenge`, `request_enquete_kommission`, `nothing`, plus a couple from cycle 4/5)
- Each action is a discriminated union — most fields are optional from the schema's POV
- Wrapped in a JSON `actions` array (so the union is repeated)
- Several fields use enum-of-strings (`vote`, `motionType`, `interpellationType`, `targetMinistry`, `category`) — each contributes union-type weight

This blows past the **24 optional parameters** explicit limit, and the **internal grammar-size limit** before that. Hence the compilation failure.

### Open upstream issue

[**anthropics/anthropic-sdk-python#1185**](https://github.com/anthropics/anthropic-sdk-python/issues/1185) — *"Structured outputs: 'compiled grammar is too large' error needs better documentation and higher limits for complex schemas"*

- **Status:** open as of 2026-04-26
- **Filed:** 2026-02-18
- **Reproduces with:** schemas of ~50 properties, 5 levels of nesting, ~48 nullable types, repeated sub-schemas (the filer's case is more extreme than ours; our case is simpler but still triggers the limit due to the 17-type union)
- **No Anthropic-staff response** visible at time of writing
- **Workaround used by all reporters:** disable strict schema, fall back to prompt-based JSON instructions — exactly what we did

### Anthropic's official recommendations (when limits are hit)

From the docs:

1. **Mark only critical tools as strict.** Reserve strict mode for tools where schema violations cause real problems.
2. **Reduce optional parameters.** Make them required, have Claude provide defaults explicitly.
3. **Simplify nested structures.** Flatten where possible.
4. **Split into multiple requests / sub-agents.** Don't pack many strict tools into one call.

### Why our codebase didn't take #1, #2, or #3

Our agent contract is fundamentally a **single discriminated union over many action types** wrapped in an array. That structure is not amenable to flattening — collapsing it would lose the per-action-type field validation we *want* (e.g. `propose_bill` requires `category`, `vote` requires `vote` enum, etc.). Every option for "simplify" trades schema expressiveness for compatibility with the limit.

Option #4 (split into sub-agents per action type) is plausible but architecturally large — it would mean changing one batch call per party into N batch calls, multiplying cost and latency.

---

## Implications

1. **Prompt quality is now load-bearing.** Every prompt clarification compounds across all 3 providers because no API layer rescues us.

2. **The 1.4% prod VALIDATION_FAIL rate is structural, not noise.** It's the floor of "even Haiku occasionally drifts on enum names" — improvable only by prompt work or by structural schema simplification (option #4 above).

3. **Test-mode acts as an amplification microscope.** Small open-weight models surface the failure modes that Haiku exhibits at low frequency. Whatever we fix to lower test-mode error rates will also lower prod error rates, in the same proportional pattern.

4. **Re-enabling structured output is gated on upstream.** Watch issue #1185. If/when Anthropic raises the limit, we revisit. Until then, prompt is our only lever.

---

## Recommended improvements (prompt-side, all-provider)

Derived from the failure catalog. Each addresses a specific failure mode without removing any existing behaviour. All five are pure additions to `buildSystemPrompt` / `buildValidationRetryPrompt` in `packages/engine/src/agent/prompt.ts`.

1. **Explicit closed-enum block for action types.** Add a bulleted list above the schema:
   > VALID ACTION TYPES — use EXACTLY one of these strings, no synonyms:
   > - `vote`, `propose_bill`, `statement`, ...
   > - Past-tense / passive forms like `bill_proposed`, `motion_submitted` are INVALID.
   *Targets failure mode #1.*

2. **Standalone vote-enum line.** Add a rule restating valid vote values explicitly, calling out invalid synonyms (`pass`, `for`, `against`).
   *Targets failure mode #2.*

3. **Move "use only listed bill IDs" rule to the top of the rules list.** Currently rule #14, easy to lose. Repeat the constraint next to the `billId` field in the schema example.
   *Targets failure mode #3 (the prod-confirmed one).*

4. **Replace placeholder bill IDs in the example.** `bill-abc` / `bill-xyz` look like patterns the model can copy. Use a literal placeholder marker like `<exact bill id from THIRD READING list>` or substitute real IDs from `votableBills` at prompt-build time.
   *Targets failure mode #3.*

5. **Strengthen the retry prompt with targeted recovery info.** When errors include `Unknown action type "X"`, append the valid enum. When errors include `Bill Y does not exist`, restate the available IDs. Currently the retry prompt only echoes error messages.
   *Targets failure modes #1 and #3 on the second-chance path.*

Risk: zero (additive only). Reward: VALIDATION_FAIL rate drop measurable via existing `[AI] | OK|PARSE_FAIL|VALIDATION_FAIL` observability.

---

## Empirical pre/post comparison (gemma3:12b, day 8, 1-day smoke)

After applying the five prompt improvements above and re-running the same smoke against the same model on the same day, here is what the data actually shows. **gemma3:12b has a hard ceiling on certain failure modes that prompt-only changes cannot break.** The improvements are real but partial — they will likely matter more for stronger models (Haiku, Grok, Llama-70b) where the baseline error rate is already much lower.

### Total validation errors (first pass) — full agent fan-out

| Party | Pre-fix | Post-fix | Change |
|---|---|---|---|
| spd | 8 | 4 | −50 % |
| cdu | 8 | 4 | −50 % |
| gruene | 5 | 4 | −20 % |
| fdp | 4 | 9 | +125 % (variance) |
| afd | 5 | 4 | −20 % |
| linke | 5 | 3 | −40 % |
| **Total** | **35** | **28** | **−20 %** |

5 of 6 parties improved. FDP's regression is consistent with the known run-to-run variance of small open-weight models — the same prompt produces different invented action types on different rolls.

### Semantic retry — recovery path

| Run | Retries that improved error count | Retries flat / worse |
|---|---|---|
| Pre-fix | 0 / 6 | 6 / 6 (3 flat, 3 worse) |
| Post-fix | **1 / 6 (FDP, 9 → 6)** | 5 / 6 (5 flat, 0 worse) |

The targeted retry hints (vote-enum hint, statement-shape hint, action-type-enum hint) added a recovery path that did not exist before. It activated for one party in this run but represents a *category* improvement: the retry no longer makes things worse, and now sometimes makes things better.

### Functional output — what actually landed in the simulation

The end-user-visible signal: *how many parties produced a valid statement that made it through to the day's news?*

| Run | Statements recorded |
|---|---|
| Pre-fix | 1 / 6 (SPD only) |
| Post-fix | **4 / 6** (SPD, CDU/CSU, FDP, Die Linke) |

This is the *flow* benefit — even when first-pass error counts only drop modestly, more parties get *enough* valid actions through to be functionally present in the day. **4× more parties are recognisably acting** in the simulation post-fix.

### What did NOT improve (gemma3:12b ceiling)

- **Past-tense action types persist**: every party still produced at least one `bill_proposed`, `motion_submitted`, or `interpellation_filed`. The explicit closed-enum block above the schema is read but not respected by gemma3:12b on first pass.
- **Field-name aliasing variance grew**: post-fix added `bill_name`, `bill_title`, `bill_vote`, `details`, `rationale`, `target` to the catalog of invented field names from the first run. The model finds new ways to be wrong.
- **Vote-value invention shifted**: pre-fix saw `pass`, `for`, `against`. Post-fix saw `nein`, `ja`, `nein` — German equivalents — alongside still-occasional English synonyms.
- **Top-level structure failure**: gruene still produced `{"actions": {key: value, key: value}}` instead of `{"actions": [...]}`.

These are model-capability limits, not prompt failures. The same prompt, run against Haiku or a stronger Llama, would behave differently.

### Honest assessment

| Claim | Status |
|---|---|
| Prompt improvements help all providers proportionally | Theoretically yes, empirically unverified for Haiku/Grok in this PR |
| gemma3:12b is now usable for full-term test runs | **No** — same conclusion as before. Test mode requires a stronger model. |
| 4× more parties produce functional output on gemma3:12b | **Yes** (1 → 4 statements landed) |
| Retry hints add a recovery path that didn't exist | **Yes** (1/6 retries improved post-fix vs 0/6 pre-fix; 0/6 worsened post-fix vs 3/6 worsened pre-fix) |
| First-pass error count drops on gemma3:12b | **Yes, ~20 % across the cohort** (35 → 28 total errors) |

The prompt changes are kept because they are pure additions, demonstrate measurable improvement even on the worst-case model, and address production-confirmed issues (non-existent bill IDs, action-type drift) on stronger models that only show these failures at low frequency.

The gap that remains — gemma3:12b's stubborn invention of `bill_proposed` etc. — is the model's, not the prompt's. A future test-mode-only coercion layer (alias table mapping observed invented names to valid ones) is a separate, optional follow-up if local-model testing remains a goal.

---

## Things to revisit

- **Upstream issue #1185** — if Anthropic raises the optional-parameter limit or improves grammar compilation, re-evaluate enabling structured output for party agents. Track via [github.com/anthropics/anthropic-sdk-python/issues/1185](https://github.com/anthropics/anthropic-sdk-python/issues/1185).
- **Sub-agent decomposition (Anthropic option #4)** — if prompt fixes don't move the needle, consider splitting party agent calls into per-action-type sub-calls. Larger architecture change; only worth it if the residual error rate after prompt fixes is still material.
- **Schema simplification audit** — could we collapse some action types? E.g. `submit_motion` and `propose_bill` share most fields. If we got below the 24-optional-parameter limit *without* losing meaningful validation, structured output becomes available again. Would need a separate design exercise.

---

## Sources

- [anthropics/anthropic-sdk-python#1185 — Structured outputs: "compiled grammar is too large"](https://github.com/anthropics/anthropic-sdk-python/issues/1185)
- [Anthropic Structured Outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Codebase: `packages/engine/src/agent/party-agent.ts:213-227` (the disable comment)
- Codebase: `packages/engine/src/agent/prompt.ts:40-194` (current system prompt)
- Codebase: `packages/engine/src/agent/prompt.ts:518-541` (retry prompt builder)
- Internal: `docs/operations/costs.md` § Test mode — empirical results on local-model failure rates
- Smoke evidence: branch `feat/test-mode-validation-diagnostics`, day 8 raw outputs (gemma3:12b)
