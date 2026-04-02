# Real-World Cost & Timing Analysis

> **Data source**: Anthropic platform dashboard + simulation logs, 2026-03-30 to 2026-03-31
> **Simulation days**: 1–12 (12 completed days)
> **Context depth**: Normal (token budget 8,000) — DB default, never changed
> **Timing presets**: Days 1–8 fast, days 9+ ultra-fast
> **No users**: Pure AI simulation, 0 human seats

---

## 1. Anthropic Dashboard Data (Haiku 4.5 only)

### Daily Cost (from dashboard chart)

| Date | Preset | Sim Days | Haiku 4.5 Cost | Per Sim Day |
|------|--------|----------|----------------|-------------|
| Mar 30 | fast (+ interruptions) | ~2–3 completed | $0.08 | ~$0.03–0.04 |
| Mar 31 | ultra-fast | ~9–10 completed | $0.26 | ~$0.026–0.029 |
| **Total** | — | **~12** | **$0.34** | **~$0.028** |

> **Note**: Mar 30 had multiple interrupted runs (SSH timeouts, PM2 restarts, abandoned batches). Some tokens were consumed by batches that completed on Anthropic's side but whose results were never polled. This makes the Mar 30 per-day cost appear inflated — wasted tokens from failed runs.

### Week Totals (Mar 30 – Apr 5, filtered to Haiku 4.5)

| Metric | Value |
|--------|-------|
| Total input tokens | 369,599 |
| Total output tokens | 59,718 |
| Total tokens | 429,317 |
| Rate-limited requests | **0** (none) |
| Web searches | 0 |

### Derived Per-Day Token Averages (~12 sim days)

| Metric | Per Sim Day | Our Estimate (normal ctx) | Delta |
|--------|-------------|---------------------------|-------|
| Input tokens | ~30,800 | ~29,300 | **+5%** |
| Output tokens | ~4,976 | ~8,212 | **-39%** |
| Total tokens | ~35,776 | ~37,512 | **-5%** |
| Cost (batch pricing) | ~$0.028 | ~$0.055 | **-49%** |

> The big surprise: **cost is almost half the estimate** at normal context depth. Input tokens are in line with estimates, but output tokens came in at ~5K vs the estimated ~8K. AI agents produce more compact JSON responses than assumed. The cost savings come almost entirely from lower output (which is priced at 5× input at $2.50/MTok batch).

### Cost Calculation Verification

```
Input:  369,599 × $0.50/MTok (batch)  = $0.185
Output:  59,718 × $2.50/MTok (batch)  = $0.149
                                Total = $0.334 ≈ $0.34 ✓ (matches dashboard)
```

### Cache Behavior (from request detail popup)

One expanded request showed:
- Input: 1 token
- Cache Read: 39,867 tokens
- Cache Write (5m): 326 tokens
- Cache Write (1h): 0 tokens

This confirms **prompt caching is working**. The system prompt + party profile + static context is being cached across batch requests (5-minute TTL). The "1 input token" means nearly everything was served from cache for that request.

**Cache savings estimate**: If ~39K of ~40K tokens per request are cache reads at $0.10/MTok instead of $0.50/MTok input, that's ~80% savings on input costs for cached requests. This is already reflected in the dashboard cost numbers.

---

## 2. Timing Analysis (from simulation logs)

### Batch Completion Times (observed from logs)

| Batch Type | Requests | Typical Duration | Polls (30s interval) |
|------------|----------|-----------------|---------------------|
| Party agents (5 Anthropic) | 5 | 2–5 min | 4–10 polls |
| Single request (interpellation/MdB) | 1 | 1–3 min | 2–6 polls |
| End-of-day (media + summary) | 2 | 2–4 min | 4–8 polls |
| Briefing | 1 | 1–3 min | 2–6 polls |

### Per Sim Day Wall Clock (ultra-fast mode, no inter-day delay)

