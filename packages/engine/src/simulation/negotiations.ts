import type {
  CoalitionAgreement,
  ElectionResult,
  NegotiationRound,
  Party,
  SimulationEvent,
} from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAgentResponse } from "../agent/action-parser.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { submitBatch, findResult, type BatchRequest, type BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";

const MAX_NEGOTIATION_ROUNDS = 3;

export function getMaxNegotiationRounds(): number {
  return MAX_NEGOTIATION_ROUNDS;
}

export function buildNegotiationPrompt(
  party: Party,
  electionResults: ElectionResult[],
  allParties: Party[],
  previousRounds: NegotiationRound[][],
  roundNumber: number,
): { system: string; user: string } {
  const partyResult = electionResults.find(r => r.partyId === party.id);
  const sortedResults = [...electionResults].sort((a, b) => b.seatsWon - a.seatsWon);

  const system = `You are the negotiation team for ${party.name} in German Bundestag coalition negotiations.
You must negotiate in character, reflecting your party's ideology and priorities.

RULES:
1. Respond with ONLY valid JSON. No other text. Do NOT wrap in markdown code fences.
2. You must provide exactly one action of type "negotiation_position".
3. Be strategic: consider which partners are ideologically compatible.
4. Consider previous rounds when making concessions.
5. A coalition needs 368+ seats (majority of 735).
6. acceptablePartners must only contain valid party IDs from the list provided.

RESPONSE SCHEMA:
{
  "actions": [
    {
      "type": "negotiation_position",
      "position": "<1-2 sentence summary of your negotiation stance>",
      "acceptablePartners": ["<party_id>", ...],
      "concession": "<1 sentence: what you'd concede to form a coalition>"
    }
  ]
}`;

  const previousContext = previousRounds.length > 0
    ? `\nPREVIOUS NEGOTIATION ROUNDS:\n${previousRounds.map((round, i) =>
        `Round ${i + 1}:\n${round.map(r => {
          const p = allParties.find(pp => pp.id === r.partyId);
          return `  ${p?.name || r.partyId}: Position: ${r.position} | Concession: ${r.concession} | Partners: ${r.acceptablePartners.join(", ")}`;
        }).join("\n")}`
      ).join("\n\n")}`
    : "";

  const user = `COALITION NEGOTIATION — Round ${roundNumber} of ${MAX_NEGOTIATION_ROUNDS}

YOUR PARTY: ${party.name}
  Ideology: ${party.ideology}
  Policy Priorities: ${JSON.stringify(party.policyPriorities)}
  Election Result: ${partyResult?.votesPercent}% (${partyResult?.seatsWon} seats)

ELECTION RESULTS:
${sortedResults.map(r => {
  const p = allParties.find(pp => pp.id === r.partyId);
  return `  ${p?.name || r.partyId}: ${r.votesPercent}% (${r.seatsWon} seats)`;
}).join("\n")}

ALL PARTIES:
${allParties.map(p => `  ${p.name} (${p.id}): ${p.ideology}, Priorities: ${JSON.stringify(p.policyPriorities)}`).join("\n")}
${previousContext}

Respond with your negotiation position as JSON.`;

  return { system, user };
}

export async function runNegotiationRound(
  electionResults: ElectionResult[],
  allParties: Party[],
  previousRounds: NegotiationRound[][],
  roundNumber: number,
  currentDay: number,
): Promise<NegotiationRound[]> {
  const partiesWithSeats = allParties.filter(p => {
    const result = electionResults.find(r => r.partyId === p.id);
    return result && result.seatsWon > 0;
  });

  // Build batch requests for all parties in this round
  const batchRequests: BatchRequest[] = partiesWithSeats.map(party => {
    const { system, user } = buildNegotiationPrompt(
      party, electionResults, allParties, previousRounds, roundNumber,
    );
    return {
      customId: `negotiation-${party.id}-round${roundNumber}`,
      system,
      prompt: user,
      maxTokens: 1024,
      partyId: party.id,
    };
  });

  console.log(`  [Batch] Submitting ${batchRequests.length} negotiation requests (round ${roundNumber})...`);
  const batchResults = await submitBatch(batchRequests);

  const rounds: NegotiationRound[] = [];

  for (const party of partiesWithSeats) {
    const result = findResult(batchResults, `negotiation-${party.id}-round${roundNumber}`);

    const openFallback = (): NegotiationRound => ({
      roundNumber,
      partyId: party.id,
      position: "Open to negotiations",
      concession: "Willing to compromise on minor policy details",
      acceptablePartners: partiesWithSeats
        .filter(p => p.id !== party.id)
        .map(p => p.id),
    });

    if (!result || !result.text) {
      logAICall({ task: `negotiation:${party.id}`, model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "open-to-all" });
      rounds.push(openFallback());
      continue;
    }

    let parseOk = true;
    let validationOk = true;
    let fallback: string | undefined;

    let parsed;
    try {
      parsed = parseAgentResponse(result.text);
    } catch {
      parseOk = false;
    }

    const action = parsed?.actions.find(a => a.type === "negotiation_position");

    if (action && action.type === "negotiation_position") {
      rounds.push({
        roundNumber,
        partyId: party.id,
        position: action.position,
        concession: action.concession,
        acceptablePartners: action.acceptablePartners.filter(
          id => allParties.some(p => p.id === id),
        ),
      });
    } else {
      validationOk = false;
      fallback = "open-to-all";
      rounds.push(openFallback());
    }

    logAICall({ task: `negotiation:${party.id}`, model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk, validationOk, fallback });
  }

  return rounds;
}

