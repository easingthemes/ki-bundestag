import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "./client.js";
import { logAICall } from "./ai-json.js";
import { buildSystemPrompt, buildUserPrompt, buildValidationRetryPrompt } from "./prompt.js";
import type { PartyCapabilities } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";
import type { EnqueteValidationContext, FiscalEmergencyValidationContext, InquiryValidationContext, ValidationResult } from "./action-parser.js";
import type { BatchRequest, BatchResult } from "./batch-client.js";
import type { Provider } from "./model-config.js";
import type { DepthConfig } from "./context-depth.js";

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

/**
 * Attempt a single semantic retry when validation found fixable errors.
 * Returns the original valid actions if no fixable errors or if the retry fails.
 */
async function attemptSemanticRetry(
  ctx: AgentContext,
  systemPrompt: string,
  originalUserPrompt: string,
  validationResult: ValidationResult,
  votableBills: Bill[],
  secondReadingBills: Bill[] | undefined,
  inquiryContext?: InquiryValidationContext,
  fiscalEmergencyContext?: FiscalEmergencyValidationContext,
  enqueteContext?: EnqueteValidationContext,
): Promise<{ actions: AgentAction[]; retried: boolean }> {
  const hasFixable = validationResult.errors.some(e => e.fixable);
  if (!hasFixable) {
    return { actions: validationResult.valid, retried: false };
  }

  console.warn(`  [Agent] ${ctx.party.id}: ${validationResult.errors.length} validation error(s) (${validationResult.errors.filter(e => e.fixable).length} fixable), attempting semantic retry...`);

  try {
    const retryPrompt = buildValidationRetryPrompt(
      originalUserPrompt,
      validationResult.errors,
      validationResult.autoAbstainBillIds,
    );

    const retryResult = await callAI({
      system: systemPrompt,
      prompt: retryPrompt,
      maxTokens: 1024,
      partyId: ctx.party.id,
    });

    const retryParsed = parseAgentResponse(retryResult.text);
    const retryValidation = validateActions(
      retryParsed.actions,
      votableBills,
      ctx.party.id,
      ctx.activeElection,
      ctx.hasFraktion ?? ctx.party.seatCount > 0,
      secondReadingBills,
      ctx.party.coalitionRole === "opposition",
      ctx.party.coalitionRole === "leader",
      inquiryContext,
      fiscalEmergencyContext,
      enqueteContext,
    );

    const retryOk = retryValidation.errors.length === 0;
    logAICall({
      task: `agent:${ctx.party.id}:semantic-retry`,
      model: retryResult.model,
      provider: retryResult.provider,
      latencyMs: 0,
      parseOk: true,
      validationOk: retryOk,
      fallback: retryOk ? undefined : "semantic-retry:still-has-errors",
    });

    if (retryValidation.errors.length < validationResult.errors.length) {
      console.log(`  [Agent] ${ctx.party.id}: semantic retry improved (${validationResult.errors.length} → ${retryValidation.errors.length} errors)`);
    } else {
      console.warn(`  [Agent] ${ctx.party.id}: semantic retry did not improve validation`);
      if (process.env.TEST_MODE && retryResult.text) {
        console.warn(`  [test-mode] ${ctx.party.id} retry raw output (first 1500 chars):\n${retryResult.text.slice(0, 1500)}`);
      }
    }

    return { actions: retryValidation.valid, retried: true };
  } catch (err) {
    console.warn(`  [Agent] ${ctx.party.id}: semantic retry failed (${(err as Error).message}), using original result`);
    logAICall({
      task: `agent:${ctx.party.id}:semantic-retry`,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "semantic-retry:failed",
    });
    return { actions: validationResult.valid, retried: false };
  }
}

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
  inquiryContext?: InquiryValidationContext,
  fiscalEmergencyContext?: FiscalEmergencyValidationContext,
  enqueteContext?: EnqueteValidationContext,
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

    const validationResult = validateActions(
      parsed.actions,
      votableBills,
      ctx.party.id,
      ctx.activeElection,
      ctx.hasFraktion ?? ctx.party.seatCount > 0,
      secondReadingBills,
      ctx.party.coalitionRole === "opposition",
      ctx.party.coalitionRole === "leader",
      inquiryContext,
      fiscalEmergencyContext,
      enqueteContext,
    );

    if (validationResult.errors.length > 0) {
      validationOk = false;
    }

    logAICall({ task: `agent:${ctx.party.id}`, model, provider, latencyMs: Date.now() - t0, parseOk, validationOk });

    // Semantic retry: re-prompt once if there are fixable errors
    const { actions: finalActions } = await attemptSemanticRetry(
      ctx, systemPrompt, userPrompt, validationResult, votableBills, secondReadingBills, inquiryContext, fiscalEmergencyContext, enqueteContext,
    );
    return finalActions;
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
  return contexts.map(ctx => {
    return {
      customId: `agent-${ctx.party.id}-day${currentDay}`,
      system: buildSystemPrompt(ctx.party.id, deriveCapabilities(ctx), ctx.realPartyPositions),
      prompt: buildUserPrompt(ctx, depthConfig),
      maxTokens: 1024,
      partyId: ctx.party.id,
      // Structured output disabled — schema with 17 optional fields in a nested
      // array causes "Grammar compilation timed out" on the Anthropic API.
      // All parties now use the parse pipeline (parseAgentResponse) which handles
      // code fences, trailing commas, etc. and works reliably for all providers.
    };
  });
}