A typical day processes 3–4 batch submissions sequentially:

| Step | Duration | Notes |
|------|----------|-------|
| Pre-A: Briefing batch | ~2 min | 1 Haiku call, day 3+ |
| A: Party agent batch | ~4 min | 5 Haiku + 1 xAI (sequential) |
| B: Mid-cycle (interp/discipline) | ~2 min | 0–2 calls, conditional |
| C: End-of-day (media + summary) | ~3 min | 2 Haiku calls |
| DB writes + state updates | <1s | Negligible |
| **Total per sim day** | **~8–12 min** | **AI-bound** |

### Full Run Timing

| Period | Preset | Sim Days | Wall Clock | Per Day |
|--------|--------|----------|------------|---------|
| Days 1–8 | fast | 8 | ~4–5 hours (with 7min delays + interruptions) | ~35 min |
| Days 9–12 | ultra-fast | 4 | ~40–50 min | ~10–12 min |
| **Total** | mixed | **12** | **~5–6 hours** | — |

### Projected Term Duration (1,461 sim days)

| Preset | Per Day | Projected Term | Previous Estimate |
|--------|---------|---------------|-------------------|
| Ultra-fast | ~10 min | **~10 days** | ~3–7 days |
| Fast | ~10 min + 7 min delay = ~17 min | **~17 days** | ~2 weeks |
| Normal | ~10 min + 30 min delay = ~40 min | **~41 days** | ~30 days |
| Slow | ~10 min + 90 min delay = ~100 min | **~101 days** | ~5 months |

> Ultra-fast is slower than originally estimated because batch API adds ~8–12 min per day (not ~5 min as initially assumed). The "~60s/day" estimate in the web page was based on sequential (non-batch) API calls, which are not used.

---

## 3. Cost Breakdown by Component

### Estimated per-task cost (derived from total)

Based on token ratios from prompt sizes and call counts:

| Task | Calls/Day | Est. Input | Est. Output | Est. Cost/Day |
|------|-----------|-----------|-------------|---------------|
| Daily briefing | 1 | ~2,500 | ~800 | $0.003 |
| Party agents (5 Haiku) | 5 | ~18,000 | ~2,500 | $0.015 |
| AfD agent (xAI) | 1 | ~3,500 | ~500 | ~$0.002 (not in Anthropic data) |
| Media articles | 1 | ~3,000 | ~1,000 | $0.004 |
| Daily summary | 1 | ~2,000 | ~300 | $0.002 |
| Mid-cycle (polls/ref/interp) | 0–2 | ~1,800 | ~400 | $0.002 |
| **Anthropic total** | **~10** | **~27,300** | **~5,000** | **~$0.026** |
| **+ xAI (AfD)** | **1** | **~3,500** | **~500** | **~$0.002** |
| **Grand total** | **~11** | **~30,800** | **~5,500** | **~$0.028** |

### Cost by Context Depth (projected from normal baseline)

| Depth | Input Tokens | Output Tokens | Batch Cost/Day | Status |
|-------|-------------|---------------|---------------|--------|
| Low | ~20,000 (est.) | ~4,000 (est.) | **~$0.020** | Projected (-35% input, no briefing) |
| **Normal** | ~30,800 | ~5,000 | **$0.028** | **Measured** |
| High | ~50,000 (est.) | ~6,000 (est.) | **~$0.040** | Projected (+60% input) |

> Normal→Low removes briefing (~2.5K), own actions (~2K per agent = 10K), fewer events/media = ~10K less input.
> Normal→High doubles lookback windows, adds more events/media = ~20K extra input.

---

## 4. Key Findings & Corrections to Docs

### What was accurate
- Batch API 50% discount: confirmed working
- Cache reads: confirmed working (up to 99% of input from cache)
- No rate limiting: confirmed, 0 blocked requests at Tier 2
- Output tokens ~5K/day: confirmed

### What needs correction

