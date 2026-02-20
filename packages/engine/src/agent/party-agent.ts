import type { AgentAction, AgentContext, Bill } from "@ki-bundestag/types";
import { getClient, MODELS, MAX_TOKENS, type ModelKey } from "./client.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { parseAgentResponse, validateActions } from "./action-parser.js";

export async function runPartyAgent(
  ctx: AgentContext,
  votableBills: Bill[],
  modelKey: ModelKey = "daily",
  secondReadingBills?: Bill[],
): Promise<AgentAction[]> {
  const client = getClient();
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(ctx);

  console.log(`  [Agent] Calling Claude for ${ctx.party.name}...`);

  try {
    const response = await client.messages.create({
      model: MODELS[modelKey],
      max_tokens: MAX_TOKENS[modelKey],
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

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
    console.error(`  [Agent] Error for ${ctx.party.name}:`, error);

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
