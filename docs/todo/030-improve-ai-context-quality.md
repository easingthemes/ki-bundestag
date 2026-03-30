# 030 — Improve AI Context Quality (Briefing + Party Profiles)

**Status**: done
**Area**: Engine / Agent / Types
**Priority**: High
**Plan**: [docs/plans/improve-ai-context-quality.md](../plans/improve-ai-context-quality.md)

## Problem

Party AI agents have no cross-day memory, identical personalities, and shallow context. This leads to generic, repetitive, and sometimes contradictory behavior across simulation days.

## Solution

Three improvements (no real-world news — see #029):

1. **Daily briefing call** — 1 extra Haiku call/day that synthesizes a political narrative from the last 30 days of DB history. Shared across all party agents.
2. **Party-specific profiles** — Hand-written personality/voice/strategy profiles injected into each party's system prompt.
3. **Expanded context** — Increase token budget from 3K to 8K. Add "your recent actions" section so parties remember what they did.

## Affected Files

- New: `engine/src/agent/party-profiles.ts`, `engine/src/agent/briefing.ts`
- Modified: `prompt.ts`, `party-agent.ts`, `loop.ts`, `questions.ts`, `interpellations.ts`, `media.ts`
- Types: `types/src/types/agent.ts` (add briefing + recentOwnActions)

## Cost Impact

+$0.03-0.05/day (~1 extra Haiku call + slightly larger prompts)
