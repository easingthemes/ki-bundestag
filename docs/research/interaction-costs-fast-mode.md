# User Interaction in Fast & Ultra-Fast Modes: Cost & Feasibility Analysis

> Research date: 2026-04-03
> Updated: 2026-04-03 — Added bot seat system analysis (implemented in `claude/fix-bot-permissions-B0irF`)

## Current State

| Feature | Ultra-Fast | Fast | Normal | Slow |
|---------|-----------|------|--------|------|
| ask_questions | - | - | Yes | Yes |
| internal_proposals | - | - | Yes | Yes |
| give_speech | - | - | Yes | Yes |
| mdb_apply | **Bot only** | **Bot only** | Yes | Yes |
| bill_signals | - | - | Yes | Yes |
| upvote_downvote | - | - | Yes | Yes |
| vote_polls | - | - | Yes | Yes |
| vote_referendums | - | - | Yes | Yes |

**Rationale for current design**: Fast/ultra-fast run too quickly for real-time human participation. A sim day takes ~10-17 min real time. Users can't realistically compose questions, read context, and react within that window.

**Bot exception**: Bot users (`is_bot=1`) bypass all participatory/feature gates. They get dedicated `controller="bot"` seats (5% per party, min 1) in all presets and go through the full MdB application flow — apply, AI review, accept/reject. See [Bot Seat System](#bot-seat-system-implemented) below.

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

**Current**: AI selects top N applicants per party, one batch call per party with pending apps.

For human users in normal/slow mode: negligible cost, happens occasionally.

**With bot seats (all presets)**: Bots apply via `run-bot-activity.ts` using templates (no AI cost at submission). The engine's `reviewMdbApplications()` runs the same batch AI review.

| Scenario | Extra Input Tok | Extra Output Tok | Extra Cost/Day | Notes |
|----------|----------------|-----------------|----------------|-------|
| 0 bot apps (no bots active) | 0 | 0 | $0.000 | No change |
| 2-5 bot apps/day (typical) | ~400-1K | ~160-400 | ~$0.001 | +3.5% of baseline |
| 20 bot apps/day (high activity) | ~4K | ~1.6K | ~$0.004 | +14% of baseline |

**Key insight**: Bot applications use templates (~200 tokens each), not AI-generated text. The only AI cost is in the review step, which is already batched. In ultra-fast/fast where no MdB batch previously existed, this adds a **new batch group (+2-4 min/day)**.

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

**With bot seats (already implemented)**: A new MdB review batch is added when bot applications are pending. This is an additional batch submission that didn't exist before in ultra-fast/fast modes.

| Load | Extra Batch Time | New Total/Day | Impact |
|------|-----------------|---------------|--------|
| No bot apps pending | 0 | ~10 min | No change |
| Bot apps only (typical) | ~2-4 min | ~12-14 min | +20-40% |
| Bot + human interactions | ~4-6 min | ~14-16 min | +40-60% |
| Heavy (300 questions + bots) | ~6-8 min | ~16-18 min | +60-80% |

**Per-term impact**: 1461 days x 14 min = ~14 days (vs ~10 days without). Not dramatic.

> Note: Batch API latency is independent of request size (observed: 1-request and 5-request batches both take 2-4 min). Adding more bot apps to an existing MdB batch adds ~0 seconds. The cost is in *having* a batch at all.

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
| **Bot seats only (all presets)** | **$0.001** | **$1.46** | **~$42** | **+3.5%** |
| Light (10 Q/day avg + bots) | $0.005 | $7.30 | ~$48 | +17% |
| Moderate (50 Q/day + proposals + bots) | $0.021 | $30.68 | ~$72 | +75% |
| Heavy (max everything) | $0.080 | $116.88 | ~$158 | +285% |

**Reality check**: Heavy usage requires hundreds of active users submitting content daily. In practice, early-stage usage will be light-to-moderate. Bot seats add a near-constant ~$0.001/day regardless of other interaction levels.

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

**Current solution (implemented)**: Bot users get dedicated `controller="bot"` seats and bypass all feature gates. Human users are still restricted to normal/slow for mdb_apply. This sidesteps seat churn for humans while letting bots fill their reserved 5% allocation in all modes.

**Remaining mitigation options for future human enablement**:
- Longer activity grace periods in fast modes
- "Reservation" system — seat held for N real hours, not sim days
- Separate discipline timelines for fast modes (measure in real-time, not sim days)

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

### Tier C — Keep Normal/Slow Only for Humans (high UX risk in fast modes)

| Feature | Cost Impact | UX Risk | Recommendation |
|---------|-----------|---------|----------------|
| mdb_apply (human) | Low | High (seat churn) | Keep normal/slow for humans |
| request_to_speak | Low | High (missed slots) | Keep normal/slow |
| vote_bills | Low | High (rapid fire) | Keep normal/slow |
| propose_amendments | Low | High (stale context) | Keep normal/slow |

These require sustained engagement that fast modes can't support for human users.

### Tier Bot — All Features, All Presets (implemented)

| Feature | Cost Impact | UX Risk | Status |
|---------|-----------|---------|--------|
| mdb_apply (bot) | ~$0.001/day | None (automated) | **Implemented** |
| All other features | Bypassed | None (bots don't have UX) | **Implemented** |

Bot users bypass `requireParticipatory()` entirely. They get dedicated `controller="bot"` seats (5% per party) and participate through the full application flow in all presets. The bot activity script (`run-bot-activity.ts`) handles `apply_mdb` using templates — zero AI cost at submission, standard batch review cost.

## Bot Seat System (Implemented)

> Branch: `claude/fix-bot-permissions-B0irF`

### Architecture

Three-way seat split per party after elections:

| Controller | Source | Allocation | Filled via |
|------------|--------|-----------|------------|
| `"human"` | Human users | `HUMAN_SEAT_RATIO` (0% ultra-fast/fast, 30% normal, 70% slow) | User application + AI review |
| `"bot"` | Bot users (`is_bot=1`) | `BOT_SEAT_RATIO` (5% all presets, min 1 per party) | Bot application + AI review |
| `"ai"` | AI party agents | Remainder | Automatic, no user assigned |

### Flow

1. Bot activity tick (`run-bot-activity.ts`) -> weighted random selects `apply_mdb`
2. Bot checks: no existing seat, no pending app, no cooldown, open bot seats
3. Creates pending `mdb_applications` row using German template text (~200 tokens)
4. Simulation loop's `reviewMdbApplications()` includes bot apps in the same batch AI review
5. AI selects top applicants -> approved bots assigned to `controller="bot"` seats
6. Bots appear in parliament roster with bot badge, can vote/speak/participate

### Cost Breakdown

| Component | Cost | Frequency | Notes |
|-----------|------|-----------|-------|
| Bot application submission | $0 | Per tick (every ~4h) | Template-based, no AI call |
| MdB review batch (new in ultra-fast/fast) | ~$0.001/day | Daily | 1-6 requests batched, Haiku |
| Bot activity AI calls (questions/proposals) | ~$0.001-0.003/day | Per tick | Standard Haiku, not batched |
| **Total bot overhead** | **~$0.002-0.004/day** | | **+7-14% of baseline** |

### Timing Impact by Preset

| Preset | Before | After (with bots) | Delta |
|--------|--------|-------------------|-------|
| ultra-fast | ~10 min/day (3-4 batches) | ~12-14 min/day (4-5 batches) | **+2-4 min** |
| fast | ~17-22 min/day | ~19-26 min/day | **+2-4 min** |
| normal | ~30 min/day | ~30 min/day | **~0** (MdB batch already existed) |
| slow | ~90 min/day | ~90 min/day | **~0** |

### Per-Term Cost

| Scenario | Cost/Term | vs Base ($41) |
|----------|-----------|---------------|
| Bot seats only (typical ~100 bots) | ~$42.50 | +3.5% |
| Bot seats + light human interaction | ~$49 | +20% |
| Bot seats + moderate interaction | ~$73 | +78% |

### Rate Limit Impact

Bot applications are batched with Anthropic's Message Batches API (separate from standard RPM limits). At ~2-5 extra requests/day, this is negligible against Tier 2's 1,000 RPM and 1,000 batch req/min limits.

The bot activity script's direct Haiku calls (`ask_question`, `submit_proposal`) use standard API pricing at ~$0.001-0.002 per call. With ~100 bots and 5-30% activity chance, this amounts to ~5-15 API calls per tick (every ~4h), well within rate limits.

## Summary

| Dimension | Impact of Enabling Interactions in Fast/Ultra-Fast |
|-----------|--------------------------------------------------|
| **Token usage** | +3.5% (bots only) to +285% (heavy max), realistically +20-70% |
| **Engine timing** | +20-40% per day in ultra-fast (new MdB batch), ~0% in normal/slow |
| **Monthly cost** | $77-$144/month (fast), $96-$144/month (ultra-fast) — within Tier 2 |
| **Per-term cost** | $42-$73 (realistic) vs $41 base |
| **Rate limits** | No concern — batch API handles volume |
| **Real risk** | UX coherence for humans, not cost. Bots have no UX concerns. |

**Bottom line**: Costs are not the blocker. Bot seats add ~$0.001-0.004/day (~$1.50-6/term) with the main timing impact being a new MdB review batch in ultra-fast/fast (+2-4 min/day). For human users, a tiered approach — passive actions everywhere, questions/proposals in fast with shorter expiry, deep participation in normal/slow — gives engagement hooks without breaking the experience. Bots bypass all tiers and participate in every preset.
