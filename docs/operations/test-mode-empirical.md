# Test Mode — Empirical findings (April 2026)

What actually works for `TEST_MODE=ollama|groq|custom` after PRs #168, #170, #171, #172. Companion to `docs/operations/costs.md` (cost tables) and `docs/research/agent-output-failures.md` (engineering rationale + failure catalog).

## TL;DR

After three engine PRs landed in succession, `TEST_MODE=ollama` with `gemma3:12b` now completes a 1-day simulation end-to-end at $0. Statements debate, interpellations file, the day reaches `[SIM] Simulation complete` without crashes. Bills/votes still partially fail (model omits required fields; non-existent bill IDs); multi-day stability untested.

```bash
# Validated to work as of 2026-04-26
TEST_MODE=ollama TEST_MODEL=gemma3:12b TEST_MODE_CONCURRENCY=2 npm run simulate 1
```

## Empirical progression — three PRs, gemma3:12b 1-day smoke

Same model, same day, same prompt across runs — only the engine changed.

| Stage | Day completes? | Statements (of 6 parties) | Non-statement actions | Retries that improved | Cost |
|---|---|---|---|---|---|
| Baseline | ❌ all 6 VALIDATION_FAIL | 1 (SPD only) | 0 | 0 / 6 | $0 |
| **#170** `response_format: json_object` | ❌ same | 1 | 0 | 0 / 6 | $0 |
| **#171** prompt + retry-prompt clarity | ❌ but errors drop ~20%, retry path partly works | 4 | 0 | 1 / 6 (FDP 9→6) | $0 |
| **#172** TEST_MODE coercion layer | ✅ exit 0 in 9m31s | **5** | **1** (Linke Große Anfrage) | **3 / 6** | $0 |

## What each PR changed

**#170 — `response_format: {type: "json_object"}` on the OpenAI-compatible client.** Eliminates JSON-syntax PARSE_FAILs. Constrains *shape* (valid JSON, no markdown fences, no trailing commas), not *content* (action-type enum, vote enum, field names). Necessary, not sufficient.

**#171 — system prompt + retry prompt improvements (all-provider).**
- Explicit closed-enum block of valid action types above the schema
- Standalone vote-enum rule, bill-ID rule promoted to top
- Copyable bill-ID placeholders (`bill-abc`) replaced with all-caps markers (`<EXACT_BILL_ID_FROM_THIRD_READING_LIST>`)
- Targeted recovery hints in retry prompt, keyed to error class

Cut first-pass errors ~20% across the cohort and turned retry from never-improves into selectively-improves. Did NOT break gemma3:12b's hard ceiling on past-tense action types.

**#172 — `TEST_MODE`-only coercion layer (`packages/engine/src/agent/test-mode-coerce.ts`).** Deterministic alias table that rewrites the predictable invented variants before validation:

| Category | Examples |
|---|---|
| Action types (past-tense → imperative) | `bill_proposed` → `propose_bill`, `motion_submitted` → `submit_motion`, `interpellation_filed` → `file_interpellation`, `bill_vote` → `vote` |
| Action types (drop) | `interpellation_answered`, `kurzintervention`, `response`, `reply` |
| Field names | `bill_id` → `billId`, `bill_name`/`motion_name` → `title`, `details`/`body` → `description` |
| Vote values | `ja`/`nein`/`enthaltung`, `for`/`against`/`pass` → `yes`/`no`/`abstain` |
| Statement disambiguation | `content` → `statement` (statement type only); auto-synthesize `title` |
| Content splitting | For non-statement narrative actions where only `content` is set, split into `title` + `description` |
| Required-field defaults | Zero `impact` / `impactChange`, `motionType=motion`, `interpellationType=kleine`, `category=economy` — stand-ins so actions can land |
| Structural fix | `{actions: {key: value}}` → `{actions: [{type: key, ...}]}` |

Production paths skip coercion entirely (gated on `process.env.TEST_MODE`). Engineering rationale and the empirical failure catalog driving the alias choices are documented in `docs/research/agent-output-failures.md`.

## What works at zero cost today

- `TEST_MODE=ollama` + `gemma3:12b` (M1 Pro 32 GB, concurrency=2): 1-day smoke completes successfully, ~9–13 min/day, $0
- 5 / 6 parties produce valid statements
- Non-statement actions (interpellations, occasionally bills/motions) land when the model populates enough fields for coercion to recover
- No SQLite constraint violations, no crashes

## What's still rough — honest gap list

| Gap | Why | Fixable? |
|---|---|---|
| Vote actions for non-existent bill IDs | Model votes on bills by *title* instead of by ID; coercion can't fuzzy-match without DB lookup | Yes — v3 follow-up: parser-side fuzzy match against current votableBills |
| Bills/motions sometimes still drop | When model emits *only* `content` AND no decent split is possible. Coercion's content-splitter handles many cases but not all | Partial — improve splitter heuristics |
| Multi-day stability untested | Only 1-day smoke validated. Coalition negotiation, elections, cycle-4/5 features may surface new failure modes | Empirical — needs 5–10 day smoke |
| Retry doesn't always improve | 3 / 6 retries improved; 3 / 6 stayed flat. gemma3:12b has a hard conceptual anchor on certain past-tense forms even with hints | Likely solvable on stronger models (Haiku, Llama-70b) |

**Quality caveat:** TEST_MODE is for *flow* testing. Bills the model proposes are nonsense, votes ignore policy alignment, statements are generic. The simulation runs; it doesn't simulate well.

## Decision matrix — what to actually run

| Goal | Recommended path | Cost |
|---|---|---|
| Smoke test (5–60 days), validate plumbing or exercise Cycle 5 paths | `TEST_MODE=ollama gemma3:12b` | $0 |
| Same as above, want better quality | `TEST_MODE=ollama hermes3:8b` (untested with new stack — likely cleaner JSON) | $0 |
| Cloud fallback if local stalls | `TEST_MODE=custom openrouter.ai/.../gpt-oss-120b:free` | $0 (rate-limited) |
| Full 1461-day term, calibration band | Anthropic Haiku batch (production path) | ~$41 |
| Full term, cheap paid alternative | DeepSeek v4-flash via `TEST_MODE=custom` | ~$13 |

## Operational notes

- **Memory pre-flight:** close heavy apps before `TEST_MODE=ollama` runs. Memory pressure on M1 Pro 32 GB swings 18 → 30 GB used depending on what's open. See `docs/operations/costs.md` § Memory pre-flight.
- **Concurrency knob:** `TEST_MODE_CONCURRENCY=2` is the validated value for gemma3:12b on 32 GB. Higher values risk OOM on the parallel fan-out.
- **Iterating on new models:** when a new model surfaces new invented variants in the diagnostic dump, add aliases to `packages/engine/src/agent/test-mode-coerce.ts` — the table is the canonical extension point.
- **Cosmetic logging:** every test-mode `[AI] | 0ms` log line reports zero latency. The `logAICall()` start-time isn't threaded through the openai-compatible-client path. Doesn't affect cost tracking, fallback decisions, or correctness.

## See also

- `docs/operations/costs.md` — cost tables, pricing, tier limits
- `docs/research/agent-output-failures.md` — empirical failure catalog, upstream Anthropic schema-limit context (issue #1185), prompt-improvement rationale
- `TECHNICAL.md` § Structured Output (Disabled) — why prompt-only enforcement is the only option today
- `TECHNICAL.md` § Test Mode — the ENV-var contract and routing implementation
