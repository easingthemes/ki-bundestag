# Multi-Provider AI Integration

## Summary

- **Status**: ✅ Completed (5 steps)
- **Date**: February 21, 2026
- **Changes**:
  - Integrated Vercel AI SDK v6 for multi-provider AI support (Anthropic + xAI)
  - Per-party model configuration: AfD→xAI grok-3-mini ($0.30/$0.50), others→Anthropic Haiku ($0.80/$4.00)
  - Per-role model configuration: daily/negotiation (Haiku), synthesis (Sonnet)
  - Unified `callAI()` interface with automatic provider routing
  - Migrated all 11 AI call sites (party agent + 10 simulation files)
  - Removed `@anthropic-ai/sdk` dependency, cleaned up old exports
  - Updated Admin UI to display 6 party models + 3 role models
  - Environment overrides: `MODEL_PARTY_<ID>`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`

## Goal

Make AI model provider configurable per party, integrating xAI (Grok) via Vercel AI SDK alongside existing Anthropic SDK, with AfD using xAI as first non-Anthropic party.

## Completed Steps

### Step 1: Install Vercel AI SDK + provider packages
- **Status**: done
- **Files**: `packages/engine/package.json`, `package-lock.json`
- **Result**: Installed `ai@6.0.97`, `@ai-sdk/anthropic@3.0.46`, `@ai-sdk/xai@3.0.57`

### Step 2: Create per-party model config + unified AI client
- **Status**: done
- **Files**: `packages/engine/src/agent/model-config.ts` (new), `packages/engine/src/agent/client.ts`, `packages/engine/src/agent/index.ts`, `packages/engine/src/index.ts`
- **Result**: Created `PARTY_MODELS` map (6 parties), `ROLE_MODELS` map (3 roles), unified `callAI()` function. Env override support: `MODEL_PARTY_<ID>` + backward-compat for existing role env vars.

### Step 3: Migrate party-agent.ts to unified client
- **Status**: done
- **Files**: `packages/engine/src/agent/party-agent.ts`
- **Result**: Replaced direct Anthropic SDK calls with `callAI({partyId})`. Validated with Day 104 simulation: all 6 parties responded, AfD via xAI grok-3-mini confirmed (1156 chars).

### Step 4: Migrate all other AI call sites
- **Status**: done
- **Files**: 9 simulation files (`negotiations.ts`, `media.ts`, `polls.ts`, `referendums.ts`, `interpellations.ts`, `internal-proposals.ts`, `summary.ts`, `questions.ts`, plus `loop.ts`)
- **Result**: Migrated 10 AI call sites. Per-party calls use `partyId`, system-wide calls use `roleKey`. Validated with Day 105 simulation: all features working (agents, interpellations, media, polls).

### Step 5: Clean up + expose config in Admin page
- **Status**: done
- **Files**: `packages/engine/src/agent/client.ts`, `packages/engine/src/agent/party-agent.ts`, `packages/engine/src/agent/index.ts`, `packages/engine/src/simulation/loop.ts`, `packages/engine/src/simulation/negotiations.ts`, `packages/engine/package.json`, `.env.example`, `packages/web/src/pages/Admin.tsx`, `.claude/CLAUDE.md`
- **Result**: Removed old Anthropic SDK code (`getClient()`, `MODELS`, `MAX_TOKENS`), removed dependency. Updated .env.example with XAI_API_KEY + override examples. Admin UI now shows 9-row model config table. Validated with Day 106 simulation + full build.
