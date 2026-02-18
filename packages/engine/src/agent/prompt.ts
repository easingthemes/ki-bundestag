import type { AgentContext } from "@ki-bundestag/types";

export function buildSystemPrompt(): string {
  return `You are an AI agent controlling a political party in the German Bundestag simulation. You must act in character as the party leadership, making decisions that align with your party's ideology and priorities.

RULES:
1. You must respond with ONLY valid JSON matching the schema below. No other text.
2. You may take 1-3 actions per turn.
3. You MUST submit a vote action for every bill listed under "THIRD READING — MANDATORY VOTES". Missing a vote is an error.
4. You may propose at most 1 new bill per turn.
5. You may make at most 1 public statement per turn.
6. Bill impacts must be small and realistic: budget: -1 to +1 billion, unemployment: -0.1 to +0.1%, inflation: -0.05 to +0.05%, gdpGrowth: -0.1 to +0.1%, publicSentiment: -2 to +2. Germany's economy changes slowly — no single bill transforms the entire economy.
7. Your decisions should reflect your party's ideology, coalition role, and political strategy.
8. Coalition partners should generally cooperate but may disagree on specific issues.
9. Opposition parties should scrutinize government bills but may support good policy.
10. Consider active crises when making decisions — propose crisis-related bills, adjust votes, and issue statements responding to ongoing emergencies.
11. During election campaigns, you may issue a campaign_statement (max 1 per turn) with a campaign promise. Only use this action type when an election is active and in campaign phase.
12. You may propose at most 1 amendment per turn, targeting ONLY bills in "second_reading". Amendments should be small adjustments (impact deltas within ±0.3), not rewrites. Include the billId of the target bill.
13. You may submit at most 1 motion or resolution per turn (requires Fraktion). Motions (Antrag) request government action; resolutions (Entschließung) declare parliament's position. They don't create law — use them for political pressure, forcing debates, or signaling priorities. Opposition parties should use these strategically.
14. You may file at most 1 interpellation per turn (requires Fraktion + opposition role). Interpellations (Anfragen) formally question a government minister. Kleine Anfrage = written question (quiet). Große Anfrage = major inquiry (triggers debate, higher impact). Target a specific ministry. The government must respond within 14 days — unanswered questions embarrass the minister's party.
15. If you are the coalition leader (coalitionRole "leader"), you may call a Vertrauensfrage (confidence vote) with "call_vertrauensfrage". Parliament votes on whether to maintain your Chancellor's mandate. If the coalition does not hold together (fewer than 368 seats vote yes), the government falls and a snap election is triggered. Use strategically — after a crisis, a controversial bill, or when you want a fresh mandate. Max 1 per turn. Not available during elections.
16. If you are in opposition (coalitionRole "opposition"), you may file a Konstruktives Misstrauensvotum with "file_misstrauensvotum". You must name a replacement Chancellor and their party. Requires 368 absolute-majority seats to pass. If successful, the opposition takes power immediately without an election. Max 1 per turn. Not available during elections.
17. You may file a constitutional challenge with "file_constitutional_challenge" (requires Fraktion, not available during elections). Target a recently passed bill (last 14 days). The Bundesverfassungsgericht rules same-day: 30% chance the law is struck down and its economic effects reversed. Max 1 per turn. Use sparingly — only for laws that genuinely violate constitutional principles. A dismissed challenge harms your approval rating.

RESPONSE SCHEMA:
{
  "actions": [
    {
      "type": "vote",
      "billId": "<bill id>",
      "vote": "yes" | "no" | "abstain",
      "reason": "<brief explanation>"
    },
    {
      "type": "propose_bill",
      "title": "<bill title in German or English>",
      "description": "<1-2 sentence description>",
      "category": "economy" | "social" | "environment" | "immigration" | "defense" | "education" | "healthcare" | "infrastructure",
      "impact": {
        "budget": <number, change in billions EUR>,
        "unemployment": <number, change in percentage points>,
        "inflation": <number, change in percentage points>,
        "gdpGrowth": <number, change in percentage points>,
        "publicSentiment": <number, change in sentiment points>
      }
    },
    {
      "type": "propose_amendment",
      "billId": "<second_reading bill id>",
      "title": "<amendment title>",
      "description": "<1-2 sentence description of the change>",
      "impactChange": {
        "budget": <number, delta change>,
        "unemployment": <number, delta change>,
        "inflation": <number, delta change>,
        "gdpGrowth": <number, delta change>,
        "publicSentiment": <number, delta change>
      }
    },
    {
      "type": "statement",
      "title": "<headline>",
      "statement": "<1-2 sentence public statement>"
    },
    {
      "type": "submit_motion",
      "motionType": "motion" | "resolution",
      "title": "<motion title in German or English>",
      "description": "<1-2 sentence description>"
    },
    {
      "type": "file_interpellation",
      "interpellationType": "kleine" | "große",
      "title": "<interpellation title>",
      "question": "<1-2 sentence formal question to the minister>",
      "targetMinistry": "finance" | "labour" | "environment" | "interior" | "defence" | "education" | "health" | "infrastructure"
    },
    {
      "type": "campaign_statement",
      "title": "<campaign headline>",
      "promise": "<1-2 sentence campaign promise>"
    },
    {
      "type": "call_vertrauensfrage",
      "title": "<short title for the confidence vote>",
      "description": "<1-2 sentence explanation of why you are calling this vote>"
    },
    {
      "type": "file_misstrauensvotum",
      "title": "<short title for the motion>",
      "description": "<1-2 sentence argument for replacing the government>",
      "proposedChancellor": "<full name of the proposed replacement Chancellor>",
      "proposedChancellorPartyId": "<party id of the proposed Chancellor>"
    },
    {
      "type": "file_constitutional_challenge",
      "billId": "<id of a recently passed bill>",
      "title": "<short title for the challenge>",
      "arguments": "<1-2 sentence constitutional basis for the challenge>"
    },
    {
      "type": "nothing"
    }
  ]
}`;
}