| Metric | Old Estimate | Real Value | Action |
|--------|-------------|------------|--------|
| Input tokens/day (normal) | ~29K | ~31K | Close — slightly higher |
| Output tokens/day | ~8–9K | ~5K | **Update** — agents produce compact JSON |
| Cost/day (normal context) | $0.055 | **$0.028** | **Update — was overestimated by ~2×** |
| Ultra-fast per-day time | ~60s (sequential) / ~5 min (batch) | ~10 min (batch) | Update — batch overhead underestimated |
| Ultra-fast term duration | ~3–7 days | ~10 days | Update |
| Quiet day calls | 9 | ~11 (incl. briefing + conditional) | Update |
| Haiku pricing in web page | $0.80/$4.00 (old Haiku 3.5) | $1.00/$5.00 (Haiku 4.5) | **Fix!** |

> The $0.055 estimate was calculated with non-batch output pricing ($5.00/MTok) but batch pricing is $2.50/MTok. Combined with lower output tokens, the real cost is roughly half.

### The Haiku pricing discrepancy

The web page `SimulationCosts.tsx` lists Haiku as "$0.80 / $4.00" — this is the old **Haiku 3.5** pricing. We actually use **Haiku 4.5** at $1.00/$5.00. The batch pricing is $0.50/$2.50. The cost estimates in the page were calculated using some mix of old and new prices.

The `costs.md` doc correctly lists Haiku 4.5 at $1.00/$5.00, but the web page hardcodes the wrong base prices.

---

## 5. Sonnet Requests (Not Simulation)

Screenshots 1–2 show `claude-sonnet-4-6` requests with "Streaming" type and "Standard" tier. These are **NOT simulation calls** — they are from the Claude Code development session. The simulation only uses Sonnet for coalition synthesis (after elections), and no election occurred in 12 days. All simulation calls go through Batch API, not Streaming.

---

## 6. xAI/Grok Costs (Not in Anthropic Dashboard)

AfD agent uses `grok-3-mini` via xAI API. These calls are sequential (not batched) and their costs appear on xAI's billing, not Anthropic's. Estimated at ~$0.002/day based on ~3,500 input + ~500 output tokens at $0.30/$0.50 per MTok.

---

## 7. Issues Observed in Logs

1. **Abandoned batches**: PM2 restarts during batch polling cause results to be lost. The batch completes on Anthropic's side but is never consumed. Wasted tokens/cost.

2. **Non-existent bill votes**: AI agents try to vote on bills in second reading (not yet votable). Fixed with better prompt hints.

3. **abgeordnetenwatch API 500 errors**: Parliament period 132 outdated. Fixed with fallback array [165, 132].

4. **Batch polling interval**: Changed from 30s to 60s (matching Anthropic docs). Slightly increases per-batch time but reduces API calls.

---

## 8. Recommendations

1. **Update all cost estimates** with real data — the "normal context" estimate of $0.055/day should be ~$0.038/day
2. **Fix Haiku pricing** in web page from $0.80/$4.00 to $1.00/$5.00
3. **Update ultra-fast timing** from "~60s/day" to "~10 min/day" (batch overhead)
4. **Collect more data**: Run at normal/high context depth to verify projections
5. **Track xAI costs** separately — add xAI billing dashboard check to runbook
6. **Consider prompt caching optimization**: Cache hits are high, but explicit cache control could improve hit rates further

---

## 9. Data Collection Needs (Future)

To refine estimates further, collect data from:
- [ ] A full run at **normal** context depth (at least 20 days)
- [ ] A full run at **high** context depth (at least 10 days)
- [ ] An **election cycle** (negotiation + synthesis costs)
- [ ] A run with **active users** (1K+ DAU) to measure user-driven call costs
- [ ] xAI/Grok billing data (separate from Anthropic)
- [ ] Longer period (50+ days) for better statistical averages
- [ ] Different times of day — batch completion times may vary with Anthropic load
