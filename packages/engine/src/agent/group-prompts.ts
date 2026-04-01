/**
 * Selection-style prompt builders for grouped AI calls.
 *
 * Instead of 1 AI call per user action, these builders create a single prompt
 * that processes many items at once — selecting top N, flagging exceptions,
 * or batch-answering questions.
 *
 * Each builder returns a BatchRequest ready for submitBatch().
 */

import type { BatchRequest } from "./batch-client.js";

// ---------------------------------------------------------------------------
// Types for prompt inputs
// ---------------------------------------------------------------------------

export interface ApplicationItem {
  id: string;
  userId: string;
  displayName: string;
  applicationText: string;
  policyFocus: string[] | null;
  activityScore: number;
}

export interface SpeechItem {
  id: string;
  content: string;
  author: string;
  reading: number;
}

export interface QuestionItem {
  id: string;
  question: string;
  voteScore: number;
}

export interface ProposalItem {
  id: string;
  title: string;
  description: string;
  category: string;
  voteScore: number;
  totalVotes: number;
  proposerName: string;
}

export interface PartyContext {
  id: string;
  name: string;
  ideology: string;
  /** Optional political context for richer responses (recent events, party positions). */
  politicalContext?: string;
}

// ---------------------------------------------------------------------------
// MdB Application Selection
// ---------------------------------------------------------------------------

/**
 * Build a prompt that selects the top N applicants from a pool.
 * AI returns only the selected IDs + reasoning, not a decision for every applicant.
 */
export function buildApplicationSelectPrompt(
  party: PartyContext,
  applications: ApplicationItem[],
  openSeats: number,
  currentDay: number,
): BatchRequest {
  const applicantList = applications.map((app, i) =>
    `[${i + 1}] ID: ${app.id} | Name: ${app.displayName} | Activity: ${app.activityScore.toFixed(1)}/6\n    Application: "${app.applicationText}"${app.policyFocus?.length ? `\n    Policy focus: ${app.policyFocus.join(", ")}` : ""}`,
  ).join("\n\n");

  const selectCount = Math.min(openSeats, applications.length);

  return {
    customId: `app-select-${party.id}-day${currentDay}`,
    system: `You are the party leadership of ${party.name} (ideology: ${party.ideology}). You are reviewing ${applications.length} applications for ${openSeats} open Bundestag seat${openSeats !== 1 ? "s" : ""}.

Select the top ${selectCount} most qualified applicant${selectCount !== 1 ? "s" : ""}. Evaluate based on:
1. Ideological alignment with ${party.name}'s core positions
2. Policy substance — concrete goals, not just generic statements
3. Engagement — higher activity scores indicate more engaged members

Be generous — this is a simulation. Approve applicants who show genuine interest, even if brief. Only skip applicants who are clearly off-topic or show no effort.

Respond with ONLY valid JSON:
{"selected": [{"id": "<application ID>", "reasoning": "<1 sentence in German>"}]}

Return exactly ${selectCount} selections. Use the exact "id" values from the list. Write all reasoning in German.`,
    prompt: `Applications for ${party.name} Bundestag seats:\n\n${applicantList}\n\nSelect the top ${selectCount} applicant${selectCount !== 1 ? "s" : ""}.`,
    maxTokens: Math.max(256, selectCount * 80),
    partyId: party.id,
  };
}

// ---------------------------------------------------------------------------
// Speech Flagging (exception-based)
// ---------------------------------------------------------------------------

/**
 * Build a prompt that flags only bad speeches. Good speeches default to positive.
 * Returns negative IDs and optionally notable IDs.
 */
