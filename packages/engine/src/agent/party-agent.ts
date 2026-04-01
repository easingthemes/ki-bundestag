import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "./client.js";
import { logAICall } from "./ai-json.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import type { PartyCapabilities } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";
import type { BatchRequest, BatchResult } from "./batch-client.js";
import { getPartyModel } from "./model-config.js";
import type { Provider } from "./model-config.js";
import type { DepthConfig } from "./context-depth.js";

/**
 * JSON Schema for Anthropic structured output — agent response.
 * Matches the AgentResponse type: { actions: AgentAction[] }.
 * Passed directly as `output_config.format.schema` in the Anthropic API.
 */
const AGENT_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          billId: { type: "string" },
          vote: { type: "string" },
          reason: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string" },
          impact: {
            type: "object",
            properties: {
              budget: { type: "number" },
              unemployment: { type: "number" },
              inflation: { type: "number" },
              gdpGrowth: { type: "number" },
              publicSentiment: { type: "number" },
            },
            additionalProperties: false,
          },
          impactChange: {
            type: "object",
            properties: {
              budget: { type: "number" },
              unemployment: { type: "number" },
              inflation: { type: "number" },
              gdpGrowth: { type: "number" },
              publicSentiment: { type: "number" },
            },
            additionalProperties: false,
          },
          statement: { type: "string" },
          motionType: { type: "string" },
          interpellationType: { type: "string" },
          question: { type: "string" },
          targetMinistry: { type: "string" },
          promise: { type: "string" },
          arguments: { type: "string" },
          proposedChancellor: { type: "string" },
          proposedChancellorPartyId: { type: "string" },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  required: ["actions"],
  additionalProperties: false,
};

