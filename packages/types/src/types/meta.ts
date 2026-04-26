export type SimulationEventType =
  | "bill_proposed"
  | "bill_debate"
  | "bill_passed"
  | "bill_rejected"
  | "vote_cast"
  | "statement"
  | "economy_update"
  | "day_start"
  | "crisis_start"
  | "crisis_end"
  | "weekly_report"
  | "monthly_report"
  | "election_announced"
  | "election_campaign"
  | "election_result"
  | "government_formed"
  | "negotiation_round"
  | "negotiation_complete"
  | "fraktion_formed"
  | "fraktion_dissolved"
  | "bill_first_reading"
  | "bill_committee"
  | "bill_second_reading"
  | "bill_third_reading"
  | "amendment_proposed"
  | "amendment_voted"
  | "motion_submitted"
  | "motion_passed"
  | "motion_rejected"
  | "government_cabinet_formed"
  | "interpellation_filed"
  | "interpellation_answered"
  | "interpellation_expired"
  | "confidence_vote_filed"
  | "confidence_vote_passed"
  | "confidence_vote_failed"
  | "government_dissolved"
  | "constitutional_challenge_filed"
  | "constitutional_court_ruled"
  | "budget_proposed"
  | "budget_passed"
  | "budget_rejected"
  | "provisional_budget_started"
  | "budget_revision_rejected"
  | "presidential_veto"
  | "bill_committee_rejected"
  | "mdb_speech"
  | "sidejob_scandal"
  | "konstituierende_sitzung"
  | "bundesrat_vote"
  | "vermittlungsausschuss_invoked"
  | "vermittlungsausschuss_resolved"
  | "kanzlerwahl_phase1"
  | "kanzlerwahl_phase2"
  | "kanzlerwahl_phase3"
  | "amtseid"
  | "regierungsbefragung"
  | "fragestunde"
  | "aktuelle_stunde"
  | "schriftliche_einzelfragen"
  | "petition_created"
  | "petition_quorum_reached"
  | "petition_debated"
  | "bill_ueberweisung_ohne_aussprache"
  // Cycle 4 PR 1 — Untersuchungsausschuss lifecycle
  | "inquiry_filed"
  | "inquiry_hearing_held"
  | "inquiry_concluded"
  // Cycle 4 PR 2 — Schuldenbremse-Aussetzung (Art. 115 GG fiscal emergency)
  | "schuldenbremse_aussetzung_proposed"
  | "schuldenbremse_aussetzung_passed"
  | "schuldenbremse_aussetzung_rejected"
  // Cycle 4 PR 3 — Nachtragshaushalt (supplementary budget) consumed via
  // pending_injections after a Schuldenbremse-Aussetzung passes (S19).
  | "nachtragshaushalt_proposed"
  | "nachtragshaushalt_passed"
  | "nachtragshaushalt_rejected"
  // Cycle 4 PR 4 — debate sub-formats (Q6). Two pure deterministic flavor
  // events (Kurzintervention, Zwischenfrage) at bill_first_reading /
  // bill_second_reading; one data-hooked (Erklärung zur Abstimmung) for
  // discipline-level ≥ 1 MdB seats voting against the party line.
  | "kurzintervention"
  | "zwischenfrage"
  | "erklaerung_zur_abstimmung"
  // Cycle 5 PR 1 — Ausschussanhörung (S15: standard tier; default classification).
  | "ausschussanhoerung_held"
  // Cycle 5 PR 2 — Enquete-Kommission lifecycle (S15: proposed/convened/concluded
  // → IMPORTANT_EVENTS, rejected → ROUTINE_EVENTS).
  | "enquete_proposed"
  | "enquete_convened"
  | "enquete_rejected"
  | "enquete_concluded"
  // Cycle 5 PR 3 — Schuldenbremse-Aussetzung auto-restore at expiry day (S22).
  // Routine tier per S15 — closes the Cycle 4 silent-restore gap.
  | "schuldenbremse_expired";

export interface SimulationEvent {
  id: string;
  dayNumber: number;
  type: SimulationEventType;
  actor: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface SimulationMeta {
  currentDay: number;
  lastRunAt: string | null;
  nextElectionDay: number;
  lowSentimentStreak: number;
  dailySummary: string | null;
}

export interface PartyHistoryEntry {
  id: number;
  partyId: string;
  dayNumber: number;
  approvalRating: number;
  seatCount: number;
}

// Cycle 5 PR 3 (S24, R10) — `PendingInjection` has been retyped as a
// discriminated union. The canonical declaration now lives in
// `./economy.ts` so it can reference `BillImpact`, `MotionType`, etc.
// without circular imports through `meta.ts`. Re-exported via the package
// barrel.
export type { PendingInjection, PendingInjectionType, NachtragsInjectionPayload } from "./economy.js";
