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

| Model | Size | First-pass agent JSON | Per-day wall clock | Verdict |
|---|---|---|---|---|
| `gemma3:4b` | ~3.3 GB | 1 of 6 parties OK; rest hit `VALIDATION_FAIL` (markdown fences, unknown action types) → fallback to `abstain-all:after-retry` | ~7 min | Plumbing-only validation; not useful for calibration |
| `gemma3:12b` | ~9 GB | Same failure modes as 4b — `VALIDATION_FAIL` on every party tested (SPD: 6 errors, CDU: 4 errors), "Unknown action type"/"Statement missing fields" pattern identical, semantic retry also fails. Size bump did **not** improve JSON adherence on this schema. | TBD | Not useful — same fallback rate as 4b |
| `qwen2.5:14b` | ~9 GB | TBD | TBD | Recommended next try — different model family, generally stronger at structured output |

**Failure modes seen with the Gemma family (4b and 12b both):**

- Markdown code fences (` ```json `) wrap responses, bypassing the parse pipeline; `parseAIJson()`'s strip handles the common case but the model sometimes nests fences or emits trailing prose.
- Action types invented outside the registered enum (`"Unknown action type, skipping"`).
- Statement actions emitted with missing required fields (`"Statement missing fields, skipping"`).
- Default Ollama context (`context_length: 4096` per `/api/ps`) is below the agent prompt size (full state + recent events + bills + media + budget). Day-6 onward shows transient errors consistent with context eviction under concurrency=4.

**Important: scaling Gemma up didn't fix the schema-adherence problem.** `gemma3:12b` produced the same `VALIDATION_FAIL` / `Unknown action type` failure pattern as `gemma3:4b` on the agent-action schema, with semantic retry also failing. This suggests the issue is **schema/prompt-shape vs. model-family fit**, not model size — Gemma's instruction-tuning likely doesn't cover the specific action-type enum used here. Bigger Gemma is not the answer.

**When agents fall back to `abstain-all:after-retry`, no actual simulation decisions are made** — bills don't get votes, motions don't fire, etc. A run dominated by fallbacks tells you the AI plumbing works but produces zero calibration signal.

**Updated recommendation order:**

1. **`TEST_MODE=groq`** — `llama-3.3-70b-versatile` has stronger JSON adherence than any Gemma tested here, zero local memory cost, free tier (30 RPM / 14.4K req/day ≈ 1300 sim days/day throughput). Best operational fit unless you specifically need offline.
2. **`qwen2.5:14b`** locally — different model family, generally stronger at structured output. Try this if you must stay offline. Requires green memory pressure (see pre-flight below).
3. **`gemma3:12b` / `gemma3:4b`** — only useful for plumbing validation, not for exercising simulation logic.

If first-pass success drops below ~70% on any choice, drop concurrency to 2 before swapping models.

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

Reference: see `TECHNICAL.md` → "Test Mode" for implementation, `agent/test-mode.ts` for resolution logic, and `.env.example` for all knobs.
