/**
 * Cycle 4 PR 4 — debate sub-formats.
 *
 * Three deterministic helpers for parliamentary debate flavor:
 *   - rollKurzintervention — 30% chance per bill-reading; opposition party
 *     interjects during a coalition speech.
 *   - rollZwischenfrage — independent 30% chance; questioner is any non-
 *     proposing Fraktion party.
 *   - detectDisciplineBreaks — emits one Erklärung zur Abstimmung event per
 *     MdB seat where `disciplineLevel >= 1` AND the seat voted against the
 *     party line.
 *
 * No AI calls (S22) — templated descriptions only. Decoration cost rejected
 * per brainstorm Q6 reasoning. Tier-classified routine in `simulation/timing.ts`.
 *
 * Pure: caller passes parties / mdbVotes / partyLine map. Tests use seeded
 * RNGs and stub data; no DB needed.
 */

import type { Bill, Party, SimulationEvent, VoteChoice } from "@ki-bundestag/types";
import { KURZINTERVENTION_PROBABILITY, ZWISCHENFRAGE_PROBABILITY } from "../config/parliament.js";
import { FRAKTION_THRESHOLD } from "./fraktionen.js";

export type ReadingStage = "first" | "second";

function readingLabel(reading: ReadingStage): string {
  return reading === "first" ? "1. Lesung" : "2. Lesung";
}

function pickFromList<T>(list: T[], rng: () => number): T | null {
  if (list.length === 0) return null;
  const idx = Math.min(list.length - 1, Math.floor(rng() * list.length));
  return list[idx];
}

/**
 * S6: rolls a Kurzintervention event for a given bill-reading. Returns null
 * on miss OR when no Fraktion-bearing opposition party is available.
 *
 * Speaker = bill-proposing party (drawn from `bill.proposedBy`).
 * Interjector = uniformly picked Fraktion-bearing party that is NOT the
 *   proposing party (the spec note "random opposition party" in S6 is
 *   relaxed — coalition partners can also interject during a coalition
 *   bill's reading, matching real Bundestag practice).
 */
export function rollKurzintervention(
  bill: Bill,
  parties: Party[],
  reading: ReadingStage,
  currentDay: number,
  rng: () => number = Math.random,
): Omit<SimulationEvent, "id"> | null {
  if (rng() >= KURZINTERVENTION_PROBABILITY) return null;
  const speakerParty = parties.find(p => p.id === bill.proposedBy);
  if (!speakerParty) return null;
  const eligibleInterjectors = parties.filter(p =>
    p.id !== bill.proposedBy && p.seatCount >= FRAKTION_THRESHOLD,
  );
  const interjector = pickFromList(eligibleInterjectors, rng);
  if (!interjector) return null;
  return {
    dayNumber: currentDay,
    type: "kurzintervention",
    actor: interjector.id,
    title: `Kurzintervention: ${interjector.name} vs. ${speakerParty.name}`,
    description: `Während der ${readingLabel(reading)} zu "${bill.title}" unterbricht ${interjector.name} die Rede der ${speakerParty.name}.`,
    data: {
      billId: bill.id,
      reading,
      speakerPartyId: speakerParty.id,
      interjectorPartyId: interjector.id,
    },
  };
}

/**
 * S6: rolls a Zwischenfrage event. Independent of the Kurzintervention roll
 * (separate rng draw). Same eligibility — Fraktion-bearing non-proposing
 * party. Returns null on miss or no eligible questioner.
 */
export function rollZwischenfrage(
  bill: Bill,
  parties: Party[],
  reading: ReadingStage,
  currentDay: number,
  rng: () => number = Math.random,
): Omit<SimulationEvent, "id"> | null {
  if (rng() >= ZWISCHENFRAGE_PROBABILITY) return null;
  const speakerParty = parties.find(p => p.id === bill.proposedBy);
  if (!speakerParty) return null;
  const eligibleQuestioners = parties.filter(p =>
    p.id !== bill.proposedBy && p.seatCount >= FRAKTION_THRESHOLD,
  );
  const questioner = pickFromList(eligibleQuestioners, rng);
  if (!questioner) return null;
  return {
    dayNumber: currentDay,
    type: "zwischenfrage",
    actor: questioner.id,
    title: `Zwischenfrage: ${questioner.name} an ${speakerParty.name}`,
    description: `In der ${readingLabel(reading)} zu "${bill.title}" stellt ${questioner.name} eine Zwischenfrage an die ${speakerParty.name}.`,
    data: {
      billId: bill.id,
      reading,
      speakerPartyId: speakerParty.id,
      questionerPartyId: questioner.id,
    },
  };
}

/** Input shape for `detectDisciplineBreaks`. Caller (loop.ts) joins
 *  `mdb_votes` with `bundestag_seats` to get the discipline level. */
export interface DisciplineBreakInput {
  seatId: string;
  partyId: string;
  vote: VoteChoice;
  disciplineLevel: number;
  /** Optional friendly label. If absent, helper falls back to "MdB-Sitz #<seatId>"
   *  (R18 — graceful for AI-only seats). */
  mdbName?: string | null;
}

/**
 * S5/S22: post-3rd-reading detection of MdB seats that broke party discipline.
 *
 * Fires for each input where:
 *   - disciplineLevel >= 1 (Fraktionswarn or stricter), AND
 *   - vote ≠ partyLineByPartyId[partyId]
 *
 * Templated description (no AI per S22). Returns events ready to push.
 *
 * Test 7: emits one event per discipline-break vote.
 * Test 8: emits zero events when no MdB has disciplineLevel >= 1.
 * Test 9: emits zero events when all MdBs vote with party line.
 * Test 10: templated description includes name + bill + direction + level.
 */
export function detectDisciplineBreaks(
  bill: Bill,
  mdbVotes: DisciplineBreakInput[],
  partyLineByPartyId: Record<string, VoteChoice>,
  currentDay: number,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];
  for (const v of mdbVotes) {
    if ((v.disciplineLevel ?? 0) < 1) continue;
    const partyLine = partyLineByPartyId[v.partyId];
    if (!partyLine || v.vote === partyLine) continue;
    const direction =
      v.vote === "yes" ? "für"
      : v.vote === "no" ? "gegen"
      : "Enthaltung bei";
    const mdbName = v.mdbName ?? `MdB-Sitz #${v.seatId}`;
    events.push({
      dayNumber: currentDay,
      type: "erklaerung_zur_abstimmung",
      actor: v.partyId,
      title: `Erklärung zur Abstimmung: ${mdbName}`,
      description: `${mdbName} (${v.partyId}, MdB) erklärt Abstimmungsverhalten: ${direction} die Fraktion gestimmt zu "${bill.title}" (Disziplin-Stufe ${v.disciplineLevel}).`,
      data: {
        billId: bill.id,
        seatId: v.seatId,
        partyId: v.partyId,
        brokeFromParty: partyLine,
        votedFor: v.vote,
        disciplineLevel: v.disciplineLevel,
      },
    });
  }
  return events;
}
