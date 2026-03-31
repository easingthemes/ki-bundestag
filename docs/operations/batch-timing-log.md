# Batch API Timing Log

Observed real-world latency of Anthropic Message Batches API calls.
Updated as new data becomes available from simulation runs.

## Official Anthropic Docs (as of 2026-03-30)

- **Typical**: Most batches complete within **1 hour**
- **Maximum**: 24 hours hard limit (requests expire after that)
- **Recommended polling**: **60 seconds** (all SDK examples use 60s)
- **Cost discount**: 50% on standard API pricing
- **Results available**: 29 days after batch creation
- **Max batch size**: 100,000 requests or 256 MB (whichever first)
- **No priority tiers**: All batches processed at system's maximum capacity
- **No size-based latency**: Processing speed is independent of batch size

## Observed Timing Data

### 2026-03-30 — First production run (fresh seed, day 1)

| Run | Preset | Context Depth | Mode |
|-----|--------|---------------|------|
| 1 | ultra-fast | low | `runner-auto.ts` (PM2) |
| 2 | fast | low | `runner.ts 6` (SSH foreground) |

**Run 1 — ultra-fast, auto mode (PM2)**

| Batch ID | Task | Requests | Created | Ended | Duration | Status |
|----------|------|----------|---------|-------|----------|--------|
| `msgbatch_01JwsuLYRVfnghFggtdTeLbe` | Party agents | 5 Anthropic | 20:14 | 20:19 | **5 min** | 5 succeeded |

Process was stopped (PM2 restart during deploy) before results could be consumed.
The batch completed on Anthropic's side but results were never polled.

**Run 2 — fast, 6-day foreground (SSH)**

Day 1 only (SSH timed out at 10 min default):

| Batch ID | Task | Requests | Created | Ended | Duration | Polls | Status |
|----------|------|----------|---------|-------|----------|-------|--------|
| `msgbatch_01HpVoJi2f4SgWVaopKzSTQ7` | Party agents | 5 Anthropic | 20:35:57 | 20:40:00 | **4 min** | 8 (30s) | 5 succeeded |
| `msgbatch_01KSZxTZEwT5t8bYTiChhApK` | MdB batch | 1 Anthropic | 20:40:01 | 20:42:02 | **2 min** | 3 (30s) | 1 succeeded |
| `msgbatch_01XZGkSPgME5tzp5UH6***yjk` | Interpellation | 1 Anthropic | 20:42:03 | 20:45:05 | **3 min** | 6 (30s) | 1 succeeded |
| `msgbatch_01HB8a5YuWHk1wHGvNEoJ4ej` | End-of-day (media+summary) | 2 Anthropic | 20:45:06 | — | **>48s** (killed) | 1 (30s) | in_progress |

**Day 1 total time**: ~9.5 min before SSH timeout killed the process.
**Estimated per-day**: ~10-12 min (4 batch submissions with 30s polling).

### Summary Statistics

| Metric | Value |
|--------|-------|
| Avg batch creation to completion | ~3-5 min |
| Min observed | ~2 min (1 request) |
| Max observed | ~5 min (5 requests) |
| Polling interval (was) | 30s |
| Polling interval (now) | 60s (matching Anthropic SDK examples) |
| Batches per sim day | 3-4 (agents, mid-cycle, end-of-day) |
| Estimated time per sim day | ~10-15 min |
| Estimated term (1461 days) | ~3-7 days (ultra-fast), ~2 weeks (fast) |

### Lessons Learned

1. **SSH foreground runs are impractical** for multi-day simulations. Each day takes ~10 min via batch API. Switched to PM2 background execution for N-day runs.
2. **Process must survive SSH disconnect** — PM2 with `--no-autorestart` for finite runs.
3. **Polling at 30s was too aggressive** — Anthropic examples all use 60s. Changed default.
4. **Batch size doesn't affect latency** — 1-request and 5-request batches both take 2-5 min.
5. **Normal/slow presets absorb batch latency** — 30-90 min inter-day delay makes batch overhead invisible.

### 2026-03-31 — Ultra-fast, 12-day run (days 1–12)

| Run | Preset | Context Depth | Mode |
|-----|--------|---------------|------|
| 3 | ultra-fast (days 9+) | low | `runner-auto.ts` (PM2) |

Days 9–12 ran continuously in ultra-fast mode. Per-day wall clock measured from log timestamps:

| Batch Group | Typical Duration | Polls (30s) | Notes |
|-------------|-----------------|-------------|-------|
| Pre-A: Briefing | ~2 min | 2–4 | 1 Haiku call, day 3+ |
| A: Party agents | ~4 min | 4–8 | 5 Haiku (batch) + 1 xAI (sequential) |
| B: Mid-cycle | ~2 min | 2–4 | Conditional (interpellations, discipline) |
| C: End-of-day | ~3 min | 3–6 | Media + summary |
| **Per sim day total** | **~8–12 min** | **~15–20** | **AI-bound, no inter-day delay** |

**Key observations**:
- Batch completion times are consistent: 2–5 min regardless of batch size (1–5 requests)
- xAI sequential call for AfD adds ~2–5s (negligible vs batch overhead)
- No rate limiting observed (Tier 2, 0 blocked requests)
- Prompt caching confirmed working: one request showed 39,867 cache read tokens vs 1 input token
- Abandoned batches from PM2 restarts waste tokens but don't affect subsequent runs

**Updated per-day estimate: ~10 min** (was ~10–15 min, now more precisely measured)

### Updated Summary Statistics

| Metric | Value |
|--------|-------|
| Avg batch creation to completion | ~2–4 min |
| Min observed | ~1 min (1 request) |
| Max observed | ~5 min (5 requests) |
| Polling interval | 30s (may switch to 60s) |
| Batches per sim day | 3–4 (briefing, agents, mid-cycle, end-of-day) |
| **Estimated time per sim day** | **~10 min** |
| **Estimated term (1461 days, ultra-fast)** | **~10 days** |
| **Estimated term (fast, 7 min delay)** | **~17 days** |

## Future Observations

Add new entries below as more data is collected:

```
### YYYY-MM-DD — Description
| Batch ID | Task | Requests | Duration | Status |
|----------|------|----------|----------|--------|
| ... | ... | ... | ... | ... |
```
