/**
 * Shared semantic color system for the entire app.
 * Uses Tailwind color scale instead of hardcoded Bootstrap-era hex values.
 * All values are className strings for use with cn() or direct className.
 */

// ── Bill / general status badges ──────────────────────────────────────────────
export const STATUS_BADGE: Record<string, string> = {
  passed: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  rejected: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  debate: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  proposed: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50",
  first_reading: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
  committee: "bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-50",
  second_reading: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
  third_reading: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  struck_down: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  pending: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  answered: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  expired: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  active: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50",
  failed: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  upheld: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
};

// ── Coalition role badges ─────────────────────────────────────────────────────
export const ROLE_BADGE: Record<string, string> = {
  leader: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  junior: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  opposition: "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-100",
};

// ── Vote bar colors (className strings) ───────────────────────────────────────
export const VOTE_COLORS = {
  yes: "bg-emerald-500",
  no: "bg-red-500",
  abstain: "bg-amber-400",
} as const;

// ── Inline vote colors (hex for style={}) ─────────────────────────────────────
export const VOTE_HEX = {
  yes: "#10b981",
  no: "#ef4444",
  abstain: "#f59e0b",
} as const;

// ── Mood badge for Dashboard ──────────────────────────────────────────────────
export const MOOD_BADGE: Record<string, string> = {
  "Stabile Mehrheit": "bg-emerald-100 text-emerald-800",
  "Koalitionsreibung": "bg-orange-100 text-orange-800",
  "Politischer Druck": "bg-red-100 text-red-800",
  "Krisenreaktion": "bg-red-100 text-red-800",
  "Wahlkampf": "bg-blue-100 text-blue-800",
  "Haushaltsstreit": "bg-amber-100 text-amber-800",
  "Regierungswechsel": "bg-purple-100 text-purple-800",
};

// ── Alert / nudge banner styles ───────────────────────────────────────────────
export const ALERT_STYLES = {
  info: "rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 leading-relaxed",
  warning: "rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 leading-relaxed",
  success: "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 leading-relaxed",
  error: "rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 leading-relaxed",
} as const;

// ── Election phase badges ─────────────────────────────────────────────────────
export const PHASE_BADGE: Record<string, string> = {
  campaign: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  negotiation: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50",
  announced: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  voting: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
};

// ── Confidence vote type badges ───────────────────────────────────────────────
export const CONFIDENCE_TYPE_BADGE: Record<string, string> = {
  vertrauensfrage: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-50",
  misstrauensvotum: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
};

// ── Interpellation type badges ────────────────────────────────────────────────
export const INTERPELLATION_TYPE_BADGE: Record<string, string> = {
  große: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
  kleine: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-50",
};

// ── Motion type badges ────────────────────────────────────────────────────────
export const MOTION_TYPE_BADGE: Record<string, string> = {
  motion: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
  resolution: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
};

// ── Media bias badges ─────────────────────────────────────────────────────────
export const BIAS_BADGE: Record<string, string> = {
  left: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50",
  center: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
  right: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50",
};

// ── AI model type badges (Admin) ──────────────────────────────────────────────
export const MODEL_TYPE_BADGE: Record<string, string> = {
  "AI — Haiku": "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  "AI — Sonnet": "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50",
  Algorithmic: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
};

// ── Fraktion status badge ─────────────────────────────────────────────────────
export const FRAKTION_BADGE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  none: "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-100",
};

// ── Special bill badges ───────────────────────────────────────────────────────
export const GOVT_BILL_BADGE = "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50";
export const MEMBER_INITIATIVE_BADGE = "bg-purple-600 text-white hover:bg-purple-600";
export const PRESIDENTIAL_VETO_BADGE = "bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-50";
export const REVISED_BADGE = "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50";

// ── Semantic accent hex colors (for inline style where Tailwind doesn't work) ─
export const SEMANTIC_HEX = {
  positive: "#10b981",
  negative: "#ef4444",
  neutral: "#71717a",
  warning: "#f59e0b",
  info: "#3b82f6",
} as const;

// ── Timing preset badges ──────────────────────────────────────────────────────
export const PRESET_BADGE: Record<string, string> = {
  "ultra-fast": "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  fast: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  slow: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
};

// ── Crisis severity badge ─────────────────────────────────────────────────────
export const SEVERITY_BADGE: Record<string, string> = {
  high: "border-red-400 text-red-600",
  medium: "border-amber-400 text-amber-600",
  low: "border-cyan-400 text-cyan-600",
};

