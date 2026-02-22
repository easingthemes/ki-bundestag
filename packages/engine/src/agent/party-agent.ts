import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "./client.js";
import { logAICall } from "./ai-json.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const systemPrompt = buildSystemPrompt();
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
