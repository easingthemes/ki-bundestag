# Anthropic API — Costs, Tiers & Rate Limits

> Last updated: 2026-03-30 | Verify at [platform.claude.com/docs](https://platform.claude.com/docs/en/about-claude/pricing)

## Current Project Config

| Role | Model | Provider | Usage |
|------|-------|----------|-------|
| Party agents (5/6) | claude-haiku-4-5-20251001 | Anthropic | ~5 calls/day |
| AfD agent | grok-3-mini | xAI | ~1 call/day |
| Synthesis | claude-sonnet-4-5-20250929 | Anthropic | ~1 call/day |
| Daily/Negotiation | claude-haiku-4-5-20251001 | Anthropic | Variable |

All Anthropic calls go through **Message Batches API (50% discount)**.

### Batch API Latency (observed 2026-03-30 to 2026-03-31)

| Metric | Observed Value |
|--------|---------------|
| Per-batch completion | ~2–5 min (1–5 requests) |
| Batches per sim day | 3–4 |
| **Total per sim day** | **~8–12 min** |
| Rate-limited requests | **0** (Tier 2 sufficient) |

> Batch API adds ~2–5 min latency per submission. With 3–4 batches per day,
> each sim day takes **~10 min** in ultra-fast mode (AI-bound).
> See [timing.md](./timing.md) for detailed observations.
> See [analysis.md](./analysis.md) for full cost analysis from real runs.
> Normal/slow presets absorb this within their inter-day delay (30-90 min).
> PM2 restarts will abandon in-flight batches — wasting tokens.

---

## Token Pricing (per 1M tokens)

### Current-Gen Models

| Model | Input | Output | Batch Input | Batch Output |
|-------|-------|--------|-------------|--------------|
| Claude Opus 4.6 | $5.00 | $25.00 | $2.50 | $12.50 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $1.50 | $7.50 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.50 | $2.50 |

### Legacy Models

| Model | Input | Output | Batch Input | Batch Output |
|-------|-------|--------|-------------|--------------|
| Claude Sonnet 4.5 | $3.00 | $15.00 | $1.50 | $7.50 |
| Claude Haiku 3.5 | $0.80 | $4.00 | $0.40 | $2.00 |
| Claude Haiku 3 | $0.25 | $1.25 | $0.13 | $0.63 |

> Haiku 3 retires 2026-04-19.

### Prompt Caching (stacks with batch discount)

| Model | Cache Write | Cache Read |
|-------|-------------|------------|
| Haiku 4.5 | $1.25/MTok | $0.10/MTok |
| Sonnet 4.6 | $3.75/MTok | $0.30/MTok |

---

## Tiers & Rate Limits

### Tier Requirements

| Tier | Cumulative Deposit | Monthly Spend Limit |
|------|-------------------|---------------------|
| Tier 1 | $5 | $100/month |
| **Tier 2** (current) | $40 | $500/month |
| Tier 3 | $200 | $1,000/month |
| Tier 4 | $400 | $5,000/month |

Advancing between tiers is instant once deposit threshold is met.

### Rate Limits by Tier

| Tier | RPM | Input TPM | Output TPM |
|------|-----|-----------|------------|
| Tier 1 | 50 | 30,000 | 10,000 |
| **Tier 2** | 1,000 | 450,000 | 90,000 |
| Tier 3 | 2,000 | 800,000 | 160,000 |
| Tier 4 | 4,000 | 2,000,000 | 400,000 |

> RPM/TPM are per-model. Cached tokens don't count toward ITPM.
> Batch API has a separate limit: 1,000 requests/min across all models.

---

## Cost Estimates (This Project)

### Per Simulation Day (Batch pricing, Haiku 4.5)

**Measured** (12-day run, low context depth, 2026-03-31):

| Component | Calls | ~Input Tok | ~Output Tok | Cost |
|-----------|-------|-----------|-------------|------|
| Daily briefing (Haiku) | 1 | ~2,500 | ~800 | ~$0.003 |
| Party agents (5 Anthropic) | 5 | ~18,000 | ~2,500 | ~$0.015 |
| AfD agent (xAI) | 1 | ~3,500 | ~500 | ~$0.002 |
| Media articles (Haiku) | 1 | ~3,000 | ~1,000 | ~$0.004 |
| Daily summary (Haiku) | 1 | ~2,000 | ~300 | ~$0.002 |
| Mid-cycle (polls/ref/interp) | 0-2 | ~1,800 | ~400 | ~$0.002 |
| **Daily total** | **~11** | **~31K** | **~5K** | **~$0.028** |

> Context depth is configurable: **low** (~$0.020/day, projected), **normal** (~$0.028/day, **measured**), **high** (~$0.040/day, projected). Numbers above are for "normal" as measured from a 12-day run. Set via GitHub Actions, admin API, or DB column `context_depth`.
> Prompt caching is active — up to 99% of input tokens served from cache at $0.10/MTok.
> See [analysis.md](./analysis.md) for full analysis.

### Per Term (1461 days)

| Preset | Real Duration | Est. Cost (normal ctx) | Notes |
|--------|--------------|----------------------|-------|
| ultra-fast | **~10 days** | **~$41** | AI-bound, ~10 min/day (batch) |
| fast | **~17–21 days** | ~$41 | 7 min delay + ~10 min batch |
| normal | **~41 days** | ~$41 | 30 min delay absorbs batch |
| slow | **~3.4 months** | ~$41 | 90 min delay absorbs batch |

> Cost is the same regardless of preset — same number of sim days.
> Based on measured $0.028/day × 1,461 days = ~$41 (normal context, batch pricing).
> Duration estimates based on measured ~10 min/day batch overhead.
> User-driven calls (questions, proposals, MdB) add variable cost.

### Monthly Budget Planning (normal context, batch pricing)

| Spend Limit | Sim Days Possible | ~Terms |
|-------------|-------------------|--------|
| $30/month | ~1,070 days | 0.73 terms |
| $50/month | ~1,785 days | 1.22 terms |
| $100/month | ~3,570 days | 2.44 terms |

> Based on measured $0.028/day (normal context, Anthropic only).
> xAI costs for AfD agent not included (~$0.002/day extra).

---

## Cost Optimization Strategies

### Already Implemented
- [x] Batch API (50% discount on all Anthropic calls)
- [x] Per-party model selection (cheap Haiku for most, xAI for AfD)
- [x] Sonnet only for synthesis (1 call/day)
- [x] Shared daily briefing (1 Haiku call shared across all 6 parties)
- [x] Party profiles (static, no API cost)
- [x] Cross-day memory via recentOwnActions (14-day lookback, DB query only)

### Potential Savings
- [ ] **Prompt caching** — Cache system prompts across parties (up to 90% input savings)
- [ ] **Reduce daily summary model** — Switch synthesis from Sonnet to Haiku (~$0.005/day saved)
- [ ] **Skip media on some days** — Generate articles every 2-3 days instead of daily
- [ ] **Token budget tuning** — Reduce `maxTokens` where responses are short
- [ ] **Haiku 3 while available** — Switch from Haiku 4.5 ($1/$5) to Haiku 3 ($0.25/$1.25) = 75% cheaper (retires Apr 19)

---

## Free testing alternatives (TEST_MODE)

For full-term simulations, CI runs, and end-to-end tests where production-grade quality is unnecessary, set `TEST_MODE` to route every party + role through a single OpenAI-compatible endpoint and bypass the Anthropic Batches API entirely. Quality is intentionally lower; the goal is unlimited zero-cost runs.

| `TEST_MODE` | Endpoint | Default model | Cost | Quotas |
|---|---|---|---|---|
| `ollama` | `http://localhost:11434/v1` | `gemma3:4b` | $0 (local) | None — bound by local hardware |
| `groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | $0 (free tier) | 30 RPM, 6K TPM, 14.4K req/day; `gemma2-9b-it` has 15K TPM |
| `custom` | `TEST_BASE_URL` | `TEST_MODEL` | depends | depends |

Per-term sizing on Groq's free tier (~11 calls/sim-day measured):

| Daily req cap | Sim days/day | Term (1461 days) |
|---|---|---|
| 14,400 / 11 ≈ **1,300 sim days** | bound by 30 RPM (~2 sim days/min) | **~1.1 terms/day** in throughput |

Ollama has no quota — the limit is local GPU/CPU throughput. On a modest M-series Mac, expect 5–15 sec per call with `gemma3:4b`, so ~1–3 minutes per sim day with `TEST_MODE_CONCURRENCY=4`.

### Observed model quality (Ollama smoke runs)

The default `gemma3:4b` is sufficient to validate the test-mode plumbing but **not** strong enough to exercise simulation logic — its JSON adherence on the agent-action schema is too weak. Empirical findings from a 5-day smoke run on M1 Pro / 32 GB / `TEST_MODE_CONCURRENCY=4`:

| Provider / Model | Size | First-pass agent JSON | Semantic retry behaviour | Verdict |
|---|---|---|---|---|
| Ollama `gemma3:4b` | ~3.3 GB | 1/6 parties OK; rest hit `VALIDATION_FAIL` (markdown fences, unknown action types) → fallback to `abstain-all:after-retry` | Parse-fails entirely — `Response must have an 'actions' array` | Plumbing-only validation; not useful for calibration |
| Ollama `gemma3:12b` | ~9 GB | Same failure modes as 4b on every party tested (SPD: 6 errors, CDU: 4, Grüne: 6); size bump did **not** improve JSON adherence on this schema | Parse-fails identically to 4b | Not useful — same fallback rate as 4b |
| Ollama `qwen2.5:14b` | ~9 GB | Lower error counts than Gemma (SPD: 3, CDU: 1, Grüne: 2, FDP: 3, AfD: 3), but no party reaches 0 errors; "Unknown action type" persists on every party | Actually executes (not parse-fail) — but produces same/different validation errors at similar rates. CDU went 1 → 3 errors after retry (worse). FDP retry hit `Bad Unicode escape in JSON at position 288` → parse-fail | Marginally better than Gemma but **still unusable for simulation logic** — every party falls back |
| Groq `llama-3.3-70b-versatile` | cloud | **No `"Unknown action type"` errors at all.** Real bills proposed, real statements made (e.g. SPD: "Gesetz zur Förderung von sozialer Gerechtigkeit"; Linke: "Gesetz zur Einführung einer progressiven Erwerbstätigenversicherung"). New failure mode: `"Vote for non-existent bill, skipping"` (model hallucinates bill titles plausibly). | Untested in practice — semantic retry calls were all 429'd by TPM limit before completing | **Quality-wise the only viable path so far** — but free tier TPM-bound, see below |

**Failure modes by model class:**

*Ollama (all three tested — gemma3:4b, gemma3:12b, qwen2.5:14b):*

- **`"Unknown action type, skipping"`** — appears on every party of every Ollama model. The model invents action types not in the registered enum.
- **`"Statement missing fields, skipping"`** — statement actions emitted without required fields.
- **`"Invalid vote action, skipping"`** — most often on `qwen2.5:14b` retry attempts.
- Markdown code fences on Gemma in particular; `parseAIJson()`'s strip handles the common case but nested fences or trailing prose break it.
- **Bad Unicode escapes** — observed on qwen retry (`Bad Unicode escape in JSON at position 288`).
- Default Ollama context (`context_length: 4096` per `/api/ps`) is below the agent prompt size; day-6 onward shows context-eviction symptoms under concurrency=4.

*Groq Llama 3.3 70b — fundamentally different failure shape:*

- **No `"Unknown action type"` errors at all.** The 70b model follows the action-type enum from `prompt.ts` correctly. Two parties (SPD, Linke) actually produced valid bill proposals + statements.
- New failure mode: **`"Vote for non-existent bill, skipping"`** — the model hallucinates plausible-sounding German bill titles (e.g. "Gesetz zur Stabilisierung der Rentenbeiträge…") that don't exist in current state. This is model-side hallucination of context, not enum drift.
- **TPM rate-limit pressure dominates** the run on free tier (see below).

**Cross-model conclusion (revised after Groq data): it's a model-capability issue, not a prompt-side drift.**

Earlier hypothesis (after only Ollama data): three open-weight models all hitting `"Unknown action type"` looked like prompt drift between `prompt.ts` and `action-parser.ts`. The Groq run disproves this — the same prompt works cleanly on Llama 3.3 70b. The Ollama models are simply not capable enough to follow the action-type enum: smaller/older models invent plausible-but-rejected variants. The prompt is fine.

This means **Ollama isn't a usable path for exercising real simulation logic on this codebase**, regardless of which model in this size class you pick. Bigger isn't the answer (gemma3:12b proved that); different family isn't either (qwen2.5:14b proved that). Ollama is good for plumbing validation only. For actual agent decisions you need a frontier-class model — Anthropic Haiku in production, Llama 3.3 70b via Groq, or equivalent.

### Groq free-tier operational notes

The Groq free tier on `llama-3.3-70b-versatile` is **TPM-bound, not just RPM-bound** — the limiting constraint for this codebase is tokens per minute, not requests per minute:

| Limit | Free tier | Single batch (concurrency=4) cost | Result |
|---|---|---|---|
| RPM (requests/min) | 30 | 6 requests | OK |
| **TPM (tokens/min)** | **12,000** | **~30,000–40,000** (6 parties × ~5–7K tokens each) | **2.5–3× over budget → 429 storm** |

Day-6 logs showed 4 of 6 parties getting 429'd before the first response landed; semantic retries also 429'd. Net: most parties fell back to `abstain-all` not because of model output but because they never got a model output.

**Workarounds for free tier:**

- **`TEST_MODE_CONCURRENCY=1`** — serialize all calls so token cost spreads across the minute. Still tight at ~6 × 5K = 30K tokens per agent batch, so even serial may hit TPM toward end of minute. Likely needs an additional `setTimeout` between calls in `test-mode.ts`, or a higher-TPM model.
- **Smaller Groq model** — `gemma2-9b-it` has 15K TPM and lower per-call token cost. JSON adherence may be weaker than 70b; worth testing.
- **Pay for Groq Dev tier** — the simplest path if zero-cost isn't a hard requirement.

**Despite the rate-limit churn, what *did* land was high-quality:**

When a Llama 3.3 70b call slipped through the TPM window on day 6, the output was genuinely usable:

- SPD: proposed `"Gesetz zur Förderung von sozialer Gerechtigkeit und Armutsbekämpfung"` (Govt. Bill) + statement; the German legislative title is plausible and on-message for the SPD's policy profile.
- Die Linke: proposed `"Gesetz zur Einführung einer progressiven Erwerbstätigenversicherung"` + statement.
- Both parties' validation errors were `"Vote for non-existent bill, …"` — a hallucinated-context issue, not a schema/enum issue.

**Day 7 first observed Cycle 5 code path firing on a non-Anthropic model:** when SPD's day-6 bill advanced to committee, `[AI] ausschussanhoerung | openai-compatible/llama-3.3-70b-versatile | 1ms | OK` — the Cycle 5 Ausschussanhörung table is exercised end-to-end via test-mode. Plumbing-wise the path works for any TEST_MODE provider, not just Anthropic.

**Wall-clock note:** day 6 took 42.4s, day 7 took 17.4s — counterintuitively a fully-TPM-blocked day runs *faster* than a partial-success day, because 429s return in milliseconds while real generations take seconds. This is worth knowing if you're measuring throughput from logs.

**Updated recommendation order (post Groq + Ollama empirical):**

1. **Anthropic Haiku batch (production path)** — only path that reliably exercises simulation logic at full agent quality. Use real money.
2. **`TEST_MODE=groq` + `TEST_MODE_CONCURRENCY=1`** + possibly `TEST_MODEL=gemma2-9b-it` — likely viable for free; needs ≥1 successful 5-day smoke to confirm. **Best zero-cost path**, but TPM limit is the real bottleneck.
3. **`TEST_MODE=ollama` (any model)** — plumbing validation only. Will not exercise real simulation logic on this codebase regardless of model size or family. Use for end-to-end pipeline tests, not calibration.

When agents fall back to `abstain-all`, **no actual simulation decisions happen** — bills don't get votes, motions don't fire. A run dominated by fallbacks validates AI plumbing but produces zero calibration signal.

### Memory pre-flight — required before launching local Ollama

**Don't assume "32 GB is enough."** A typical workstation with browser tabs, IDEs, Slack, Docker, and other tooling can sit at 25–30 GB used before Ollama is even started. Loading `gemma3:12b` (~9 GB resident) on top of that forces macOS into heavy swap, and **the SSD controller becomes the dominant heat source — not ML compute**. Performance also degrades because model weights get partially paged to disk.

**Before launching a `gemma3:12b` or larger run, check Activity Monitor → Memory:**

| Indicator | Acceptable | Action if not |
|---|---|---|
| Memory pressure graph | Green | Close apps until green |
| Memory used | ≤ ~22 GB (≥10 GB free) | Close memory-heavy apps |
| Swap used | ≤ ~5 GB | Close apps; reboot if swap stays high after closing |
| App memory | ≤ ~6 GB | Quit browser/Slack/Docker/extra IDEs |

Empirical before/after on the same M1 Pro 32 GB box (same Ollama state, only apps closed):

| | Before (heavy apps open) | After (apps closed) |
|---|---|---|
| Memory used | 30.34 GB | 18.78 GB |
| Swap used | 25.16 GB | 2.53 GB |
| Compressed | 8.23 GB | 2.89 GB |
| App memory | 8.79 GB | 3.09 GB |
| Pressure | yellow | green |

In the "before" state, fans ramped to audible within ~1 min of starting the smoke run — driven primarily by SSD heat under sustained 25 GB swap I/O, not by Ollama's GPU compute. In the "after" state, the same workload runs cleanly with green pressure throughout.

**If you can't get to green pressure**, switch to `TEST_MODE=groq`. The free tier's `llama-3.3-70b-versatile` has stronger JSON adherence than `gemma3:12b` *and* zero local memory cost, at the price of network dependency and the 30 RPM / 14.4K req/day limits. On a memory-pressured workstation, Groq beats local Ollama on every operational axis.

### Thermal & memory behaviour on M1 Pro / 32 GB

Once memory pressure is green, sustained Ollama runs at concurrency=4 saturate the SoC. Activity Monitor during a `gemma3:12b` smoke run with the leftover `gemma3:4b` still warm:

| ollama process | Resident RAM | %CPU | %GPU |
|---|---|---|---|
| 12b model worker | ~9.3 GB | ~90% | — |
| 4b model worker (still warm from prior run) | ~4.0 GB | — | ~95% |

Two operational gotchas:

1. **Stale models stay resident.** Ollama keeps the previously used model warm for ~5 minutes (default `keep_alive`). Switching `TEST_MODEL` mid-session leaves both loaded — wasteful on RAM, and the older model can grab the GPU when the scheduler picks it. Evict explicitly after a swap:
   ```bash
   curl -s http://localhost:11434/api/generate -d '{"model":"gemma3:4b","keep_alive":0}' >/dev/null
   ```
2. **Concurrency × model size = thermal load** *(only on a memory-headroom-OK system)*. Each parallel generation needs its own KV-cache. On M1 Pro with green memory pressure, `gemma3:12b` at concurrency=4 pegs both GPU and CPU at ~90% sustained → fans ramp from compute load. Drop to **concurrency=2** for quieter runs, **concurrency=1** for serial / silent. The SoC is rated for sustained load — this fan ramp is healthy thermal behaviour from real ML compute, not damage. *(On a swap-pressured system, the dominant heat source is the SSD instead — close apps, don't lower concurrency.)*

Recommended concurrency by model on M1 Pro 32 GB:

| Model | Quiet (overnight) | Balanced | Aggressive (short smokes) |
|---|---|---|---|
| `gemma3:4b` | 2 | 4 | 8 |
| `gemma3:12b` | 1 | 2 | 4 |
| `qwen2.5:14b` | 1 | 2 | 4 |

### Other operational notes

- **Day 1 is always the slowest** — first batch is a cold start, includes real-world data fetch (`abgeordnetenwatch`/`tagesschau`/`WELT`), and Ollama may need to load the model into VRAM. Expect ~3–7 min on day 1; subsequent days fall to a steady-state baseline.
- **Cleanup messages on rerun** (`[Cleanup] Removed N leftover rows from failed day X`) are normal after a Ctrl-C'd run — the runner self-heals partial state at startup.
- **Cosmetic logging issue:** `[AI] ... | 0ms | OK` — every test-mode log line reports `0ms` latency. The `logAICall()` start-time isn't threaded through the `openai-compatible-client` path. Doesn't affect cost tracking, fallback decisions, or correctness.

### Single-line code change worth doing regardless of model choice

`packages/engine/src/agent/openai-compatible-client.ts` currently sends a plain `/v1/chat/completions` POST **without** `response_format: {type: "json_object"}`. Adding it activates server-side JSON-mode constraint:

- **Ollama** — grammar-constrained JSON output for any model that supports it (most modern ones do).
- **Groq, DeepSeek, OpenAI, OpenRouter, Together, Fireworks** — all support `response_format` natively via their OpenAI-compatible endpoints.

This is the single highest-leverage change available. It might unblock the existing tested models (gemma3:12b, qwen2.5:14b) without touching anything else, and it strictly improves every other path. Single-line patch; cheapest fix in the whole exercise.

### Untested local Ollama models worth trying (research, April 2026)

Three models stand out in 2026 community benchmarks for strict JSON / function-calling adherence — all fit in M1 Pro 32 GB with green pressure:

| Tag | Disk | Why try it | Caveat |
|---|---|---|---|
| **`hermes3:8b`** | 4.7 GB | Nous Research model **purpose-trained** for JSON + function-calling. Eval scores: 84% structured-JSON, 90% function-calling. ChatML format, no `<think>` blocks. Most likely Ollama model to actually clear `"Unknown action type"`. | None known — best first try |
| **`qwen3:14b`** | 9.3 GB | Community consensus 2026 "most stable tool calling"; rarely hallucinates calls or drops parameters | Emits `<think>` blocks by default — add `/no_think` or `thinking: false` in the system prompt to suppress |
| **`deepseek-r1:14b`** | 9.0 GB | R1-0528 update fixed function-calling and JSON adherence; strong reasoning improves action selection | Emits `<think>...</think>` reasoning before JSON. `parseAIJson()` doesn't strip these — needs a one-line regex (`/<think>.*?<\/think>/s`) added before `JSON.parse()`. Code change required. |

DeepSeek V3 (685B) and DeepSeek-Coder-V2 (236B) are too large for any local setup; only viable via cloud API.

### Cheapest cloud-API options (April 2026)

When Ollama can't deliver the parse rate you need (or you don't want to fight it), the cheapest cloud paths — ranked by total cost for our token volume (~66M input + ~15M output per term, ~2.7M + ~600K per 60-day smoke):

| Rank | Provider / Model | $/M in | $/M out | Per-term | 60-day smoke | JSON mode | Notes |
|---|---|---|---|---|---|---|---|
| 1 | **OpenRouter `:free`** (e.g. `openai/gpt-oss-120b:free`, `meta-llama/llama-3.3-70b-instruct:free`) | $0 | $0 | $0 (rate-limited) | **$0** | Yes | 50 req/day without credits; 1,000 req/day with $10 deposit; 20 RPM. 60-day smoke (~600 calls) fits in one day's allowance |
| 2 | **Gemini 2.5 Flash** (AI Studio free tier) | $0 | $0 | N/A (rate-limited) | **$0** | Yes | 1,500 req/day; 60-day smoke fits free. Set `thinkingBudget: 0` to avoid thinking-as-output billing |
| 3 | **Groq `llama-3.1-8b-instant`** (Dev tier) | $0.05 | $0.08 | **$4.50** | $0.18 | Yes | Cheapest paid option overall. Risk: 8B may produce enum errors like other small models — probe first |
| 4 | **Fireworks Llama 8B** (serverless + batch) | ~$0.10 | ~$0.10 | ~**$8.10** (w/ 50% batch) | $0.33 | Yes | $1 signup credit |
| 5 | **Together `Qwen3.5-9B`** | $0.10 | $0.15 | **$8.85** | $0.36 | Yes | 9B model, low risk |
| 6 | **OpenAI `gpt-4.1-nano`** | $0.10 | $0.40 | **$12.60** | $0.51 | Yes (full Schema) | Best JSON enforcement in cheap tier; $5 new-account credit |
| 7 | **DeepSeek `deepseek-v4-flash`** | $0.14 | $0.28 | **$13.44** (drops to ~$5 with 80% cache hit) | $0.55 | Yes | Best balance of cheap + reliable. No free tier |
| 8 | **Cerebras Llama 70B** | $0.60 | $0.60 | $48.60 | $1.98 | 1 of 5 models | 8K context cap may truncate briefings — check first |
| 9 | **Groq `llama-3.3-70b-versatile`** (Dev tier) | $0.59 | $0.79 | $50.79 | $2.07 | Yes | Quality good, expensive |
| 10 | **Anthropic Haiku 4.5** (batch + cache) | $0.50* | $2.50* | ~**$55** | $2.85 | Yes | Production reliability; 5× more expensive than gpt-4.1-nano |

\* Batch API price; production path on this codebase already uses this.

### Decision tree: which path to actually run

**You need a 5–60 day smoke (verify plumbing, exercise Cycle 5 paths, no calibration math):**

```bash
# Cheapest: OpenRouter free tier — gpt-oss-120b supports JSON + 131K context
TEST_MODE=custom \
TEST_BASE_URL=https://openrouter.ai/api/v1 \
TEST_API_KEY=sk-or-... \
TEST_MODEL=openai/gpt-oss-120b:free \
TEST_MODE_CONCURRENCY=2 \
npm run simulate 60

# Alternative: Gemini Flash free tier (no deposit needed)
TEST_MODE=custom \
TEST_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai \
TEST_API_KEY=... \
TEST_MODEL=gemini-2.5-flash \
npm run simulate 60
```

**You need a real 1461-day term run for calibration band verification:**

```bash
# Best $/term value: DeepSeek v4-flash at ~$13/term, JSON mode native, no rate-limit pain
TEST_MODE=custom \
TEST_BASE_URL=https://api.deepseek.com/v1 \
TEST_API_KEY=sk-... \
TEST_MODEL=deepseek-v4-flash \
npm run simulate 1461

# Cheapest paid option ($4.50/term) — but 8B enum-reliability risk:
TEST_MODE=custom \
TEST_BASE_URL=https://api.groq.com/openai/v1 \
TEST_API_KEY=$GROQ_API_KEY \
TEST_MODEL=llama-3.1-8b-instant \
TEST_MODE_CONCURRENCY=1 \
npm run simulate 1461
```

**You want to keep iterating offline (local Ollama):**

```bash
# Most likely to work: Hermes 3 — purpose-trained for JSON
ollama pull hermes3:8b
TEST_MODE=ollama TEST_MODEL=hermes3:8b TEST_MODE_CONCURRENCY=2 npm run simulate 5
```

If `hermes3:8b` still produces `Unknown action type` errors, that's strong signal the `response_format: {type: "json_object"}` patch is the actual missing piece — apply that first, then re-test all the local models we already pulled.

Reference: see `TECHNICAL.md` → "Test Mode" for implementation, `agent/test-mode.ts` for resolution logic, and `.env.example` for all knobs.
