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

Reference: see `TECHNICAL.md` → "Test Mode" for implementation, `agent/test-mode.ts` for resolution logic, and `.env.example` for all knobs.