export function buildSpeechFlagPrompt(
  bill: { title: string; description: string },
  speeches: SpeechItem[],
  currentDay: number,
): BatchRequest {
  const speechList = speeches.map((s, i) =>
    `[${i + 1}] ID: ${s.id} | Author: ${s.author}\n"""${s.content}"""`,
  ).join("\n\n");

  return {
    customId: `speech-flag-day${currentDay}-${bill.title.slice(0, 20).replace(/\s+/g, "-").toLowerCase()}`,
    system: `You are a parliamentary clerk evaluating ${speeches.length} Bundestag speech${speeches.length !== 1 ? "es" : ""} on a bill.

Most speeches from elected MdBs are substantive. Your job is to identify EXCEPTIONS:
- "negative": spam, nonsensical, lorem ipsum, copy-pasted filler, completely off-topic, or disruptive gibberish
- "notable": exceptionally well-argued speeches that add significant value to the debate

Everything not listed defaults to "positive" (substantive, on-topic).

Respond with ONLY valid JSON:
{"negative": ["<id>", ...], "notable": ["<id>", ...]}

Both arrays may be empty. Use exact "id" values from the list.`,
    prompt: `Bill: "${bill.title}"${bill.description ? `\nDescription: ${bill.description}` : ""}\n\nSpeeches:\n\n${speechList}\n\nFlag any negative or notable speeches:`,
    maxTokens: Math.max(64, Math.ceil(speeches.length * 0.2) * 20),
    roleKey: "daily",
  };
}

// ---------------------------------------------------------------------------
// Citizen Question Batch Answering
// ---------------------------------------------------------------------------

/**
 * Build a prompt that answers multiple citizen questions for a party.
 * Questions are sorted by vote score (highest priority first).
 */
export function buildQuestionBatchPrompt(
  party: PartyContext,
  questions: QuestionItem[],
  currentDay: number,
): BatchRequest {
  const questionList = questions.map((q, i) =>
    `[${i + 1}] ID: ${q.id} | Votes: ${q.voteScore >= 0 ? "+" : ""}${q.voteScore}\n    "${q.question}"`,
  ).join("\n\n");

  return {
    customId: `questions-${party.id}-day${currentDay}`,
    system: `You are the spokesperson for ${party.name}, a ${party.ideology} party in the German Bundestag. Answer ${questions.length} citizen question${questions.length !== 1 ? "s" : ""} in character, reflecting your party's values and positions.

For each question, provide a brief answer (2-3 sentences). Be direct and politically authentic. Write ALL answers in German.${party.politicalContext ? `\n\nCURRENT CONTEXT:\n${party.politicalContext}` : ""}

Respond with ONLY valid JSON:
{"answers": [{"id": "<question ID>", "answer": "<2-3 Sätze auf Deutsch>"}]}

Answer ALL questions. Use exact "id" values from the list.`,
    prompt: `Citizen questions for ${party.name}:\n\n${questionList}\n\nAnswer each question:`,
    maxTokens: Math.max(256, questions.length * 100),
    partyId: party.id,
  };
}

// ---------------------------------------------------------------------------
// Internal Proposal Ranking
// ---------------------------------------------------------------------------

/**
 * Build a prompt that ranks and selects top proposals for a party.
 * AI compares proposals against each other (relative merit).
 */
export function buildProposalRankPrompt(
  party: PartyContext,
  proposals: ProposalItem[],
  maxAccept: number,
  currentDay: number,
): BatchRequest {
  const proposalList = proposals.map((p, i) =>
    `[${i + 1}] ID: ${p.id} | Title: "${p.title}" (${p.category})\n    ${p.description}\n    Vote score: ${p.voteScore >= 0 ? "+" : ""}${p.voteScore} (${p.totalVotes} votes) | Proposed by: ${p.proposerName}`,
  ).join("\n\n");

  const selectCount = Math.min(maxAccept, proposals.length);

  return {
    customId: `proposals-${party.id}-day${currentDay}`,
    system: `You are the party leadership of ${party.name} (ideology: ${party.ideology}). Review ${proposals.length} member proposal${proposals.length !== 1 ? "s" : ""} and select the top ${selectCount} to sponsor in the Bundestag. Decline the rest.

Consider:
1. Alignment with ${party.name}'s ideology and current agenda
2. Vote score — higher-voted proposals have stronger member support
3. Policy substance and feasibility

Respond with ONLY valid JSON:
{"accepted": [{"id": "<proposal ID>", "reason": "<1 Satz auf Deutsch>"}], "declineReason": "<gemeinsame 1-Satz-Begründung auf Deutsch für alle abgelehnten Vorschläge>"}

Accept exactly ${selectCount} proposal${selectCount !== 1 ? "s" : ""} (or fewer if none qualify). Use exact "id" values. Write all reasons in German.`,
    prompt: `Member proposals for ${party.name}:\n\n${proposalList}\n\nSelect the top ${selectCount} to sponsor:`,
    maxTokens: Math.max(256, selectCount * 80 + 60),
    partyId: party.id,
  };
}

