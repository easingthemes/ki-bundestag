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

| Component | Calls | ~Input Tok | ~Output Tok | Cost |
|-----------|-------|-----------|-------------|------|
| Party agents (5 Anthropic) | 5 | ~10K | ~5K | ~$0.018 |
| AfD agent (xAI) | 1 | ~2K | ~1K | varies |
| Media articles | 1 | ~2K | ~1K | ~$0.004 |
| Daily summary (Sonnet) | 1 | ~3K | ~500 | ~$0.008 |
| Mid-cycle (polls/ref) | 0-2 | ~2K | ~1K | ~$0.004 |
| **Daily total** | **~9** | **~19K** | **~8.5K** | **~$0.03** |

### Per Term (1461 days)

| Preset | Real Duration | Est. Cost |
|--------|--------------|-----------|
| ultra-fast | ~24h | ~$44 |
| fast | ~1 week | ~$44 |
| normal | ~30 days | ~$44 |
| slow | ~5 months | ~$44 |

> Cost is the same regardless of preset — same number of sim days.
> User-driven calls (questions, proposals, MdB) add variable cost.

### Monthly Budget Planning

| Spend Limit | Sim Days Possible | ~Terms |
|-------------|-------------------|--------|
| $30/month | ~1,000 days | 0.68 terms |
| $50/month | ~1,667 days | 1.14 terms |
| $100/month | ~3,333 days | 2.28 terms |

---

## Cost Optimization Strategies

### Already Implemented
- [x] Batch API (50% discount on all Anthropic calls)
- [x] Per-party model selection (cheap Haiku for most, xAI for AfD)
- [x] Sonnet only for synthesis (1 call/day)

### Potential Savings
- [ ] **Prompt caching** — Cache system prompts across parties (up to 90% input savings)
- [ ] **Reduce daily summary model** — Switch synthesis from Sonnet to Haiku (~$0.005/day saved)
- [ ] **Skip media on some days** — Generate articles every 2-3 days instead of daily
- [ ] **Token budget tuning** — Reduce `maxTokens` where responses are short
- [ ] **Haiku 3 while available** — Switch from Haiku 4.5 ($1/$5) to Haiku 3 ($0.25/$1.25) = 75% cheaper (retires Apr 19)
