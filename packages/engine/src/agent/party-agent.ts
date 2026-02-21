import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "./client.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(ctx);

  console.log(`  [Agent] Calling AI for ${ctx.party.name}...`);

  try {
    const text = await callAI({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 2048,
      partyId: ctx.party.id,
    });

    console.log(`  [Agent] ${ctx.party.name} responded (${text.length} chars)`);

    const parsed = parseAgentResponse(text);
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

    console.log(`  [Agent] ${ctx.party.name}: ${validated.length} valid actions`);
    return validated;
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Agent] ${ctx.party.name}: skipped (${error.message})`);
    } else {
      console.error(`  [Agent] Error for ${ctx.party.name}:`, error);
    }

    // Fallback: abstain on all votable bills (third reading)
    const fallbackActions: AgentAction[] = votableBills.map(bill => ({
      type: "vote" as const,
      billId: bill.id,
      vote: "abstain" as const,
      reason: "Agent error - automatic abstain",
    }));

    return fallbackActions;
  }
}
