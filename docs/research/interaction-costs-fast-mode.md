# User Interaction in Fast & Ultra-Fast Modes: Cost & Feasibility Analysis

> Research date: 2026-04-03

## Current State

| Feature | Ultra-Fast | Fast | Normal | Slow |
|---------|-----------|------|--------|------|
| ask_questions | - | - | Yes | Yes |
| internal_proposals | - | - | Yes | Yes |
| give_speech | - | - | Yes | Yes |
| mdb_apply | - | - | Yes | Yes |
| bill_signals | - | - | Yes | Yes |
| upvote_downvote | - | - | Yes | Yes |
| vote_polls | - | - | Yes | Yes |
| vote_referendums | - | - | Yes | Yes |

**Rationale for current design**: Fast/ultra-fast run too quickly for real-time human participation. A sim day takes ~10-17 min real time. Users can't realistically compose questions, read context, and react within that window.

## The Scenario: Batched Interaction in Fast Modes

Instead of real-time interaction, users accumulate actions between sessions:

- User visits the site, reads what happened over the last N sim days
- Submits questions, proposals, signals, votes — all queued
- Next time the sim processes their target day, it picks up the queue

This already works architecturally — questions/proposals are DB-queued and processed in batches. The sim doesn't wait for user input; it pulls whatever is pending.

## Token & Cost Impact Analysis

### 1. Citizen Questions (biggest cost driver)

**Current**: Up to 50 answers/party/day, batched into one AI call per party.

| Scenario | Extra Input Tok | Extra Output Tok | Extra Cost/Day | Monthly (30 days real) |
|----------|----------------|-----------------|----------------|----------------------|
| 0 questions (current fast) | 0 | 0 | $0.000 | $0.00 |
| 10 questions total (light) | ~2K | ~1K | ~$0.004 | ~$0.12 |
| 50 questions total (moderate) | ~8K | ~4K | ~$0.014 | ~$0.42 |
| 300 questions total (6x50, max) | ~40K | ~20K | ~$0.070 | ~$2.10 |
| 300 questions x high engagement | ~60K | ~30K | ~$0.105 | ~$3.15 |

**Key insight**: Questions scale linearly. At max capacity (300/day across 6 parties), they'd roughly **triple** the daily AI cost from $0.028 to ~$0.098.

But in fast mode, 1 real day = ~80-140 sim days. So 300 questions spread across 100 sim days = only 3 questions/day average. The concern is **bursty accumulation** — a user submits 50 questions in one sitting, all processed on the next sim day.

### 2. Internal Proposals

**Current**: Max 2 accepted/party/day, AI-ranked selection.

| Scenario | Extra Cost/Day | Notes |
|----------|---------------|-------|
| 0 proposals | $0.000 | Current fast mode |
| 1-2 per party | ~$0.006 | One ranking call per party with proposals |
| 10+ per party | ~$0.010 | Still one batch call, just more input text |

Low impact — proposals are compact and the AI just ranks them.

### 3. MdB Speeches

**Current**: Unlimited, AI evaluates exceptions only.

| Scenario | Extra Cost/Day | Notes |
|----------|---------------|-------|
| 0 speeches | $0.000 | Current fast mode |
| 5 speeches/day | ~$0.003 | One batch eval call |
| 50 speeches/day | ~$0.008 | More input, same number of calls |

Low-moderate impact. The exception-based evaluation keeps output tokens minimal.

### 4. MdB Applications

**Current**: AI selects top N applicants per party.

Negligible — happens occasionally, one batch call, small token footprint.

### 5. Passive Actions (No AI Cost)

These features add **zero** AI cost — they're pure DB operations:

- **vote_polls** — Tally update
- **upvote_downvote** — Score update
- **vote_referendums** — Tally update
- **bill_signals** — DB flag
- **vote_bills** — Tally update

Enabling these in fast/ultra-fast is essentially free.

## Timing Impact

### Ultra-Fast Mode (0ms delay)

Current: ~10 min/day (AI-bound, 3-4 batches).

With user interactions enabled, a 5th batch ("user-driven") is added:

| User Load | Extra Batch Time | New Total/Day | Impact |
|-----------|-----------------|---------------|--------|
| None queued | 0 | ~10 min | No change |
| Light (10 questions) | ~2 min | ~12 min | +20% |
| Heavy (300 questions) | ~4 min | ~14 min | +40% |

**Per-term impact**: 1461 days x 14 min = ~14 days (vs ~10 days without). Not dramatic.

### Fast Mode (7 min delay)

Current: ~17-22 min/day (7 min delay + ~10 min batch).

| User Load | New Total/Day | Impact |
|-----------|---------------|--------|
| Light | ~19-24 min | Negligible |
| Heavy | ~21-26 min | +15-20% |

Fast mode already has enough slack to absorb the extra batch.

## Cost Projections: Full Term with Interactions

### Base cost: $41/term (no interactions)

| Interaction Level | Extra/Day | Extra/Term | Total/Term | vs Base |
|-------------------|----------|-----------|------------|---------|
| Passive only (polls, votes, signals) | $0.000 | $0.00 | $41 | +0% |
| Light (10 Q/day avg) | $0.004 | $5.84 | ~$47 | +14% |
| Moderate (50 Q/day + proposals) | $0.020 | $29.22 | ~$70 | +71% |
| Heavy (max everything) | $0.080 | $116.88 | ~$158 | +285% |