// ---------------------------------------------------------------------------
// Question Suggestion Generation
// ---------------------------------------------------------------------------

/**
 * Build a prompt that generates citizen question suggestions based on
 * recent simulation events (primary) and real-world inspiration (secondary).
 */
export function buildQuestionSuggestionPrompt(
  topics: string[],
  recentSimEvents: string[],
  realQuestions: string[],
  partyIds: string[],
): BatchRequest {
  const eventContext = recentSimEvents.length > 0
    ? `\nAKTUELLE SIMULATIONSEREIGNISSE (Hauptquelle):\n${recentSimEvents.join("\n")}`
    : "";
  const inspirationContext = realQuestions.length > 0
    ? `\nREALE BÜRGERFRAGEN (nur zur Inspiration für Stil und Themen):\n${realQuestions.join("\n")}`
    : "";

  return {
    customId: `question-suggestions-${Date.now()}`,
    system: `Du bist ein Redakteur für eine Parlamentssimulation. Generiere 5 Bürgerfragen auf Deutsch, die Bürger an Parteien im Bundestag stellen könnten.

Basierend auf der aktuellen Simulationslage, erstelle Fragen die:
- Sich auf aktuelle Ereignisse in der Simulation beziehen (Gesetze, Krisen, Medienberichte)
- Verschiedene Themen abdecken
- An verschiedene Parteien gerichtet sind
- Authentisch und bürgernah formuliert sind
- Jeweils 20-200 Zeichen lang sind

Verfügbare Themen: ${topics.join(", ")}
Verfügbare Partei-IDs: ${partyIds.join(", ")}

Antworte NUR mit validem JSON:
{"suggestions": [{"question": "<Frage auf Deutsch>", "topic": "<Thema aus der Liste>", "targetPartyId": "<Partei-ID>"}]}

Generiere genau 5 Vorschläge. Verwende NUR Themen und Partei-IDs aus den Listen oben.`,
    prompt: `Generiere 5 Bürgerfragen basierend auf folgenden Informationen:${eventContext}${inspirationContext}\n\nErstelle die Vorschläge:`,
    maxTokens: 600,
    roleKey: "daily" as const,
  };
}

// ---------------------------------------------------------------------------
// Pre-filters (reduce input before sending to AI)
// ---------------------------------------------------------------------------

/**
 * Pre-filter applications: score and take top N (10× openSeats).
 * Reduces input tokens by sending only the most promising candidates to AI.
 */
export function preFilterApplications(
  applications: ApplicationItem[],
  openSeats: number,
): ApplicationItem[] {
  const limit = Math.max(openSeats * 10, 20); // At least 20, or 10× seats
  if (applications.length <= limit) return applications;
  return [...applications]
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, limit);
}

/**
 * Pre-filter questions: take top N by vote score.
 */
export function preFilterQuestions(
  questions: QuestionItem[],
  limit = 50,
): QuestionItem[] {
  if (questions.length <= limit) return questions;
  return [...questions]
    .sort((a, b) => b.voteScore - a.voteScore)
    .slice(0, limit);
}

/**
 * Pre-filter speeches: skip very short ones (auto-neutral, no AI needed).
 * Returns { toEval, autoNeutral } where autoNeutral speeches get 0 impact.
 */
export function preFilterSpeeches(
  speeches: SpeechItem[],
  minLength = 50,
): { toEval: SpeechItem[]; autoNeutral: SpeechItem[] } {
  const toEval: SpeechItem[] = [];
  const autoNeutral: SpeechItem[] = [];
  for (const s of speeches) {
    if (s.content.length >= minLength) {
      toEval.push(s);
    } else {
      autoNeutral.push(s);
    }
  }
  return { toEval, autoNeutral };
}
