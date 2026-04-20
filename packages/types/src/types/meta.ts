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
  | "vermittlungsausschuss_resolved";

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

export interface PendingInjection {
  id: string;
  type: "crisis" | "election" | "economic_shock" | "invalidate_election" | "budget";
  data: Record<string, unknown>;
  consumed: boolean;
}