**Reality check**: Heavy usage requires hundreds of active users submitting content daily. In practice, early-stage usage will be light-to-moderate.

## Monthly Budget Impact (Tier 2: $500/month limit)

In **ultra-fast mode**, ~100 sim days/real day:

| Interaction Level | Cost/Real Day | Cost/Real Month | Within Tier 2? |
|-------------------|--------------|----------------|-----------------|
| No interactions | $2.80 | $84 | Yes |
| Light | $3.20 | $96 | Yes |
| Moderate | $4.80 | $144 | Yes |
| Heavy | $10.80 | $324 | Yes (tight) |

In **fast mode**, ~80 sim days/real day:

| Interaction Level | Cost/Real Day | Cost/Real Month | Within Tier 2? |
|-------------------|--------------|----------------|-----------------|
| No interactions | $2.24 | $67 | Yes |
| Light | $2.56 | $77 | Yes |
| Moderate | $3.84 | $115 | Yes |
| Heavy | $8.64 | $259 | Yes |

Even heavy usage stays within Tier 2 limits.

## The Real Problem: UX, Not Cost

Cost and timing are manageable. The harder questions are:

### 1. Question Staleness
In ultra-fast mode, by the time a question is answered, 50+ sim days may have passed. A question about "the current coalition talks" might be answered when those talks ended 40 sim days ago. The answer would be contextually wrong or confusing.

**Mitigation options**:
- Include question submission day in the AI prompt context ("asked on day X, now day Y")
- Auto-expire questions faster in fast modes (e.g., 3 days instead of 14)
- Let AI acknowledge temporal gap in answers

### 2. Engagement Coherence
Users in fast mode see a torrent of events. Their proposals and speeches land in a context that's moved far beyond what they saw when submitting.

**Mitigation options**:
- Show users a "your action was processed on day X" notification with context
- Queue display: show pending actions with estimated processing day
- "Catch-up" summaries when user returns

### 3. MdB Seat Churn
If applications are enabled in fast mode, seats could churn rapidly. A user applies, gets seated on day 100, but by day 150 (30 min later real-time) they haven't participated and lose the seat.

**Mitigation options**:
- Longer activity grace periods in fast modes
- Don't enable mdb_apply in fast (keep it normal/slow only)
- "Reservation" system — seat held for N real hours, not sim days

### 4. Vote Flooding
Passive actions (polls, referendums) could be gamed — one user votes on 100 polls that all resolve within an hour.

**Mitigation options**:
- Rate limit per real-time, not sim-time
- Weight votes by engagement score

## Recommendation: Tiered Enablement

Rather than all-or-nothing, enable features progressively:

### Tier A — Enable in Fast & Ultra-Fast (zero/minimal cost)

| Feature | Cost Impact | UX Risk | Recommendation |
|---------|-----------|---------|----------------|
| vote_polls | $0 | Low (polls resolve fine) | Enable |
| upvote_downvote | $0 | None | Enable |
| vote_referendums | $0 | Low | Enable |
| bill_signals | $0 | None | Enable |

These are pure DB operations. Users can signal preferences even if they can't follow every day. Polls and referendums work fine asynchronously.

### Tier B — Enable in Fast Only (low cost, needs UX care)

| Feature | Cost Impact | UX Risk | Recommendation |
|---------|-----------|---------|----------------|
| ask_questions | ~$0.004-0.014/day | Medium (staleness) | Enable with shorter expiry (5 days) |
| internal_proposals | ~$0.006/day | Low | Enable |
| give_speech | ~$0.003-0.008/day | Medium (context drift) | Enable with day-context display |

Fast mode (7 min/day) gives enough breathing room. Users can meaningfully engage if they check in periodically.

### Tier C — Keep Normal/Slow Only (high UX risk in fast modes)

| Feature | Cost Impact | UX Risk | Recommendation |
|---------|-----------|---------|----------------|
| mdb_apply | Low | High (seat churn) | Keep normal/slow |
| request_to_speak | Low | High (missed slots) | Keep normal/slow |
| vote_bills | Low | High (rapid fire) | Keep normal/slow |
| propose_amendments | Low | High (stale context) | Keep normal/slow |

These require sustained engagement that fast modes can't support.

## Summary

| Dimension | Impact of Enabling Interactions in Fast/Ultra-Fast |
|-----------|--------------------------------------------------|
| **Token usage** | +14% (light) to +285% (heavy max), realistically +20-70% |
| **Engine timing** | +15-40% per day, still well within acceptable range |
| **Monthly cost** | $77-$144/month (fast), $96-$144/month (ultra-fast) — within Tier 2 |
| **Per-term cost** | $47-$70 (realistic) vs $41 base |
| **Rate limits** | No concern — batch API handles volume |
| **Real risk** | UX coherence, not cost. Stale questions and context drift. |

**Bottom line**: Costs are not the blocker. A tiered approach — passive actions everywhere, questions/proposals in fast with shorter expiry, deep participation in normal/slow — gives users engagement hooks without breaking the experience.