/** Derive capabilities from agent context for conditional system prompt. */
function deriveCapabilities(ctx: AgentContext): PartyCapabilities {
  const hasFraktion = ctx.hasFraktion !== false && ctx.party.seatCount > 0;
  return {
    canVote: hasFraktion,
    canPropose: hasFraktion,
    canAmend: hasFraktion,
    hasFraktion,
    isOpposition: ctx.party.coalitionRole === "opposition",
    isCoalitionLeader: ctx.party.coalitionRole === "leader",
    hasActiveElection: !!ctx.activeElection,
  };
}

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const systemPrompt = buildSystemPrompt(ctx.party.id, deriveCapabilities(ctx), ctx.realPartyPositions);
  const userPrompt = buildUserPrompt(ctx);

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1024,
      partyId: ctx.party.id,
    });

    let parseOk = true;
    let validationOk = true;
    let fallback: string | undefined;

    let parsed;
    try {
      parsed = parseAgentResponse(text);
    } catch {
      parseOk = false;
      fallback = "abstain-all";
      logAICall({ task: `agent:${ctx.party.id}`, model, provider, latencyMs: Date.now() - t0, parseOk, validationOk, fallback });
      return votableBills.map(bill => ({
        type: "vote" as const,
        billId: bill.id,
        vote: "abstain" as const,
        reason: "Agent error - automatic abstain",
      }));
    }

    const validated = validateActions(
      parsed.actions,
      votableBills,
      ctx.party.id,
      ctx.activeElection,
      ctx.hasFraktion ?? ctx.party.seatCount > 0,
      secondReadingBills,
      ctx.party.coalitionRole === "opposition",
      ctx.party.coalitionRole === "leader",
    );

    if (validated.length < parsed.actions.length) {
      validationOk = false; // some actions dropped
    }

    logAICall({ task: `agent:${ctx.party.id}`, model, provider, latencyMs: Date.now() - t0, parseOk, validationOk });
    return validated;
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Agent] ${ctx.party.name}: skipped (${error.message})`);
    } else {
      console.error(`  [Agent] Error for ${ctx.party.name}:`, error);
    }

    logAICall({ task: `agent:${ctx.party.id}`, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "abstain-all" });

    // Fallback: abstain on all votable bills (third reading)
    return votableBills.map(bill => ({
      type: "vote" as const,
      billId: bill.id,
      vote: "abstain" as const,
      reason: "Agent error - automatic abstain",
    }));
  }
}

// ---------------------------------------------------------------------------
// Batch variants for batching all 6 party agent calls in one submission
// ---------------------------------------------------------------------------

/**
 * Build BatchRequest objects for all party agents.
 */
export function buildPartyAgentRequests(
  contexts: AgentContext[],
  currentDay: number,
  depthConfig?: DepthConfig,
  votingCalibrations?: Record<string, string | null>,
): BatchRequest[] {
  return contexts.map(ctx => {
    const config = getPartyModel(ctx.party.id);
    const isAnthropic = config.provider === "anthropic";
    const calibration = votingCalibrations?.[ctx.party.id] ?? undefined;
    return {
      customId: `agent-${ctx.party.id}-day${currentDay}`,
      system: buildSystemPrompt(ctx.party.id, deriveCapabilities(ctx), ctx.realPartyPositions),
      prompt: buildUserPrompt(ctx, depthConfig, calibration),
      maxTokens: 1024,
      partyId: ctx.party.id,
      // Only use structured output for Anthropic — xAI/Grok doesn't support it
      outputSchema: isAnthropic ? AGENT_RESPONSE_SCHEMA : undefined,
    };
  });
}

/**
 * Parse a single party agent batch result into validated actions.
 */
export async function processPartyAgentResult(
  result: BatchResult | undefined,
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const abstainFallback = () => votableBills.map(bill => ({
    type: "vote" as const,
    billId: bill.id,
    vote: "abstain" as const,
    reason: "Agent error - automatic abstain",
  }));

  if (!result || !result.text) {
    logAICall({ task: `agent:${ctx.party.id}`, model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "abstain-all" });
    return abstainFallback();
  }

  let parseOk = true;
  let validationOk = true;

  let parsed;
  if (result.structuredOutput) {
    // Structured output — JSON is guaranteed valid by Anthropic, skip parse pipeline
    try {
      const obj = JSON.parse(result.text);
      parsed = { actions: Array.isArray(obj.actions) ? obj.actions : [] };
    } catch {
      // Should never happen with structured output, but handle gracefully
      parseOk = false;
      logAICall({ task: `agent:${ctx.party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk, fallback: "abstain-all" });
      return abstainFallback();
    }
  } else {
    // Full parse pipeline for xAI/Grok and non-structured responses
    try {
      parsed = parseAgentResponse(result.text);
    } catch {
      // Retry once with a sequential callAI before falling back to abstain-all
      console.warn(`  [Agent] ${ctx.party.id}: PARSE_FAIL from batch, retrying sequentially...`);
      try {
        const caps = deriveCapabilities(ctx);
        const retryResult = await callAI({
          system: buildSystemPrompt(ctx.party.id, caps, ctx.realPartyPositions),
          prompt: buildUserPrompt(ctx),
          maxTokens: 1024,
          partyId: ctx.party.id,
        });
        parsed = parseAgentResponse(retryResult.text);
        console.log(`  [Agent] ${ctx.party.id}: retry succeeded`);
        logAICall({ task: `agent:${ctx.party.id}:retry`, model: retryResult.model, provider: retryResult.provider, latencyMs: 0, parseOk: true, validationOk: true });
      } catch {
        parseOk = false;
        logAICall({ task: `agent:${ctx.party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk, fallback: "abstain-all:after-retry" });
        return abstainFallback();
      }
    }
  }

  const validated = validateActions(
    parsed.actions,
    votableBills,
    ctx.party.id,
    ctx.activeElection,
    ctx.hasFraktion ?? ctx.party.seatCount > 0,
    secondReadingBills,
    ctx.party.coalitionRole === "opposition",
    ctx.party.coalitionRole === "leader",
  );

  if (validated.length < parsed.actions.length) validationOk = false;

  logAICall({ task: `agent:${ctx.party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk });
  return validated;
}