/**
 * Parse a single party agent batch result into validated actions.
 *
 * All parties now use the full parse pipeline (parseAgentResponse) with
 * code-fence stripping, trailing comma cleanup, and sanitizers. Structured
 * output was disabled because the 17-optional-field schema caused
 * "Grammar compilation timed out" errors on the Anthropic Batch API.
 *
 * The structured output code path is retained as a safety net but is
 * currently unreachable since no party agent requests set outputSchema.
 */
export async function processPartyAgentResult(
  result: BatchResult | undefined,
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
  inquiryContext?: InquiryValidationContext,
  fiscalEmergencyContext?: FiscalEmergencyValidationContext,
  enqueteContext?: EnqueteValidationContext,
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
    // Path 1: Anthropic structured output (SPD, CDU, Grüne, FDP, Linke)
    //
    // JSON shape is guaranteed by Anthropic's schema enforcement — no need for
    // code-fence stripping or sanitizers. However, the schema only constrains
    // types (string, number, object) not semantic values (e.g. vote must be
    // "yes"|"no"|"abstain"). So parseOk is always true here, but validationOk
    // may be false when Haiku picks invalid enum values.
    //
    // This is the path that produces VALIDATION_FAIL in logs — observed on
    // days 77, 82, 83, 84 at 1.4% rate. The semantic retry below usually fixes
    // fixable errors; remaining invalid actions fall back to abstain.
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
    // Path 2: Full parse pipeline for xAI/Grok (AfD) and non-structured responses
    //
    // Grok doesn't support Anthropic's structured output format, so responses
    // may include markdown code fences, trailing commas, or leading + in numbers.
    // The parseAgentResponse() pipeline handles all of these quirks, which is why
    // AfD/Grok consistently passes while Haiku sometimes fails — Grok gets more
    // lenient parsing, and Haiku gets stricter schema-guaranteed JSON that still
    // fails at the semantic validation layer.
    try {
      parsed = parseAgentResponse(result.text);
    } catch {
      // Retry once with a sequential callAI before falling back to abstain-all.
      // Sequential retries bypass the batch API (no 50% discount) but are faster
      // for single-request recovery. Observed: retries rarely needed for xAI.
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

  const validationResult = validateActions(
    parsed.actions,
    votableBills,
    ctx.party.id,
    ctx.activeElection,
    ctx.hasFraktion ?? ctx.party.seatCount > 0,
    secondReadingBills,
    ctx.party.coalitionRole === "opposition",
    ctx.party.coalitionRole === "leader",
    inquiryContext,
    fiscalEmergencyContext,
    enqueteContext,
  );

  if (validationResult.errors.length > 0) {
    validationOk = false;
    // Test-mode-only: dump raw model output so we can see exactly which
    // action types / shapes the local model is producing. Prod is unaffected.
    if (process.env.TEST_MODE && result.text) {
      console.warn(`  [test-mode] ${ctx.party.id} raw model output (first 1500 chars):\n${result.text.slice(0, 1500)}`);
    }
  }

  logAICall({ task: `agent:${ctx.party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk });

  // Semantic retry: re-prompt once if there are fixable errors
  if (validationResult.errors.some(e => e.fixable)) {
    const systemPrompt = buildSystemPrompt(ctx.party.id, deriveCapabilities(ctx), ctx.realPartyPositions);
    const userPrompt = buildUserPrompt(ctx);
    const { actions: finalActions } = await attemptSemanticRetry(
      ctx, systemPrompt, userPrompt, validationResult, votableBills, secondReadingBills, inquiryContext, fiscalEmergencyContext, enqueteContext,
    );
    return finalActions;
  }
  return validationResult.valid;
}
