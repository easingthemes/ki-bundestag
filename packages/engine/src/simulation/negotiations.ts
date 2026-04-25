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
import { MAJORITY_SEATS, BUNDESTAG_SIZE } from "../config/elections.js";

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

  const system = `Du bist das Verhandlungsteam der ${party.name} in den Koalitionsverhandlungen des Deutschen Bundestags.
Du verhandelst im Charakter deiner Partei, entsprechend ihrer Ideologie und Prioritäten.

REGELN:
1. Antworte NUR mit validem JSON. Kein anderer Text. KEINE Markdown-Code-Blöcke.
2. Genau eine Aktion vom Typ "negotiation_position".
3. Sei strategisch: berücksichtige ideologische Kompatibilität.
4. Berücksichtige vorherige Runden bei Zugeständnissen.
5. Eine Koalition braucht ${MAJORITY_SEATS}+ Sitze (Mehrheit von ${BUNDESTAG_SIZE}).
6. acceptablePartners darf nur gültige Partei-IDs aus der Liste enthalten.
7. Antworte auf Deutsch.

RESPONSE SCHEMA:
{
  "actions": [
    {
      "type": "negotiation_position",
      "position": "<1-2 Sätze zu deiner Verhandlungsposition>",
      "acceptablePartners": ["<party_id>", ...],
      "concession": "<1 Satz: was du für eine Koalition zugestehen würdest>"
    }
  ]
}`;

  const previousContext = previousRounds.length > 0
    ? `\nBISHERIGE VERHANDLUNGSRUNDEN:\n${previousRounds.map((round, i) =>
        `Runde ${i + 1}:\n${round.map(r => {
          const p = allParties.find(pp => pp.id === r.partyId);
          return `  ${p?.name || r.partyId}: Position: ${r.position} | Zugeständnis: ${r.concession} | Partner: ${r.acceptablePartners.join(", ")}`;
        }).join("\n")}`
      ).join("\n\n")}`
    : "";

  const user = `KOALITIONSVERHANDLUNG — Runde ${roundNumber} von ${MAX_NEGOTIATION_ROUNDS}

DEINE PARTEI: ${party.name}
  Ideologie: ${party.ideology}
  Politische Prioritäten: ${JSON.stringify(party.policyPriorities)}
  Wahlergebnis: ${partyResult?.votesPercent}% (${partyResult?.seatsWon} Sitze)

WAHLERGEBNISSE:
${sortedResults.map(r => {
  const p = allParties.find(pp => pp.id === r.partyId);
  return `  ${p?.name || r.partyId}: ${r.votesPercent}% (${r.seatsWon} Sitze)`;
}).join("\n")}

ALLE PARTEIEN:
${allParties.map(p => `  ${p.name} (${p.id}): ${p.ideology}, Prioritäten: ${JSON.stringify(p.policyPriorities)}`).join("\n")}
${previousContext}

Antworte mit deiner Verhandlungsposition als JSON.`;

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

  const system = `Du bist ein politischer Analyst, der die Ergebnisse der Koalitionsverhandlungen im Deutschen Bundestag zusammenfasst.
Analysiere die Verhandlungsrunden und bestimme die tragfähigste Koalition.

REGELN:
1. Antworte NUR mit validem JSON. KEINE Markdown-Code-Blöcke.
2. Eine Koalition braucht ${MAJORITY_SEATS}+ Sitze (Mehrheit von ${BUNDESTAG_SIZE}).
3. Bevorzuge Koalitionen, in denen sich die Parteien gegenseitig akzeptieren.
4. Berücksichtige ideologische Kompatibilität und gemachte Zugeständnisse.
5. Alle Partei-IDs in der Antwort müssen den IDs aus den WAHLERGEBNISSEN entsprechen.
6. Antworte auf Deutsch.

RESPONSE SCHEMA:
{
  "parties": ["<party_id>", ...],
  "keyPolicies": ["<Politikvereinbarung 1>", ...],
  "summary": "<2-3 Sätze Zusammenfassung des Koalitionsvertrags>",
  "concessions": { "<party_id>": "<Zugeständnis der Partei>", ... },
  "chancellorCandidate": { "partyId": "<partei-id der führenden Partei>", "name": "<Vollständiger Name des Kanzler-Kandidaten>" }
}`;

  const user = `WAHLERGEBNISSE:
${sortedResults.map(r => {
  const p = allParties.find(pp => pp.id === r.partyId);
  return `  ${p?.name} (${r.partyId}): ${r.votesPercent}% — ${r.seatsWon} Sitze`;
}).join("\n")}

VERHANDLUNGSRUNDEN:
${allRounds.map((round, i) =>
  `Runde ${i + 1}:\n${round.map(r => {
    const p = allParties.find(pp => pp.id === r.partyId);
    return `  ${p?.name}: Position: ${r.position} | Zugeständnis: ${r.concession} | Akzeptable Partner: ${r.acceptablePartners.join(", ")}`;
  }).join("\n")}`
).join("\n\n")}

Bestimme den Koalitionsvertrag. Antworte als JSON.`;

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

        // Validate chancellorCandidate if present — drop malformed values so
        // the loop-side fallback (FRAKTION_LEADERS[parties[0]]) takes over.
        let chancellorCandidate: CoalitionAgreement["chancellorCandidate"];
        if (o.chancellorCandidate && typeof o.chancellorCandidate === "object") {
          const c = o.chancellorCandidate as Record<string, unknown>;
          if (typeof c.partyId === "string" && typeof c.name === "string" && (o.parties as string[]).includes(c.partyId)) {
            chancellorCandidate = { partyId: c.partyId, name: c.name };
          }
        }

        return {
          parties: o.parties as string[],
          keyPolicies: Array.isArray(o.keyPolicies) ? (o.keyPolicies as string[]) : [],
          summary: o.summary,
          concessions: (o.concessions && typeof o.concessions === "object") ? o.concessions as Record<string, string> : {},
          chancellorCandidate,
        };
      },
      "Negotiation:Synthesis",
    );

    if (!parsed) {
      logAICall({ task: "synthesis", model, provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "algorithmic" });
      return null;
    }

    // Validate: coalition must have absolute-majority seats
    const coalitionSeats = parsed.parties.reduce((sum, id) => {
      const r = results.find(rr => rr.partyId === id);
      return sum + (r?.seatsWon || 0);
    }, 0);

    if (coalitionSeats >= MAJORITY_SEATS && parsed.parties.length >= 2) {
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
      title: `${party?.name || round.partyId} — Verhandlungsrunde ${roundNumber}`,
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
