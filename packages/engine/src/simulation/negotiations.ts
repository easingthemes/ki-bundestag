import type {
  CoalitionAgreement,
  ElectionResult,
  NegotiationRound,
  Party,
  SimulationEvent,
} from "@ki-bundestag/types";
import { callAI } from "../agent/client.js";
import { parseAgentResponse } from "../agent/action-parser.js";

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
1. Respond with ONLY valid JSON. No other text.
2. You must provide exactly one action of type "negotiation_position".
3. Be strategic: consider which partners are ideologically compatible.
4. Consider previous rounds when making concessions.
5. A coalition needs 368+ seats (majority of 735).

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

  const rounds: NegotiationRound[] = [];

  for (const party of partiesWithSeats) {
    const { system, user } = buildNegotiationPrompt(
      party, electionResults, allParties, previousRounds, roundNumber,
    );

    console.log(`  [Negotiation] Round ${roundNumber}: Calling AI for ${party.name}...`);

    try {
      const text = await callAI({
        system,
        prompt: user,
        maxTokens: 1024,
        partyId: party.id,
      });

      const parsed = parseAgentResponse(text);
      const action = parsed.actions.find(a => a.type === "negotiation_position");

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
        // Fallback
        rounds.push({
          roundNumber,
          partyId: party.id,
          position: "Open to negotiations",
          concession: "Willing to compromise on minor policy details",
          acceptablePartners: partiesWithSeats
            .filter(p => p.id !== party.id)
            .map(p => p.id),
        });
      }

      console.log(`  [Negotiation] ${party.name}: position received`);
    } catch (error) {
      console.error(`  [Negotiation] Error for ${party.name}:`, error);
      rounds.push({
        roundNumber,
        partyId: party.id,
        position: "Open to negotiations",
        concession: "Willing to compromise",
        acceptablePartners: partiesWithSeats
          .filter(p => p.id !== party.id)
          .map(p => p.id),
      });
    }
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
1. Respond with ONLY valid JSON.
2. A coalition needs 368+ seats (majority of 735).
3. Prefer coalitions where parties mutually accept each other.
4. Consider ideological compatibility and concessions made.

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

  try {
    const text = await callAI({
      system,
      prompt: user,
      maxTokens: 4096,
      roleKey: "synthesis",
    });

    let jsonStr = text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    const parsed = JSON.parse(jsonStr) as CoalitionAgreement;

    // Validate: coalition must have 368+ seats
    const coalitionSeats = parsed.parties.reduce((sum, id) => {
      const r = results.find(rr => rr.partyId === id);
      return sum + (r?.seatsWon || 0);
    }, 0);

    if (coalitionSeats >= 368 && parsed.parties.length >= 2) {
      console.log(`  [Negotiation] Synthesis produced coalition: ${parsed.parties.join(", ")} (${coalitionSeats} seats)`);
      return parsed;
    }

    console.log(`  [Negotiation] Synthesis coalition insufficient (${coalitionSeats} seats), falling back`);
    return null;
  } catch (error) {
    console.error("  [Negotiation] Synthesis error, falling back:", error);
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
