import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "./client.js";
import { logAICall } from "./ai-json.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";
import type { BatchRequest, BatchResult } from "./batch-client.js";
import type { Provider } from "./model-config.js";
import type { DepthConfig } from "./context-depth.js";

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const systemPrompt = buildSystemPrompt(ctx.party.id);
  const userPrompt = buildUserPrompt(ctx);

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 2048,
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
): BatchRequest[] {
  return contexts.map(ctx => ({
    customId: `agent-${ctx.party.id}-day${currentDay}`,
    system: buildSystemPrompt(ctx.party.id),
    prompt: buildUserPrompt(ctx, depthConfig),
    maxTokens: 2048,
    partyId: ctx.party.id,
  }));
}

/**
 * Parse a single party agent batch result into validated actions.
 */
export function processPartyAgentResult(
  result: BatchResult | undefined,
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): AgentAction[] {
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
  try {
    parsed = parseAgentResponse(result.text);
  } catch {
    parseOk = false;
    logAICall({ task: `agent:${ctx.party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk, fallback: "abstain-all" });
    return abstainFallback();
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