// ── MdB badge ─────────────────────────────────────────────────────────────────
export const MDB_BADGE = "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-50";

// ── Discipline level badges (0-3) ─────────────────────────────────────────────
export const DISCIPLINE_BADGE: Record<number, string> = {
  0: "bg-emerald-50 text-emerald-700 border-emerald-200",
  1: "bg-amber-50 text-amber-700 border-amber-200",
  2: "bg-orange-50 text-orange-700 border-orange-200",
  3: "bg-red-50 text-red-700 border-red-200",
};

export const DISCIPLINE_LABEL: Record<number, string> = {
  0: "Gut",
  1: "Warnung",
  2: "Eingeschränkt",
  3: "Fraktionszwang",
};

// ── Event type labels (German) ───────────────────────────────────────────────
export const EVENT_TYPE_LABEL: Record<string, string> = {
  day_start: "Tagesbeginn",
  economy_update: "Wirtschaftsupdate",
  bill_proposed: "Gesetzentwurf",
  bill_first_reading: "1. Lesung",
  bill_second_reading: "2. Lesung",
  bill_third_reading: "3. Lesung",
  bill_passed: "Gesetz angenommen",
  bill_rejected: "Gesetz abgelehnt",
  vote_cast: "Abstimmung",
  amendment_proposed: "Änderungsantrag",
  statement: "Stellungnahme",
  election_campaign: "Wahlkampf",
  election_announced: "Wahl angekündigt",
  election_result: "Wahlergebnis",
  government_formed: "Regierung gebildet",
  government_dissolved: "Regierung aufgelöst",
  government_cabinet_formed: "Kabinett",
  negotiation_complete: "Koalitionsvertrag",
  motion_submitted: "Antrag",
  motion_passed: "Antrag angenommen",
  motion_rejected: "Antrag abgelehnt",
  interpellation_filed: "Anfrage",
  interpellation_answered: "Anfrage beantwortet",
  interpellation_expired: "Anfrage abgelaufen",
  confidence_vote_filed: "Vertrauensabstimmung",
  confidence_vote_passed: "Vertrauensvotum angenommen",
  confidence_vote_failed: "Vertrauensvotum gescheitert",
  constitutional_challenge_filed: "Verfassungsbeschwerde",
  constitutional_court_ruled: "Verfassungsgericht",
  presidential_veto: "Präsidentenveto",
  crisis_start: "Krise",
  crisis_end: "Krise beendet",
  crisis_active: "Krise aktiv",
  budget_proposed: "Haushalt",
  budget_passed: "Haushalt angenommen",
  budget_rejected: "Haushalt abgelehnt",
  budget_revision_rejected: "Haushaltsnachtrag abgelehnt",
  provisional_budget_started: "Vorläufiger Haushalt",
  weekly_report: "Wochenbericht",
  monthly_report: "Monatsbericht",
  media_article: "Presseartikel",
  mdb_speech: "MdB-Rede",
  fraktion_formed: "Fraktion gebildet",
  fraktion_dissolved: "Fraktion aufgelöst",
  member_proposal_accepted: "Bürgerinitiative",
  member_proposal_declined: "Vorschlag abgelehnt",
  poll_created: "Umfrage",
  referendum_created: "Volksabstimmung",
  daily_summary: "Tageszusammenfassung",
};

// ── Notification type badges ─────────────────────────────────────────────────
export const NOTIFICATION_TYPE_BADGE: Record<string, string> = {
  morning_summary: "bg-blue-50 text-blue-700 border-blue-200",
  event_queued: "bg-amber-50 text-amber-700 border-amber-200",
  event_ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
  proposal_accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  proposal_declined: "bg-red-50 text-red-700 border-red-200",
  proposal_expired: "bg-zinc-100 text-zinc-600 border-zinc-200",
  question_answered: "bg-cyan-50 text-cyan-700 border-cyan-200",
  bill_outcome: "bg-indigo-50 text-indigo-700 border-indigo-200",
  mdb_vote_needed: "bg-orange-50 text-orange-700 border-orange-200",
  election_started: "bg-purple-50 text-purple-700 border-purple-200",
  election_result: "bg-purple-50 text-purple-700 border-purple-200",
  crisis_alert: "bg-red-50 text-red-700 border-red-200",
  budget_outcome: "bg-amber-50 text-amber-700 border-amber-200",
  government_formed: "bg-sky-50 text-sky-700 border-sky-200",
};