export function buildUserPrompt(ctx: AgentContext): string {
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

IMPORTANT: Your party currently has NO seats in parliament. You CANNOT propose bills, vote, or propose amendments. You may ONLY issue public statements (and campaign statements during elections). Focus on public commentary, criticism, and building support.`;
  } else if (ctx.hasFraktion === false) {
    fraktionNote = `

IMPORTANT: Your party has ${ctx.party.seatCount} seats but no Fraktion (below 5% threshold of 37 seats). You cannot propose bills, vote, or propose amendments. You may only issue statements.`;
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
      readingSections += `\nSECOND READING (you may propose 1 amendment):
${secondReadingBills.map(b => {
  const rec = b.committeeRecommendation ? ` | Committee: ${b.committeeRecommendation}` : "";
  const amendments = (b.amendments ?? []);
  const amStr = amendments.length > 0
    ? `\n    Amendments: ${amendments.map(a => `"${a.title}" by ${a.proposedBy}`).join(", ")}`
    : "";
  return `  - [${b.id}] "${b.title}" (${b.category}) proposed by ${b.proposedBy}${rec}
    Impact: ${JSON.stringify(b.impact)}${amStr}`;
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
  return `  - [${b.id}] "${b.title}" (${b.category}) proposed by ${b.proposedBy}${rec}
    Description: ${b.description}
    Impact: ${JSON.stringify(b.impact)}${amStr}`;
}).join("\n")}\n`;
    } else {
      readingSections += `\nTHIRD READING (awareness only — you cannot vote without a Fraktion):
${thirdReadingBills.map(b => `  - "${b.title}" (${b.category}) proposed by ${b.proposedBy}`).join("\n")}\n`;
    }
  }

  if (!readingSections) {
    readingSections = "\nNO ACTIVE BILLS IN PARLIAMENT\n";
  }

  return `CURRENT DAY: ${ctx.currentDay}

YOUR PARTY: ${ctx.party.name}
  Role: ${ctx.party.coalitionRole}
  Seats: ${ctx.party.seatCount}/735
  Approval Rating: ${ctx.party.approvalRating}%
  Ideology: ${ctx.party.ideology}
  Policy Priorities: ${JSON.stringify(ctx.party.policyPriorities)}${ctx.hasFraktion && ctx.fraktionLeader ? `
  Fraktion Leader: ${ctx.fraktionLeader}` : ""}${fraktionNote}

COALITION: ${ctx.allParties.filter(p => p.coalitionRole !== "opposition").map(p => p.name).join(", ")}
OPPOSITION: ${ctx.allParties.filter(p => p.coalitionRole === "opposition").map(p => p.name).join(", ")}

NATIONAL STATE:
  Budget: ${ctx.nationalState.economy.budget}B EUR
  Unemployment: ${ctx.nationalState.economy.unemployment}%
  Inflation: ${ctx.nationalState.economy.inflation}%
  GDP Growth: ${ctx.nationalState.economy.gdpGrowth}%
  Public Sentiment: ${ctx.nationalState.publicSentiment}/100
${readingSections}
${proposedBills.length > 0 ? `BILLS RECENTLY PROPOSED (entering pipeline, not yet votable):
${proposedBills.map(b => `  - "${b.title}" by ${b.proposedBy}`).join("\n")}` : ""}

RECENT EVENTS:
${ctx.recentEvents.length > 0 ? ctx.recentEvents.slice(-10).map(e => `  [Day ${e.dayNumber}] ${e.title}: ${e.description}`).join("\n") : "  No recent events."}

${ctx.activeElection ? `ELECTION STATUS:
  Status: ${ctx.activeElection.status}
  Election Day: Day ${ctx.activeElection.electionDay}
  Reason: ${ctx.activeElection.triggerReason}
  ${ctx.activeElection.status === "campaign" ? "You may issue a campaign_statement with a promise to voters." : ""}` : "NO ACTIVE ELECTION"}

${ctx.activeCrises.length > 0 ? `ACTIVE CRISES:
${ctx.activeCrises.map(c => `  - [${c.severity.toUpperCase()}] ${c.name} (${c.category}, days ${c.startDay}-${c.endDay})
    ${c.description}
    Daily impact: ${JSON.stringify(c.dailyImpact)}`).join("\n")}` : "NO ACTIVE CRISES"}

${ctx.recentMedia && ctx.recentMedia.length > 0 ? `RECENT MEDIA COVERAGE:
${ctx.recentMedia.map(a => `  - [${a.outlet}, ${a.bias}] "${a.headline}" — ${a.summary}`).join("\n")}` : ""}

${ctx.recentMotions && ctx.recentMotions.length > 0 ? `RECENT MOTIONS (last 3 days):
${ctx.recentMotions.map(m => `  - [${m.type}, ${m.status}] "${m.title}" by ${m.proposedBy} (Day ${m.dayNumber})`).join("\n")}` : ""}

${ctx.recentInterpellations && ctx.recentInterpellations.length > 0 ? `RECENT INTERPELLATIONS (last 5 days):
${ctx.recentInterpellations.map(i => `  - [${i.type === "große" ? "Große Anfrage" : "Kleine Anfrage"}, ${i.status}] "${i.title}" by ${i.filedByPartyId} → ${i.targetMinistry} (Day ${i.dayNumber})${i.status === "answered" ? " ✓" : i.status === "expired" ? " ✗ expired" : " pending"}`).join("\n")}` : ""}

${ctx.recentConfidenceVotes && ctx.recentConfidenceVotes.length > 0 ? `RECENT CONFIDENCE VOTES (last 7 days):
${ctx.recentConfidenceVotes.map(v => `  - [${v.type === "vertrauensfrage" ? "Vertrauensfrage" : "Misstrauensvotum"}, ${v.status}] "${v.title}" by ${v.initiatedByPartyId} (Day ${v.dayNumber})${v.proposedChancellor ? ` → proposed: ${v.proposedChancellor}` : ""}`).join("\n")}` : ""}

${ctx.recentConstitutionalChallenges && ctx.recentConstitutionalChallenges.length > 0 ? `RECENT CONSTITUTIONAL CHALLENGES (last 7 days):
${ctx.recentConstitutionalChallenges.map(c => `  - [${c.status === "ruled" ? c.decision ?? "pending" : "pending"}] "${c.billTitle}" challenged by ${c.filedByPartyId} (Day ${c.dayNumber})${c.reasoning ? ` — ${c.reasoning}` : ""}`).join("\n")}` : ""}

${ctx.passedBillsForChallenge && ctx.passedBillsForChallenge.length > 0 ? `RECENTLY PASSED BILLS (challengeable at constitutional court, last 14 days):
${ctx.passedBillsForChallenge.map(b => `  - [${b.id}] "${b.title}" by ${b.proposedBy} (Day ${b.statusChangedOnDay ?? b.proposedOnDay})`).join("\n")}` : ""}

${ctx.government ? `FEDERAL GOVERNMENT:
  Chancellor: ${ctx.government.chancellorName} (${ctx.government.chancellorPartyId})
  Ministers:
${ctx.government.ministers.map(m => `    - ${m.portfolio}: ${m.name} (${m.partyId})`).join("\n")}` : "NO ACTIVE GOVERNMENT"}

ALL PARTIES:
${ctx.allParties.map(p => `  ${p.name}: ${p.seatCount} seats, ${p.approvalRating}% approval, ${p.coalitionRole}`).join("\n")}

Respond with your actions as JSON.`;
}
