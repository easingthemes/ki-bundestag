# AI Model Usage & Cost Analysis

## Time Scale

1 sim day ~ 1 week of real parliament. Key cycles:

| Cycle | Sim Days | Real-World Equivalent |
|-------|----------|----------------------|
| Weekly | 7 days | ~1 month (polls, approval recalculations) |
| Monthly | 30 days | ~1 quarter (economic reports, referendums) |
| Budget | 60 days | ~half a year |
| **Wahlperiode** | **120 days** | **~1 legislative term (election + full government cycle)** |

Wall clock: ~40–60s per sim day (30s interval + AI latency). A full Wahlperiode takes ~1.5–2 hours.

## Current Models

| Model | Provider | Price (Input) | Price (Output) | Used For |
|-------|----------|--------------|----------------|----------|
| claude-haiku-4-5-20251001 | Anthropic | $0.80 / 1M tok | $4.00 / 1M tok | Party agents, media, polls, referendums, summaries, Q&A, interpellations, proposals, negotiations |
| claude-sonnet-4-5-20250929 | Anthropic | $3.00 / 1M tok | $15.00 / 1M tok | Coalition agreement synthesis (rare) |
| grok-3-mini | xAI | $0.30 / 1M tok | $0.50 / 1M tok | AfD party agent + AfD-specific calls |

## AI Calls Per Simulation Day

### Simulation-Driven (Always Happen)

| Action | Model | Max Tokens (Out) | Est. Input Tokens | Calls/Day | Frequency |
|--------|-------|-----------------|-------------------|-----------|-----------|
| Party Agent (SPD, CDU, Gruene, FDP, Linke) | Haiku | 2048 | ~3000 | 5 | Always |
| Party Agent (AfD) | Grok-3-mini | 2048 | ~3000 | 1 | Always |
| Daily Summary | Haiku | 320 | ~800 | 1 | Always |
| Media Articles (2-3 per call) | Haiku | 2048 | ~1500 | 0-1 | Always |
| Context Poll | Haiku | 512 | ~600 | 0-1 | Weekly (7d) |
| Referendum | Haiku | 512 | ~600 | 0-1 | Monthly (30d) |

### User/Visitor-Driven (Only If Activity Exists)

| Action | Model | Max Tokens (Out) | Est. Input Tokens | Calls/Day | Trigger |
|--------|-------|-----------------|-------------------|-----------|---------|
| Citizen Q&A | Haiku/Grok | 512 | ~300 | 0-3 | Users submit questions |
| Interpellation Answer | Haiku/Grok | 300 | ~400 | 0-2 | Agent files interpellation |
| Proposal Review | Haiku/Grok | 256 | ~400 | 0-6 | Users submit + vote on proposals (need 3 votes) |

### Election-Only (~Every 120 Days / 1 Wahlperiode)

| Action | Model | Max Tokens (Out) | Est. Input Tokens | Calls/Round | Total Calls |
|--------|-------|-----------------|-------------------|-------------|-------------|
| Negotiation Round (per party) | Haiku/Grok | 1024 | ~1200 | 5-6 | 15-18 (3 rounds) |
| Coalition Synthesis | **Sonnet** | 4096 | ~2000 | 1 | 1 |

## Cost Estimates

### Typical Simulation Day (No Election, No Visitors)

| Call Type | Count | Input Tokens | Output Tokens | Cost |
|-----------|-------|-------------|---------------|------|
| 5x Party Agent (Haiku) | 5 | 15,000 | 5,000 | $0.032 |
| 1x Party Agent (AfD/Grok) | 1 | 3,000 | 1,000 | $0.0014 |
| Daily Summary | 1 | 800 | 200 | $0.0014 |
| Media Articles | 1 | 1,500 | 1,500 | $0.0072 |
| **Total** | **8** | **20,300** | **7,700** | **~$0.047** |

### Typical Day WITH Active Visitors

| Call Type | Count | Input Tokens | Output Tokens | Cost |
|-----------|-------|-------------|---------------|------|
| Base (above) | 8 | 20,300 | 7,700 | $0.047 |
| Citizen Q&A | 3 | 900 | 900 | $0.0043 |
| Interpellation Answers | 2 | 800 | 400 | $0.0022 |
| Proposal Reviews | 3 | 1,200 | 450 | $0.0028 |
| **Total** | **16** | **23,200** | **9,450** | **~$0.056** |

