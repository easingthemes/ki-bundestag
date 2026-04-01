# 037 — Context & Memory Management Strategy for Long-Running Simulation

**Status**: open
**Area**: Engine / Agent
**Priority**: High

## Problem

The simulation runs 1461 days per election term. As days progress:
- Party agent prompts grow (more bills, events, crises accumulate)
- PARSE_FAIL and VALIDATION_FAIL rates increase (see #033)
- Input token counts rise monotonically → higher costs + lower quality
- Context pollution: signal gets drowned by accumulated noise

This is a well-known problem in long-running LLM agents. The solution isn't larger context windows — it's better context management.

## Research: Industry Best Practices (2025-2026)

### 1. Compaction / Rolling Summary
**Source**: [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

Summarize accumulated history periodically, replacing raw data with compressed summaries. Claude Code itself does this — when context approaches limits, it summarizes and reinitiates with the summary + recent files.

**Application to our sim**: Every N days (e.g., 10), generate a "political era summary" that condenses the last N days of events into a narrative. Use only the summary for older days, keep raw data only for recent days.

### 2. Sliding Window + Summary Buffer (Hybrid)
**Source**: [LangChain ConversationSummaryBufferMemory](https://apxml.com/courses/langchain-production-llm/chapter-3-advanced-memory-management/context-window-management)

Keep a buffer of the most recent N interactions verbatim. Older interactions get summarized. When buffer exceeds token limit, oldest items get summarized and merged.

**Application**: Party agents get:
- Last 7 days of raw events (full detail)
- Summary of days 8-30 (compressed)
- One-paragraph summary of anything older
- Only active bills (not historical)

### 3. Just-in-Time Information Retrieval
**Source**: [Anthropic — Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

Don't pre-load everything. Keep lightweight references and load data dynamically when needed. Claude Code uses CLAUDE.md for persistent context + grep/glob for on-demand retrieval.

**Application**: Instead of including all crisis history in every prompt, keep a "current political landscape" summary that's regenerated periodically.

### 4. Hierarchical Memory (Short-term / Long-term)
**Source**: [AgeMem — Agentic Memory (arXiv 2601.01885)](https://arxiv.org/abs/2601.01885), [Mem0](https://mem0.ai/research)

Separate memory into tiers:
- **Short-term**: Last 7 days of events (raw)
- **Medium-term**: Week-by-week summaries (compressed)
- **Long-term**: Era/epoch summaries (highly compressed)

Mem0's approach: 90% reduction in token consumption (~1.8K tokens vs 26K) by using rolling summary + recent buffer.

### 5. Selective Forgetting / Decay
**Source**: [Memory Management for Long-Running Agents (arXiv 2509.25250)](https://arxiv.org/pdf/2509.25250)

Not all information is equally important. Implement intelligent decay:
- Resolved crises → compress to one-liner
- Passed bills → keep title + outcome, drop debate details
- Failed votes → drop entirely after 14 days
- Active legislation → keep full detail

### 6. Subagent Isolation
**Source**: [Anthropic — Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)

Each subagent gets its own context window. In our case, party agents already run independently — but they all share the same growing briefing context. The briefing itself should be bounded.

## Proposed Implementation Plan

### Phase 1: Immediate Context Windowing (Low effort, High impact)
Directly address #033 — reduce what goes into party agent prompts:

1. **Cap event history to 7 days** in `prompt.ts` (currently ~30 days)
2. **Only include active bills** (not passed/failed/vetoed)
3. **Limit "recent own actions"** to last 5 days
4. **Add explicit valid bill ID list** to reduce VALIDATION_FAIL

**Estimated impact**: 30-50% reduction in input tokens, significant fail rate drop.

### Phase 2: Rolling Summary System (Medium effort, High impact)
Build periodic summarization into the simulation loop:

1. **Every 10 days**: Generate a "political era summary" via AI call
   - Input: last 10 days of events (raw)
   - Output: 200-300 word narrative summary
   - Store in new `era_summaries` table
2. **Party agent prompt structure**:
   - Era summaries (all time, compressed) — ~500 tokens
   - Last 7 days raw events — ~1500 tokens
   - Active bills + current crises — ~500 tokens
   - Party profile + instructions — ~1000 tokens
   - **Total**: ~3500 tokens (bounded, doesn't grow)
3. **Briefing call**: Already exists, but should be bounded to use era summaries for older context

### Phase 3: Claude Code Session Memory (For development workflow)
Manage our own Claude Code sessions better when analyzing long sim runs:

1. **CLAUDE.md memory files**: Store simulation run findings in `.claude/memory/` or `docs/` files that persist across sessions
2. **Compact summaries**: After analyzing 10-day blocks of logs, write findings to a file and reference it in future sessions
3. **Session handoff protocol**: When context gets large, write a structured summary to `docs/session-notes/` before ending

### Phase 4: DB-Backed Memory Store (Future)
For very long runs (multiple election terms):

1. **`era_summaries` table**: `day_from, day_to, summary_text, key_events_json`
2. **`party_memory` table**: Per-party persistent knowledge (alliances, grudges, policy positions evolved over time)
3. **Retrieval**: Query relevant summaries based on current day + active topics

## Affected Files

### Phase 1
- `packages/engine/src/agent/prompt.ts` — context windowing
- `packages/engine/src/agent/party-agent.ts` — bill ID list
- `packages/engine/src/agent/briefing.ts` — cap briefing size

### Phase 2
- New: `packages/engine/src/simulation/era-summary.ts`
- `packages/engine/src/db/schema-sim.ts` — era_summaries table
- `packages/engine/src/simulation/loop.ts` — periodic summary generation
- `packages/engine/src/agent/prompt.ts` — use era summaries

### Phase 3
- `.claude/memory/` directory (new)
- `docs/session-notes/` directory (new)

## Cost Impact

- Phase 1: **Saves money** (fewer input tokens)
- Phase 2: +$0.001/day (one extra Haiku call every 10 days) but saves ~$0.005/day from smaller prompts
- Phase 3: No API cost (development workflow only)
- Phase 4: Minimal (DB storage only)

## Success Metrics

Track via `model-performance` and `error-analysis` workflow checks:
- Average input tokens for `agent:*` tasks should stay **under 4K** regardless of day number
- PARSE_FAIL rate should stay **under 3%** at any simulation phase
- No correlation between day number and fail rate (currently positive correlation)
- Cost per day should remain flat over 100+ day runs
