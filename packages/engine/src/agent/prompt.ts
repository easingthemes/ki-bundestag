import type { AgentContext, BillImpact } from "@ki-bundestag/types";
import { getPartyProfile } from "./party-profiles.js";
import type { DepthConfig } from "./context-depth.js";
import { getDepthConfig } from "./context-depth.js";

/** Compact impact string: "B:+0.5 U:-0.1 I:+0.02 G:+0.1 S:+1" */
function formatImpact(impact: BillImpact): string {
  const fmt = (v: number | undefined) => {
    if (v == null) return "0";
    return v >= 0 ? `+${v}` : `${v}`;
  };
  return `B:${fmt(impact.budget)} U:${fmt(impact.unemployment)} I:${fmt(impact.inflation)} G:${fmt(impact.gdpGrowth)} S:${fmt(impact.publicSentiment)}`;
}

/** Capabilities that control which rules and schema entries are included in the system prompt. */
export interface PartyCapabilities {
  canVote: boolean;
  canPropose: boolean;
  canAmend: boolean;
  hasFraktion: boolean;
  isOpposition: boolean;
  isCoalitionLeader: boolean;
  hasActiveElection: boolean;
}

const DEFAULT_CAPABILITIES: PartyCapabilities = {
  canVote: true,
  canPropose: true,
  canAmend: true,
  hasFraktion: true,
  isOpposition: false,
  isCoalitionLeader: false,
  hasActiveElection: false,
};