### Election Cycle (3 Negotiation Days)

| Call Type | Count | Input Tokens | Output Tokens | Cost |
|-----------|-------|-------------|---------------|------|
| Negotiation Rounds (3x6) | 18 | 21,600 | 10,800 | $0.060 |
| Coalition Synthesis (Sonnet) | 1 | 2,000 | 3,000 | $0.051 |
| **Election Total** | **19** | **23,600** | **13,800** | **~$0.111** |

## Aggregated Estimates

### Per Sim Day / Sim Month / Wahlperiode

| Scenario | Calls/Day | Cost/Day | Cost/Month (30d) | Cost/Wahlperiode (120d + 1 election) |
|----------|-----------|----------|------------------|--------------------------------------|
| Quiet (no visitors, no election) | 8 | $0.047 | $1.41 | **$5.75** |
| Active (visitors + questions) | 16 | $0.056 | $1.68 | **$6.83** |
| Election month (1 election) | ~9 | $0.051 | $1.52 | **$6.23** |
| Busy month (visitors + election) | ~17 | $0.060 | $1.79 | **$7.31** |

### Per Real Day / Real Month (simulate:auto, 30s interval + AI latency)

Auto-sim interval is 30s, but AI calls add 5–30s per sim day. Realistic throughput is **~1,400 sim days/real day**, not the theoretical 2,880.

| Scenario | Sim Days/Real Day | Wall Clock/Day | Cost/Real Day | Cost/Real Month |
|----------|-------------------|----------------|---------------|-----------------|
| Auto-sim (quiet, realistic) | ~1,400 | ~60s/day | $66 | $1,974 |
| Auto-sim (active, realistic) | ~1,400 | ~60s/day | $78 | $2,352 |
| Auto-sim (theoretical max) | 2,880 | 30s/day | $135 | $4,050 |
| Manual (5 days/run, 3 runs/day) | 15 | — | $0.71 | $21.2 |
| Manual (10 days/run, 1 run/day) | 10 | — | $0.47 | $14.1 |

## Alternative Model Comparison

If all calls used a single model instead of the current mix. Per Real Day uses realistic ~1,400 sim days/real day throughput.

| Model | Price (In / Out) | Per Sim Day | Per Wahlperiode (120d) | Per Real Day (auto) | vs Current |
|-------|-----------------|-------------|------------------------|---------------------|------------|
| **All Haiku** (current default) | $0.80 / $4.00 | $0.047 | **$5.75** | $66 | baseline |
| All Grok-3-mini (cheapest) | $0.30 / $0.50 | $0.010 | **$1.22** | $14 | **-79%** |
| All Sonnet (premium) | $3.00 / $15.00 | $0.177 | **$21.42** | $248 | **+276%** |
| GPT-4o-mini (OpenAI) | $0.15 / $0.60 | $0.008 | **$0.97** | $11 | **-83%** |
| Gemini 2.0 Flash (Google) | $0.10 / $0.40 | $0.005 | **$0.61** | $7 | **-89%** |

## Notes

- **Wahlperiode** = 120 sim days = 1 full legislative period. This is the natural unit for total simulation cost.
- **Wall-clock time per sim day**: 30s interval + 5–30s AI latency = ~40–60s typical. Election negotiation days can take 60–90s.
- **Realistic auto-sim throughput**: ~1,400 sim days/real day (not 2,880). The 30s interval is the minimum, but AI call latency adds overhead on every tick.
- **Output tokens are estimates** — actual usage is typically 30-60% of maxTokens
- **Input token estimates** based on typical prompt sizes observed in code (system + user prompt)
- **Sim day cycles**: polls every 7d, economic reports every 30d, budgets every 60d, elections every 120d (1 Wahlperiode). Snap elections possible from confidence votes or budget failures.
- **Visitor simulation** (`npm run simulate:visitors`) does NOT trigger additional AI calls — it only performs UI actions (voting, submitting questions, etc.) which the *next* simulation run processes
- **AfD/Grok savings**: Using grok-3-mini for 1/6 of party calls saves ~$0.005/day (~10% of party agent cost)
- **Synthesis (Sonnet)** is the most expensive single call but happens only ~3 times per election cycle (~once per Wahlperiode)