/**
 * After all negotiation rounds, synthesize results into a coalition agreement.
 * Uses the synthesis model (Sonnet) for higher-quality analysis.
 * Falls back to algorithmic coalition formation if synthesis fails.
 */
export async function synthesizeAgreement(
  allRounds: NegotiationRound[][],
  results: ElectionResult[],
  allParties: Party[],
): Promise<CoalitionAgreement | null> {
  // Find mutual acceptability: parties that accept each other
  const lastRound = allRounds[allRounds.length - 1];
  const sortedResults = [...results].sort((a, b) => b.seatsWon - a.seatsWon);

  const system = `You are a political analyst synthesizing coalition negotiation results for the German Bundestag.
Analyze the negotiation rounds and determine the most viable coalition.

RULES:
1. Respond with ONLY valid JSON. Do NOT wrap in markdown code fences.
2. A coalition needs 368+ seats (majority of 735).
3. Prefer coalitions where parties mutually accept each other.
4. Consider ideological compatibility and concessions made.
5. All party IDs in the response must match the IDs from ELECTION RESULTS.

RESPONSE SCHEMA:
{
  "parties": ["<party_id>", ...],
  "keyPolicies": ["<policy agreement 1>", ...],
  "summary": "<2-3 sentence summary of the coalition agreement>",
  "concessions": { "<party_id>": "<what they conceded>", ... }
}`;

  const user = `ELECTION RESULTS:
${sortedResults.map(r => {
  const p = allParties.find(pp => pp.id === r.partyId);
  return `  ${p?.name} (${r.partyId}): ${r.votesPercent}% — ${r.seatsWon} seats`;
}).join("\n")}

NEGOTIATION ROUNDS:
${allRounds.map((round, i) =>
  `Round ${i + 1}:\n${round.map(r => {
    const p = allParties.find(pp => pp.id === r.partyId);
    return `  ${p?.name}: Position: ${r.position} | Concession: ${r.concession} | Acceptable partners: ${r.acceptablePartners.join(", ")}`;
  }).join("\n")}`
).join("\n\n")}

Determine the coalition agreement. Respond as JSON.`;

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system,
      prompt: user,
      maxTokens: 4096,
      roleKey: "synthesis",
    });

    const parsed = parseAIJson<CoalitionAgreement>(
      text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (!Array.isArray(o.parties) || !o.parties.every((p: unknown) => typeof p === "string")) return null;
        if (typeof o.summary !== "string") return null;
        return {
          parties: o.parties as string[],
          keyPolicies: Array.isArray(o.keyPolicies) ? (o.keyPolicies as string[]) : [],
          summary: o.summary,
          concessions: (o.concessions && typeof o.concessions === "object") ? o.concessions as Record<string, string> : {},
        };
      },
      "Negotiation:Synthesis",
    );

    if (!parsed) {
      logAICall({ task: "synthesis", model, provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "algorithmic" });
      return null;
    }

    // Validate: coalition must have 368+ seats
    const coalitionSeats = parsed.parties.reduce((sum, id) => {
      const r = results.find(rr => rr.partyId === id);
      return sum + (r?.seatsWon || 0);
    }, 0);

    if (coalitionSeats >= 368 && parsed.parties.length >= 2) {
      logAICall({ task: "synthesis", model, provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: true });
      return parsed;
    }

    logAICall({ task: "synthesis", model, provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: false, fallback: "algorithmic" });
    return null;
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Negotiation] Synthesis skipped (${error.message})`);
    } else {
      console.error("  [Negotiation] Synthesis error, falling back:", error);
    }
    logAICall({ task: "synthesis", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "algorithmic" });
    return null;
  }
}

export function buildNegotiationEvents(
  rounds: NegotiationRound[],
  allParties: Party[],
  currentDay: number,
  roundNumber: number,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];

  for (const round of rounds) {
    const party = allParties.find(p => p.id === round.partyId);
    events.push({
      dayNumber: currentDay,
      type: "negotiation_round",
      actor: round.partyId,
      title: `${party?.name || round.partyId} — Negotiation Round ${roundNumber}`,
      description: round.position,
      data: {
        roundNumber,
        concession: round.concession,
        acceptablePartners: round.acceptablePartners,
      },
    });
  }

  return events;
}