export function buildSystemPrompt(partyId?: string, capabilities?: PartyCapabilities, realPositions?: string): string {
  const caps = capabilities ?? DEFAULT_CAPABILITIES;
  const profile = partyId ? getPartyProfile(partyId, realPositions) : "";
  const profileSection = profile ? `${profile}\n\n` : "";

  // Build rules dynamically based on capabilities
  const rules: string[] = [
    "You must respond with ONLY valid JSON matching the schema below. No other text.",
    "You may take 1-3 actions per turn.",
  ];

  if (caps.canVote) {
    rules.push(`You MUST submit a vote action for every bill listed under "THIRD READING — MANDATORY VOTES". Missing a vote is an error.`);
  }

  if (caps.canPropose) {
    rules.push("You may propose at most 1 new bill per turn.");
    rules.push("Bill impacts must be small and realistic: budget: -1 to +1 billion, unemployment: -0.1 to +0.1%, inflation: -0.05 to +0.05%, gdpGrowth: -0.1 to +0.1%, publicSentiment: -2 to +2.");
  }

  rules.push("You may make at most 1 public statement per turn.");
  rules.push("Your decisions should reflect your party's ideology, coalition role, and political strategy.");

  if (!caps.isOpposition) {
    rules.push("Coalition partners should generally cooperate but may disagree on specific issues.");
  } else {
    rules.push("Opposition parties should scrutinize government bills but may support good policy.");
  }

  rules.push("Consider active crises when making decisions — propose crisis-related bills, adjust votes, and issue statements responding to ongoing emergencies.");

  if (caps.hasActiveElection) {
    rules.push("During election campaigns, you may issue a campaign_statement (max 1 per turn) with a campaign promise.");
  }

  if (caps.canAmend) {
    rules.push(`You may propose at most 1 amendment per turn, targeting ONLY bills in "second_reading". Amendments should be small adjustments (impact deltas within ±0.3), not rewrites.`);
  }

  if (caps.hasFraktion) {
    rules.push("You may submit at most 1 motion or resolution per turn. Motions (Antrag) request government action; resolutions (Entschließung) declare parliament's position.");

    if (caps.isOpposition) {
      rules.push("You may file at most 1 interpellation per turn. Kleine Anfrage = written question. Große Anfrage = major inquiry (triggers debate). Target a specific ministry. Unanswered questions (14 day deadline) embarrass the minister's party.");
    }

    if (!caps.hasActiveElection) {
      rules.push("You may file a constitutional challenge targeting a recently passed bill (last 14 days). 30% chance the law is struck down. Use sparingly — a dismissed challenge harms your approval rating.");
    }
  }

  if (caps.isCoalitionLeader && !caps.hasActiveElection) {
    rules.push(`You may call a Vertrauensfrage (confidence vote). If fewer than 368 seats vote yes, snap election is triggered. Max 1 per turn.`);
  }

  if (caps.isOpposition && caps.hasFraktion && !caps.hasActiveElection) {
    rules.push(`You may file a Konstruktives Misstrauensvotum. Name a replacement Chancellor. Requires 368 seats. If successful, opposition takes power immediately. Max 1 per turn.`);
  }

  // Negative capability instructions — prevent hallucinated actions
  const cannotDo: string[] = [];
  if (!caps.canVote) cannotDo.push("vote on bills");
  if (!caps.canPropose) cannotDo.push("propose bills");
  if (!caps.canAmend) cannotDo.push("propose amendments");
  if (!caps.hasFraktion) cannotDo.push("submit motions", "file interpellations", "file constitutional challenges");
  if (!caps.isOpposition || !caps.hasFraktion) cannotDo.push("file interpellations (opposition+Fraktion only)");
  if (!caps.isCoalitionLeader) cannotDo.push("call Vertrauensfrage");
  if (caps.hasActiveElection) cannotDo.push("file constitutional challenges during elections");

  if (cannotDo.length > 0) {
    rules.push(`You CANNOT: ${[...new Set(cannotDo)].join(", ")}. Do NOT include these action types in your response.`);
  }

  rules.push("Do NOT wrap your JSON response in markdown code fences (\\`\\`\\`). Respond with raw JSON only.");
  rules.push("Impact numbers must be plain numbers, not strings. Do NOT use leading + signs on positive numbers (write 0.5, not +0.5).");
  rules.push("Do NOT include trailing commas in JSON arrays or objects.");
  rules.push("ALL text content (bill titles, descriptions, statements, reasons, amendment descriptions) MUST be written in German. Do not use English for any user-visible text.");
  rules.push("Use ONLY bill IDs explicitly listed in the prompt. Do NOT invent or guess bill IDs.");

  const numberedRules = rules.map((r, i) => `${i + 1}. ${r}`).join("\n");

  // Build schema dynamically — only include action types the party can use
  const schemaEntries: string[] = [];

  if (caps.canVote) {
    schemaEntries.push(`    {"type":"vote","billId":"<bill id>","vote":"yes"|"no"|"abstain","reason":"<brief>"}`);
  }

  if (caps.canPropose) {
    schemaEntries.push(`    {"type":"propose_bill","title":"<title>","description":"<1-2 sentences>","category":"economy"|"social"|"environment"|"immigration"|"defense"|"education"|"healthcare"|"infrastructure","impact":{"budget":<num>,"unemployment":<num>,"inflation":<num>,"gdpGrowth":<num>,"publicSentiment":<num>}}`);
  }

  if (caps.canAmend) {
    schemaEntries.push(`    {"type":"propose_amendment","billId":"<second_reading bill id>","title":"<title>","description":"<1-2 sentences>","impactChange":{"budget":<num>,"unemployment":<num>,"inflation":<num>,"gdpGrowth":<num>,"publicSentiment":<num>}}`);
  }

  schemaEntries.push(`    {"type":"statement","title":"<headline>","statement":"<1-2 sentence public statement>"}`);

  if (caps.hasFraktion) {
    schemaEntries.push(`    {"type":"submit_motion","motionType":"motion"|"resolution","title":"<title>","description":"<1-2 sentences>"}`);
  }

  if (caps.hasFraktion && caps.isOpposition) {
    schemaEntries.push(`    {"type":"file_interpellation","interpellationType":"kleine"|"große","title":"<title>","question":"<1-2 sentence question>","targetMinistry":"finance"|"labour"|"environment"|"interior"|"defence"|"education"|"health"|"infrastructure"}`);
  }

  if (caps.hasActiveElection) {
    schemaEntries.push(`    {"type":"campaign_statement","title":"<headline>","promise":"<1-2 sentence promise>"}`);
  }

  if (caps.isCoalitionLeader && !caps.hasActiveElection) {
    schemaEntries.push(`    {"type":"call_vertrauensfrage","title":"<title>","description":"<1-2 sentences>"}`);
  }

  if (caps.isOpposition && caps.hasFraktion && !caps.hasActiveElection) {
    schemaEntries.push(`    {"type":"file_misstrauensvotum","title":"<title>","description":"<1-2 sentences>","proposedChancellor":"<name>","proposedChancellorPartyId":"<party id>"}`);
  }

  if (caps.hasFraktion && !caps.hasActiveElection) {
    schemaEntries.push(`    {"type":"file_constitutional_challenge","billId":"<recently passed bill id>","title":"<title>","arguments":"<1-2 sentence constitutional basis>"}`);
  }

  schemaEntries.push(`    {"type":"nothing"}`);

  const schema = `{"actions":[\n${schemaEntries.join(",\n")}\n]}`;

  // Compact example showing correct output format
  const example = `EXAMPLE (2 votes + 1 statement):
{"actions":[{"type":"vote","billId":"bill-abc","vote":"yes","reason":"Aligns with our social policy goals"},{"type":"vote","billId":"bill-xyz","vote":"no","reason":"Unacceptable fiscal impact"},{"type":"statement","title":"Party responds to crisis","statement":"We call for immediate government action to address the economic downturn."}]}`;

  return `${profileSection}You are an AI agent controlling a political party in the German Bundestag simulation. Act in character as the party leadership.

RULES:
${numberedRules}

RESPONSE SCHEMA:
${schema}

${example}

REMINDER: Your entire response must be a single JSON object matching {"actions":[...]}. No text before or after. No markdown fences.`;
}

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Default depth config (normal). Callers can override via depthConfig parameter. */
const DEFAULT_DEPTH = getDepthConfig("normal");

