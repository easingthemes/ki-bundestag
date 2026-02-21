# AI Model Usage & Cost Analysis

## Current Models

| Model | Provider | Price (Input) | Price (Output) | Used For |
|-------|----------|--------------|----------------|----------|
| claude-haiku-4-5-20251001 | Anthropic | $0.80 / 1M tok | $4.00 / 1M tok | Party agents, media, polls, referendums, summaries, Q&A, interpellations, proposals, negotiations |
| claude-sonnet-4-5-20250929 | Anthropic | $3.00 / 1M tok | $15.00 / 1M tok | Coalition agreement synthesis (rare) |
| grok-3-mini | xAI | $0.30 / 1M tok | $0.50 / 1M tok | AfD party agent + AfD-specific calls |

## AI Calls Per Simulation Day

### Simulation-Driven (Always Happen)

| Action | Model | Max Tokens (Out) | Est. Input Tokens | Calls/Day | Depends on Visitors? |
|--------|-------|-----------------|-------------------|-----------|---------------------|
| Party Agent (SPD, CDU, Gruene, FDP, Linke) | Haiku | 2048 | ~3000 | 5 | No |
| Party Agent (AfD) | Grok-3-mini | 2048 | ~3000 | 1 | No |
| Daily Summary | Haiku | 320 | ~800 | 1 | No |
| Media Articles (2-3 per call) | Haiku | 2048 | ~1500 | 0-1 | No |
| Context Poll | Haiku | 512 | ~600 | 0-1 (weekly) | No |
| Referendum | Haiku | 512 | ~600 | 0-1 (every 30 days) | No |

### User/Visitor-Driven (Only If Activity Exists)

| Action | Model | Max Tokens (Out) | Est. Input Tokens | Calls/Day | Trigger |
|--------|-------|-----------------|-------------------|-----------|---------|
| Citizen Q&A | Haiku/Grok | 512 | ~300 | 0-3 | Users submit questions |
| Interpellation Answer | Haiku/Grok | 300 | ~400 | 0-2 | Agent files interpellation |
| Proposal Review | Haiku/Grok | 256 | ~400 | 0-6 | Users submit + vote on proposals (need 3 votes) |

### Election-Only (Rare, ~Every 120 Days)

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

### Per Sim Day / Sim Month

| Scenario | Calls/Day | Cost/Day | Calls/Month (30d) | Cost/Month |
|----------|-----------|----------|-------------------|------------|
| Quiet (no visitors, no election) | 8 | $0.047 | 240 | $1.41 |
| Active (visitors + questions) | 16 | $0.056 | 480 | $1.68 |
| Election month (1 election) | ~8+19/30 | $0.051 | 259 | $1.52 |
| Busy month (visitors + election) | ~17 | $0.060 | 499 | $1.79 |

### Per Real Day / Real Month (simulate:auto, 30s interval = ~2880 sim days/real day)

| Scenario | Sim Days/Real Day | Cost/Real Day | Cost/Real Month |
|----------|-------------------|---------------|-----------------|
| Auto-sim (quiet) | 2,880 | $135 | $4,050 |
| Auto-sim (active) | 2,880 | $161 | $4,838 |
| Manual (5 days/run, 3 runs/day) | 15 | $0.71 | $21.2 |
| Manual (10 days/run, 1 run/day) | 10 | $0.47 | $14.1 |

## Alternative Model Comparison

If all calls used a single model instead of the current mix:

### All Haiku (current default for 5/6 parties)

| Metric | Per Sim Day | Per Sim Month | Per Real Day (auto) |
|--------|-------------|---------------|---------------------|
| Calls | 8-16 | 240-480 | 23K-46K |
| Input cost | $0.016 | $0.49 | $47 |
| Output cost | $0.031 | $0.92 | $88 |
| **Total** | **$0.047** | **$1.41** | **$135** |

### All Grok-3-mini (cheapest option)

| Metric | Per Sim Day | Per Sim Month | Per Real Day (auto) |
|--------|-------------|---------------|---------------------|
| Calls | 8-16 | 240-480 | 23K-46K |
| Input cost | $0.006 | $0.18 | $17 |
| Output cost | $0.004 | $0.12 | $11 |
| **Total** | **$0.010** | **$0.30** | **$29** |
| **Savings vs current** | **79%** | **79%** | **79%** |

### All Sonnet (premium option)

| Metric | Per Sim Day | Per Sim Month | Per Real Day (auto) |
|--------|-------------|---------------|---------------------|
| Calls | 8-16 | 240-480 | 23K-46K |
| Input cost | $0.061 | $1.83 | $176 |
| Output cost | $0.116 | $3.47 | $333 |
| **Total** | **$0.177** | **$5.30** | **$509** |
| **Extra vs current** | **+276%** | **+276%** | **+276%** |

### GPT-4o-mini (OpenAI alternative)

| Metric | Price In/Out | Per Sim Day | Per Sim Month | Per Real Day (auto) |
|--------|-------------|-------------|---------------|---------------------|
| Cost | $0.15 / $0.60 per 1M | $0.008 | $0.23 | $22 |
| **Savings vs current** | | **83%** | **83%** | **83%** |

### Gemini 2.0 Flash (Google alternative)

| Metric | Price In/Out | Per Sim Day | Per Sim Month | Per Real Day (auto) |
|--------|-------------|-------------|---------------|---------------------|
| Cost | $0.10 / $0.40 per 1M | $0.005 | $0.16 | $15 |
| **Savings vs current** | | **89%** | **89%** | **89%** |

## Notes

- **Output tokens are estimates** — actual usage is typically 30-60% of maxTokens
- **Input token estimates** based on typical prompt sizes observed in code (system + user prompt)
- **Election frequency**: Default every 120 sim days; snap elections possible from confidence votes or budget failures
- **Visitor simulation** (`npm run simulate:visitors`) does NOT trigger additional AI calls — it only performs UI actions (voting, submitting questions, etc.) which the *next* simulation run processes
- **AfD/Grok savings**: Using grok-3-mini for 1/6 of party calls saves ~$0.005/day (~10% of party agent cost)
- **Synthesis (Sonnet)** is the most expensive single call but happens only ~3 times per election cycle (~once per 120 sim days)
