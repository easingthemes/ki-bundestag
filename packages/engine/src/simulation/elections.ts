import type {
  Election,
  ElectionResult,
  Party,
  PolicyPriorities,
  SimulationEvent,
} from "@ki-bundestag/types";
import { TIME_CONFIG } from "./timing.js";
import { snapToNextSunday } from "./calendar.js";

const TOTAL_SEATS = 735;
const MAJORITY_SEATS = 368; // > 50%
const THRESHOLD = 5; // 5% threshold

// Gaussian noise using Box-Muller transform
function gaussianNoise(stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function shouldTriggerElection(
  currentDay: number,
  nextElectionDay: number,
  lowSentimentStreak: number,
  activeElection: Election | null,
): { trigger: boolean; reason: string } {
  if (activeElection) return { trigger: false, reason: "" };
  if (currentDay >= nextElectionDay) {
    return { trigger: true, reason: "Scheduled federal election" };
  }
  if (lowSentimentStreak >= 5) {
    return { trigger: true, reason: "Snap election — prolonged public dissatisfaction" };
  }
  return { trigger: false, reason: "" };
}

export function announceElection(currentDay: number, reason: string, startDate?: Date): Election {
  let electionDay = currentDay + TIME_CONFIG.ELECTION_CAMPAIGN_DAYS;
  // German elections must be on a Sunday
  if (startDate) {
    electionDay = snapToNextSunday(electionDay, startDate);
  }
  return {
    id: crypto.randomUUID(),
    triggerReason: reason,
    announcedOnDay: currentDay,
    campaignStartDay: currentDay + TIME_CONFIG.ELECTION_CAMPAIGN_START,
    electionDay,
    status: "announced",
    results: null,
    newCoalition: null,
    newOpposition: null,
    negotiationRounds: null,
    coalitionAgreement: null,
  };
}

export function advanceElectionPhase(
  currentDay: number,
  election: Election,
): { updated: Election; events: Array<Omit<SimulationEvent, "id">> } {
  const events: Array<Omit<SimulationEvent, "id">> = [];
  const updated = { ...election };

  if (currentDay >= election.campaignStartDay && election.status === "announced") {
    updated.status = "campaign";
    events.push({
      dayNumber: currentDay,
      type: "election_campaign",
      actor: "system",
      title: "Election campaign begins",
      description: `Campaign period has started. Election day is Day ${election.electionDay}. Reason: ${election.triggerReason}`,
    });
  }

  if (currentDay >= election.electionDay && election.status === "campaign") {
    updated.status = "voting";
  }

  return { updated, events };
}

export function calculateResults(parties: Party[]): ElectionResult[] {
  // Base vote share from approval ratings + noise
  const rawShares = parties.map(p => {
    const noisy = Math.max(0.5, p.approvalRating + gaussianNoise(2));
    return { partyId: p.id, raw: noisy };
  });

  // Normalize to 100%
  const total = rawShares.reduce((s, r) => s + r.raw, 0);
  const normalized = rawShares.map(r => ({
    partyId: r.partyId,
    votesPercent: Math.round((r.raw / total) * 1000) / 10,
  }));

  // Apply 5% threshold
  const aboveThreshold = normalized.filter(r => r.votesPercent >= THRESHOLD);
  const validTotal = aboveThreshold.reduce((s, r) => s + r.votesPercent, 0);

  // Calculate seats (proportional)
  const results: ElectionResult[] = normalized.map(r => {
    const above = r.votesPercent >= THRESHOLD;
    const seatShare = above ? r.votesPercent / validTotal : 0;
    const seatsWon = above ? Math.round(seatShare * TOTAL_SEATS) : 0;
    const currentParty = parties.find(p => p.id === r.partyId)!;
    return {
      partyId: r.partyId,
      votesPercent: r.votesPercent,
      seatsWon,
      seatDelta: seatsWon - currentParty.seatCount,
    };
  });

  // Adjust rounding to ensure exactly TOTAL_SEATS
  const totalAssigned = results.reduce((s, r) => s + r.seatsWon, 0);
  if (totalAssigned !== TOTAL_SEATS) {
    const diff = TOTAL_SEATS - totalAssigned;
    // Give/take from the party with most seats
    const largest = results.filter(r => r.seatsWon > 0).sort((a, b) => b.seatsWon - a.seatsWon)[0];
    if (largest) {
      largest.seatsWon += diff;
      const currentParty = parties.find(p => p.id === largest.partyId)!;
      largest.seatDelta = largest.seatsWon - currentParty.seatCount;
    }
  }

  return results;
}

function ideologicalDistance(a: PolicyPriorities, b: PolicyPriorities): number {
  return (
    Math.abs(a.economy - b.economy) +
    Math.abs(a.social - b.social) +
    Math.abs(a.environment - b.environment) +
    Math.abs(a.immigration - b.immigration) +
    Math.abs(a.spending - b.spending)
  );
}

// Parties that all others refuse to form a coalition with (Brandmauer).
// They are only considered as a last resort when no other majority is possible.
const PARIAH_PARTIES = new Set(["afd"]);

function tryFormCoalition(
  leader: ElectionResult,
  candidates: ElectionResult[],
  parties: Party[],
): { coalition: string[]; seats: number } {
  const leaderParty = parties.find(p => p.id === leader.partyId)!;
  const coalition = [leader.partyId];
  let coalitionSeats = leader.seatsWon;

  // Sort candidates by ideological proximity to leader
  const ranked = candidates.map(r => ({
    ...r,
    distance: ideologicalDistance(
      leaderParty.policyPriorities,
      parties.find(p => p.id === r.partyId)!.policyPriorities,
    ),
  })).sort((a, b) => a.distance - b.distance);

  for (const candidate of ranked) {
    if (coalitionSeats >= MAJORITY_SEATS) break;
    coalition.push(candidate.partyId);
    coalitionSeats += candidate.seatsWon;
  }

  return { coalition, seats: coalitionSeats };
}

export function formGovernment(
  results: ElectionResult[],
  parties: Party[],
): { coalition: string[]; opposition: string[] } {
  const withSeats = results.filter(r => r.seatsWon > 0).sort((a, b) => b.seatsWon - a.seatsWon);
  if (withSeats.length === 0) {
    return { coalition: [], opposition: parties.map(p => p.id) };
  }

  // Try forming a coalition without pariah parties first
  const mainstreamParties = withSeats.filter(r => !PARIAH_PARTIES.has(r.partyId));
  const pariahParties = withSeats.filter(r => PARIAH_PARTIES.has(r.partyId));

  // Try each mainstream party as leader (largest first)
  for (const leader of mainstreamParties) {
    const candidates = mainstreamParties.filter(r => r.partyId !== leader.partyId);
    const attempt = tryFormCoalition(leader, candidates, parties);
    if (attempt.seats >= MAJORITY_SEATS) {
      return buildResult(attempt.coalition, results, parties);
    }
  }

  // No mainstream majority possible — include pariah parties as last resort
  // Still prefer mainstream leader
  for (const leader of mainstreamParties) {
    const candidates = withSeats.filter(r => r.partyId !== leader.partyId);
    const attempt = tryFormCoalition(leader, candidates, parties);
    if (attempt.seats >= MAJORITY_SEATS) {
      return buildResult(attempt.coalition, results, parties);
    }
  }

  // Extremely unlikely: pariah party leads (only if they're #1 and no one else can form majority)
  for (const leader of pariahParties) {
    const candidates = withSeats.filter(r => r.partyId !== leader.partyId);
    const attempt = tryFormCoalition(leader, candidates, parties);
    if (attempt.seats >= MAJORITY_SEATS) {
      return buildResult(attempt.coalition, results, parties);
    }
  }

  // Fallback: largest party leads minority government
  return buildResult([withSeats[0].partyId], results, parties);
}

function buildResult(
  coalition: string[],
  results: ElectionResult[],
  parties: Party[],
): { coalition: string[]; opposition: string[] } {
  const opposition = results
    .filter(r => !coalition.includes(r.partyId))
    .map(r => r.partyId);

  return { coalition, opposition };
}