export function buildUserPrompt(ctx: AgentContext, depthConfig?: DepthConfig): string {
  const depth = depthConfig ?? DEFAULT_DEPTH;
  const firstReadingBills = ctx.pendingBills.filter(b => b.status === "first_reading");
  const secondReadingBills = ctx.pendingBills.filter(b => b.status === "second_reading");
  const thirdReadingBills = ctx.pendingBills.filter(b => b.status === "third_reading");
  const proposedBills = ctx.pendingBills.filter(b => b.status === "proposed");
  const committeeBills = ctx.pendingBills.filter(b => b.status === "committee");

  const canAct = ctx.hasFraktion !== false && ctx.party.seatCount > 0;

  // Three-way Fraktion messaging
  let fraktionNote = "";
  if (ctx.party.seatCount <= 0) {
    fraktionNote = `
  *** NO SEATS — you may ONLY issue statements. ***`;
  } else if (ctx.hasFraktion === false) {
    fraktionNote = `
  *** ${ctx.party.seatCount} seats but no Fraktion (below 37 seats) — statements only. ***`;
  }

  // Build reading sections
  let readingSections = "";

  if (firstReadingBills.length > 0) {
    readingSections += `\nFIRST READING (awareness only — no action needed):
${firstReadingBills.map(b => `  - "${b.title}" (${b.category}) proposed by ${b.proposedBy}`).join("\n")}\n`;
  }

  if (committeeBills.length > 0) {
    readingSections += `\nIN COMMITTEE (awareness only — under review):
${committeeBills.map(b => `  - "${b.title}" (${b.category}) — ${b.committeeName ?? "committee"}: ${b.committeeRecommendation ?? "pending"}`).join("\n")}\n`;
  }

  if (secondReadingBills.length > 0) {
    if (canAct) {
      readingSections += `\nSECOND READING (you may propose 1 amendment — do NOT vote on these bills):
${secondReadingBills.map(b => {
  const rec = b.committeeRecommendation ? ` | Committee: ${b.committeeRecommendation}` : "";
  const amendments = (b.amendments ?? []);
  const amStr = amendments.length > 0
    ? `\n    Amendments: ${amendments.map(a => `"${a.title}" by ${a.proposedBy}`).join(", ")}`
    : "";
  return `  - [${b.id}] "${b.title}" (${b.category}) proposed by ${b.proposedBy}${rec}
    Impact: ${formatImpact(b.impact)}${amStr}`;
}).join("\n")}\n`;
    } else {
      readingSections += `\nSECOND READING (awareness only — you cannot propose amendments without a Fraktion):
${secondReadingBills.map(b => `  - "${b.title}" (${b.category}) proposed by ${b.proposedBy}`).join("\n")}\n`;
    }
  }

  if (thirdReadingBills.length > 0) {
    if (canAct) {
      readingSections += `\nTHIRD READING — MANDATORY VOTES (you MUST submit a vote action for each bill ID listed below):
${thirdReadingBills.map(b => {
  const rec = b.committeeRecommendation ? ` | Committee recommends: ${b.committeeRecommendation}` : "";
  const amendments = (b.amendments ?? []).filter(a => a.accepted);
  const amStr = amendments.length > 0
    ? `\n    Accepted amendments: ${amendments.map(a => `"${a.title}" by ${a.proposedBy}`).join(", ")}`
    : "";
  const sig = ctx.memberSignals?.[b.id];
  const sigStr = sig && (sig.yes + sig.no) > 0
    ? `\n    Member signals: ${sig.yes} YES / ${sig.no} NO (${Math.round(sig.yes / (sig.yes + sig.no) * 100)}% YES)`
    : "";
  const mdbVotes = ctx.mdbVoteSummary?.[b.id];
  const mdbStr = mdbVotes && mdbVotes.total > 0
    ? `\n    MdB votes so far: ${mdbVotes.yes} yes / ${mdbVotes.no} no / ${mdbVotes.abstain} abstain (${mdbVotes.total} MdB seats voted)`
    : "";
  return `  - [${b.id}] "${b.title}" (${b.category}) proposed by ${b.proposedBy}${rec}
    Description: ${b.description}
    Impact: ${formatImpact(b.impact)}${amStr}${sigStr}${mdbStr}`;
}).join("\n")}\n`;
    } else {
      readingSections += `\nTHIRD READING (awareness only — you cannot vote without a Fraktion):
${thirdReadingBills.map(b => `  - "${b.title}" (${b.category}) proposed by ${b.proposedBy}`).join("\n")}\n`;
    }
  }

  if (!readingSections) {
    readingSections = "\nNO ACTIVE BILLS IN PARLIAMENT\n";
  }

  // Explicit valid bill ID lists to reduce hallucinated IDs
  const validBillIdLines: string[] = [];
  if (thirdReadingBills.length > 0 && canAct) {
    validBillIdLines.push(`VALID BILL IDs FOR VOTING: ${thirdReadingBills.map(b => b.id).join(", ")}`);
  }
  if (secondReadingBills.length > 0 && canAct) {
    validBillIdLines.push(`VALID BILL IDs FOR AMENDMENTS: ${secondReadingBills.map(b => b.id).join(", ")}`);
  }
  const billIdReminder = validBillIdLines.length > 0 ? "\n" + validBillIdLines.join("\n") + "\n" : "";

  // ── Priority 1: Always included (core decision-making context) ──────────

  // Consolidated party table: YOUR PARTY marked with *, coalition/opposition roles shown inline
  const partyTable = ctx.allParties.map(p => {
    const marker = p.id === ctx.party.id ? " ← YOU" : "";
    return `  ${p.name}: ${p.seatCount} seats, ${p.approvalRating}% approval, ${p.coalitionRole}${marker}`;
  }).join("\n");

  const coreLines = `CURRENT DAY: ${ctx.currentDay}

YOUR PARTY: ${ctx.party.name} (${ctx.party.coalitionRole})
  Seats: ${ctx.party.seatCount}/735 | Approval: ${ctx.party.approvalRating}%
  Ideology: ${ctx.party.ideology}
  Priorities: ${JSON.stringify(ctx.party.policyPriorities)}${ctx.hasFraktion && ctx.fraktionLeader ? `
  Fraktion Leader: ${ctx.fraktionLeader}` : ""}${fraktionNote}

NATIONAL STATE:
  Budget: ${ctx.nationalState.economy.budget}B EUR | Unemployment: ${ctx.nationalState.economy.unemployment}% | Inflation: ${ctx.nationalState.economy.inflation}%
  GDP Growth: ${ctx.nationalState.economy.gdpGrowth}% | Public Sentiment: ${ctx.nationalState.publicSentiment}/100

PARTIES:
${partyTable}
${readingSections}${billIdReminder}
${ctx.activeElection ? `ELECTION STATUS:
  Status: ${ctx.activeElection.status}
  Election Day: Day ${ctx.activeElection.electionDay}
  Reason: ${ctx.activeElection.triggerReason}
  ${ctx.activeElection.status === "campaign" ? "You may issue a campaign_statement with a promise to voters." : ""}` : "NO ACTIVE ELECTION"}

${ctx.activeCrises.length > 0 ? `ACTIVE CRISES:
${ctx.activeCrises.map(c => `  - [${c.severity.toUpperCase()}] ${c.name} (${c.category}, days ${c.startDay}-${c.endDay})
    ${c.description}
    Daily impact: ${formatImpact(c.dailyImpact)}`).join("\n")}` : "NO ACTIVE CRISES"}

${ctx.government ? `FEDERAL GOVERNMENT:
  Chancellor: ${ctx.government.chancellorName} (${ctx.government.chancellorPartyId})
  Ministers:
${ctx.government.ministers.map(m => `    - ${m.portfolio}: ${m.name} (${m.partyId})`).join("\n")}` : "NO ACTIVE GOVERNMENT"}`;

  // ── Priority 1.25: Era summaries (compressed historical narratives) ────

  let eraSummarySection = "";
  if (ctx.eraSummaries && ctx.eraSummaries.length > 0) {
    eraSummarySection = `\nHISTORICAL CONTEXT (compressed summaries of past eras):\n${ctx.eraSummaries.map(e => `  [Days ${e.startDay}-${e.endDay}]: ${e.summary}`).join("\n")}\n`;
  }

  // ── Priority 1.5: Briefing (always included if available) ──────────────

  let briefingSection = "";
  if (depth.enableBriefing && ctx.briefing) {
    briefingSection = `\nDAILY BRIEFING:\n${ctx.briefing}\n`;
  }
  if (depth.enableKnowledgeGrounding && ctx.realWorldContext) {
    briefingSection += `\n${ctx.realWorldContext}\n`;
  }

  // ── Priority 2+3: Budget-trimmed optional sections ────────────────────

  // Priority 2: high-value context (events, media, proposals, recently proposed bills, own actions)
  const p2Sections: string[] = [];

  // Own recent actions (cross-day memory) — controlled by depth
  if (depth.ownActionsLookbackDays > 0 && ctx.recentOwnActions && ctx.recentOwnActions.length > 0) {
    const items = ctx.recentOwnActions.slice(0, depth.ownActionsMaxItems);
    p2Sections.push(`YOUR RECENT ACTIONS (last ${depth.ownActionsLookbackDays} days):\n${items.map(a => `  [Day ${a.day}] ${a.type}: ${a.title}`).join("\n")}`)
  }

  const eventsSection = ctx.recentEvents.length > 0
    ? `RECENT EVENTS:\n${ctx.recentEvents.slice(-depth.recentEventsMax).map(e => `  [Day ${e.dayNumber}] ${e.title}: ${e.description}`).join("\n")}`
    : "RECENT EVENTS:\n  No recent events.";
  p2Sections.push(eventsSection);

  if (ctx.recentMedia && ctx.recentMedia.length > 0) {
    p2Sections.push(`RECENT MEDIA COVERAGE:\n${ctx.recentMedia.slice(0, depth.recentMediaMax).map(a => `  - [${a.outlet}, ${a.bias}] "${a.headline}" — ${a.summary}`).join("\n")}`);
  }

  if (proposedBills.length > 0) {
    p2Sections.push(`BILLS RECENTLY PROPOSED (entering pipeline, not yet votable):\n${proposedBills.map(b => `  - "${b.title}" by ${b.proposedBy}`).join("\n")}`);
  }

  if (ctx.topInternalProposals && ctx.topInternalProposals.length > 0) {
    p2Sections.push(`PARTY MEMBER PROPOSALS (top ideas from your base, by support):\n${ctx.topInternalProposals.map(p => `  - "${p.title}" [${p.category}] score:${p.score > 0 ? "+" : ""}${p.score} (${p.totalVotes} vote${p.totalVotes !== 1 ? "s" : ""})`).join("\n")}\nConsider whether these reflect priorities your members care about.`);
  }

  // Priority 3: supplementary (motions, interpellations, confidence votes, constitutional challenges, passed bills)
  const p3Sections: string[] = [];

  if (ctx.recentMotions && ctx.recentMotions.length > 0) {
    p3Sections.push(`RECENT MOTIONS (last 3 days):\n${ctx.recentMotions.map(m => `  - [${m.type}, ${m.status}] "${m.title}" by ${m.proposedBy} (Day ${m.dayNumber})`).join("\n")}`);
  }

  if (ctx.recentInterpellations && ctx.recentInterpellations.length > 0) {
    p3Sections.push(`RECENT INTERPELLATIONS (last 5 days):\n${ctx.recentInterpellations.map(i => `  - [${i.type === "große" ? "Große Anfrage" : "Kleine Anfrage"}, ${i.status}] "${i.title}" by ${i.filedByPartyId} → ${i.targetMinistry} (Day ${i.dayNumber})${i.status === "answered" ? " ✓" : i.status === "expired" ? " ✗ expired" : " pending"}`).join("\n")}`);
  }

  if (ctx.recentConfidenceVotes && ctx.recentConfidenceVotes.length > 0) {
    p3Sections.push(`RECENT CONFIDENCE VOTES (last 7 days):\n${ctx.recentConfidenceVotes.map(v => `  - [${v.type === "vertrauensfrage" ? "Vertrauensfrage" : "Misstrauensvotum"}, ${v.status}] "${v.title}" by ${v.initiatedByPartyId} (Day ${v.dayNumber})${v.proposedChancellor ? ` → proposed: ${v.proposedChancellor}` : ""}`).join("\n")}`);
  }

  if (ctx.recentConstitutionalChallenges && ctx.recentConstitutionalChallenges.length > 0) {
    p3Sections.push(`RECENT CONSTITUTIONAL CHALLENGES (last 7 days):\n${ctx.recentConstitutionalChallenges.map(c => `  - [${c.status === "ruled" ? c.decision ?? "pending" : "pending"}] "${c.billTitle}" challenged by ${c.filedByPartyId} (Day ${c.dayNumber})${c.reasoning ? ` — ${c.reasoning}` : ""}`).join("\n")}`);
  }

  if (ctx.passedBillsForChallenge && ctx.passedBillsForChallenge.length > 0) {
    p3Sections.push(`RECENTLY PASSED BILLS (challengeable at constitutional court, last 14 days):\n${ctx.passedBillsForChallenge.map(b => `  - [${b.id}] "${b.title}" by ${b.proposedBy} (Day ${b.statusChangedOnDay ?? b.proposedOnDay})`).join("\n")}`);
  }

  // Greedily include sections within token budget
  let tokenBudget = depth.contextTokenBudget;
  const includedSections: string[] = [];

  for (const section of p2Sections) {
    const cost = estimateTokens(section);
    if (cost <= tokenBudget) {
      includedSections.push(section);
      tokenBudget -= cost;
    }
  }

  if (depth.includeP3) {
    for (const section of p3Sections) {
      const cost = estimateTokens(section);
      if (cost <= tokenBudget) {
        includedSections.push(section);
        tokenBudget -= cost;
      }
    }
  }

  if (tokenBudget < depth.contextTokenBudget && includedSections.length < p2Sections.length + (depth.includeP3 ? p3Sections.length : 0)) {
    includedSections.push("(Some context sections trimmed for token budget.)");
  }

  const optionalContext = includedSections.length > 0 ? "\n" + includedSections.join("\n\n") : "";

  return `${coreLines}${eraSummarySection}${briefingSection}${optionalContext}

Respond with your actions as JSON.`;
}
