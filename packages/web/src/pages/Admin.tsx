import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { api, CrisisTemplate, type TimingPreset, type SimulationStatus } from "../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MODEL_TYPE_BADGE, PRESET_BADGE } from "@/lib/colors";
import { FilterPills } from "@/components/FilterPills";

// ─── Action reference data ────────────────────────────────────────────────────

type ActionType = "AI — Haiku" | "AI — Sonnet" | "Algorithmic";

interface ActionRow {
  action: string;
  category: string;
  type: ActionType;
  triggeredBy: string;
  summary: string;
  detail: string;
}

const ACTIONS: ActionRow[] = [
  {
    action: "propose_bill",
    category: "Legislature",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily",
    summary: "Proposes new legislation (max 1/turn, Fraktion required)",
    detail: "Model receives full party ideology, coalition role, active crises, recent events, economy state, recent media headlines, government context, and the full system prompt with impact constraints (budget ±1B, unemployment ±0.1pp, sentiment ±2). Party must have a Fraktion.",
  },
  {
    action: "vote",
    category: "Legislature",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily",
    summary: "Votes on all third_reading bills (mandatory)",
    detail: "Model must vote on every bill in third_reading. Influenced by party ideology vs. bill category, coalition alignment, and bill economic/social impact. Parties without Fraktion cannot vote.",
  },
  {
    action: "propose_amendment",
    category: "Legislature",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily",
    summary: "Amends a second_reading bill (max 1/turn, Fraktion required)",
    detail: "Targets bills currently in second_reading. Impact deltas capped at ±0.3 per field. Model sees full bill context and is instructed to make incremental adjustments, not rewrites.",
  },
  {
    action: "submit_motion",
    category: "Legislature",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily",
    summary: "Files a motion (Antrag) or resolution (Entschließung) (max 1/turn)",
    detail: "Non-legislative parliamentary action. Motions request government action; resolutions declare parliament's position. Vote happens algorithmically same day. Model is told to use these for political pressure and signaling.",
  },
  {
    action: "file_interpellation",
    category: "Oversight",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily (opposition + Fraktion only)",
    summary: "Files Kleine or Große Anfrage targeting a ministry (max 1/turn)",
    detail: "Opposition parties formally question a government minister. Model chooses a target ministry and drafts a question. Große Anfrage triggers debate (+0.3 sentiment for filer). 14-day response deadline — expiry embarrasses the minister's party (−0.3).",
  },
  {
    action: "call_vertrauensfrage",
    category: "Constitutional",
    type: "AI — Haiku",
    triggeredBy: "Coalition leader agent (max 1/day globally)",
    summary: "Calls confidence vote on Chancellor (max 1/turn)",
    detail: "Available only to the coalition leader party. Model is instructed to use after a crisis, controversial bill, or to seek a fresh mandate. If fewer than 368 seats vote yes (with 10% coalition defection risk), the government falls and a snap election is triggered.",
  },
  {
    action: "file_misstrauensvotum",
    category: "Constitutional",
    type: "AI — Haiku",
    triggeredBy: "Opposition agent (max 1/day globally)",
    summary: "Constructive no-confidence vote naming replacement Chancellor",
    detail: "Opposition proposes a replacement Chancellor (must name person + party). 85% of other opposition parties automatically join. Requires 368-seat absolute majority. If passed, opposition takes power immediately with no election.",
  },
  {
    action: "file_constitutional_challenge",
    category: "Constitutional",
    type: "AI — Haiku",
    triggeredBy: "Any party with Fraktion (max 1/day globally)",
    summary: "Challenges a passed bill at the Bundesverfassungsgericht",
    detail: "Targets passed bills from the last 14 days. Model drafts constitutional arguments. Court rules same day (30% strike-down, no AI call). Upheld challenge costs the filer −0.3 approval. Model is told to use sparingly.",
  },
  {
    action: "statement",
    category: "Communication",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily (max 1/turn)",
    summary: "Issues a public political statement",
    detail: "Free-form statement visible in the news feed. Model is influenced by party ideology, active crises, recent bills, and the political situation. No mechanical game effect.",
  },
  {
    action: "campaign_statement",
    category: "Communication",
    type: "AI — Haiku",
    triggeredBy: "Party agent — daily during campaign phase",
    summary: "Makes a campaign promise during election period",
    detail: "Only available when an election is active and in the 'campaign' phase. Model crafts a promise aligned with party ideology. Logged as election_campaign event.",
  },
  {
    action: "negotiation_position",
    category: "Government",
    type: "AI — Haiku",
    triggeredBy: "Negotiation agent — 1 round/day for 3 days post-election",
    summary: "States coalition position, concessions, and acceptable partners",
    detail: "Uses the 'negotiation' model key. Context includes party seats, election results, other parties' positions from previous rounds, and party ideology. Parties must specify acceptable coalition partners and what they're willing to concede.",
  },
  {
    action: "coalition_synthesis",
    category: "Government",
    type: "AI — Sonnet",
    triggeredBy: "After 3 negotiation rounds",
    summary: "Synthesizes all negotiation rounds into a coalition agreement",
    detail: "Uses the 'synthesis' model key (Sonnet, 4096 tokens). Receives all 3 rounds of positions and concessions from all parties. Produces a coalition with key policies, per-party concessions, and a summary. Must have 368+ seats and 2+ parties — otherwise falls back to algorithmic formGovernment().",
  },
  {
    action: "answer_citizen_question",
    category: "Engagement",
    type: "AI — Haiku",
    triggeredBy: "Daily — max 3 oldest pending questions",
    summary: "Answers user-submitted questions as party leadership",
    detail: "Oldest-first queue, max 3/day. Model responds in character as the party leadership, considering ideology and policy priorities. Questions expire after 14 days if unanswered.",
  },
  {
    action: "answer_interpellation",
    category: "Oversight",
    type: "AI — Haiku",
    triggeredBy: "Daily — max 2 oldest pending interpellations",
    summary: "Responds to parliamentary questions as the targeted minister",
    detail: "Model acts in character as the specific minister (name + portfolio). Context includes the original question and the minister's party ideology. Max 2 answered/day, oldest-first. 14-day deadline — expired questions apply −0.3 sentiment to the minister's party.",
  },
  {
    action: "generate_media",
    category: "Media",
    type: "AI — Haiku",
    triggeredBy: "End of each simulation day (newsworthy events only)",
    summary: "Writes 2–3 newspaper articles from 3 biased outlets",
    detail: "Single Haiku call requesting a JSON array of 2–3 articles. Only runs when newsworthy events occurred (bill_passed, crisis_start, election_*, etc.). Outlets: Berliner Tagesspiegel (center), Volksstimme (left), Wirtschaftswoche (right). Each outlet has distinct framing instructions in the prompt. Articles influence party approval (±0.5/day max).",
  },
  {
    action: "generate_poll",
    category: "Engagement",
    type: "AI — Haiku",
    triggeredBy: "Weekly (day % 7) — 1 context poll + 1 party preference poll",
    summary: "Creates a contextual opinion poll based on current events",
    detail: "Always generates a party preference poll. Attempts an AI-generated context poll based on active crises and recent passed bill titles. Polls expire after 7 days. Top-voted party on the preference poll gets +0.3 approval on expiry.",
  },
  {
    action: "generate_referendum",
    category: "Engagement",
    type: "AI — Haiku",
    triggeredBy: "Every 30 days",
    summary: "Creates a citizen referendum question with economic impact",
    detail: "Haiku generates a referendum based on active crises and recent legislation. Includes Yes/No options and projected economic impact. Users vote; 10-vote quorum required for the result to affect the simulation. Closes after 14 days.",
  },
  {
    action: "budget_vote",
    category: "Government",
    type: "Algorithmic",
    triggeredBy: "Every 60 days (day % 60)",
    summary: "Tallies parliamentary vote on annual 300B EUR budget",
    detail: "Coalition parties vote yes with 90% probability (10% random defection). Opposition votes yes with only 10% probability. Budget allocations are coalition-weighted averages of PARTY_MINISTRY_WEIGHTS. Passed: sentiment +0.5 + economy effects. Rejected: sentiment −1.5, coalition parties −0.8 each.",
  },
  {
    action: "committee_recommendation",
    category: "Legislature",
    type: "Algorithmic",
    triggeredBy: "Auto — bill reaches committee stage",
    summary: "Committee assigns a pass/amend/reject recommendation",
    detail: "Based on coalition alignment: if proposing party is in coalition, 70% pass / 20% amend / 10% reject. If opposition party, 30% pass / 30% amend / 40% reject. Committee name is derived from bill category.",
  },
  {
    action: "amendment_vote",
    category: "Legislature",
    type: "Algorithmic",
    triggeredBy: "Auto — each amendment in second_reading",
    summary: "Algorithmically votes on proposed amendments",
    detail: "Same party as proposer: always yes. Coalition partners: 90% yes. Opposition vs. coalition proposer: 90% no. Cross-coalition (opposition amending opposition bill): 70% yes.",
  },
  {
    action: "presidential_veto",
    category: "Constitutional",
    type: "Algorithmic",
    triggeredBy: "Per passing bill",
    summary: "Bundespräsident may refuse to sign controversial bills",
    detail: "Base 3% veto probability. +5% if |publicSentiment impact| > 1.5. +5% if |budget impact| > 2B. +3% if |gdpGrowth impact| > 0.15%. Max ~16%. Veto: bill set to 'rejected' + vetoedByPresident=true, proposer −0.5 approval. Pre-canned refusal strings, no AI call.",
  },
  {
    action: "constitutional_court_ruling",
    category: "Constitutional",
    type: "Algorithmic",
    triggeredBy: "Per file_constitutional_challenge action",
    summary: "Court rules 30% chance to strike down a passed bill",
    detail: "Flat 30% strike-down probability, same-day ruling. If struck down: bill → 'struck_down', economic impacts reversed, sentiment −0.5, filer +0.8, proposer −0.5. Upheld: filer −0.3. Pre-canned German-flavored legal reasoning strings (5 for struck down, 5 for upheld), no AI call.",
  },
  {
    action: "election_results",
    category: "Elections",
    type: "Algorithmic",
    triggeredBy: "Voting phase — election day",
    summary: "Calculates seat distribution from party approval ratings",
    detail: "Approval ratings + Gaussian noise (σ ≈ 2%) → normalize → drop parties below 5% threshold → proportional seat allocation across 735 total seats. Coalition formation: largest mainstream party + ideologically closest partners until 368+ seats. AfD excluded from coalition (Brandmauer) unless no mainstream majority is possible.",
  },
  {
    action: "confidence_vote_tally",
    category: "Constitutional",
    type: "Algorithmic",
    triggeredBy: "Per call_vertrauensfrage or file_misstrauensvotum",
    summary: "Counts seats for/against the government",
    detail: "Vertrauensfrage: coalition votes yes with 90% probability (10% defection risk). Opposition votes no. Threshold: 368 seats. Failed → dissolve government + snap election. Misstrauensvotum: initiating party + 85% of other opposition join. Threshold: 368. Passed → instant power transfer, form new cabinet.",
  },
  {
    action: "motion_vote",
    category: "Legislature",
    type: "Algorithmic",
    triggeredBy: "Per submit_motion action — same day",
    summary: "Same-day algorithmic vote on motions and resolutions",
    detail: "Same party: always yes. Coalition voting on coalition motion: 80% yes. Opposition voting on opposition motion: 70% yes. Cross-coalition: 80% no. Passed motion: sentiment +0.3. Passed resolution: sentiment +0.2.",
  },
  {
    action: "crisis_trigger",
    category: "Events",
    type: "Algorithmic",
    triggeredBy: "Daily check",
    summary: "Randomly triggers crises from 8 German templates",
    detail: "8% daily probability, 25% on monthly days (day % 30). Max 2 concurrent crises. Immediate sentiment hit: high −3, medium −2, low −1. Daily economic drain during crisis. Auto-resolves when endDay is reached. Can also be user-injected.",
  },
  {
    action: "economic_drift",
    category: "Economy",
    type: "Algorithmic",
    triggeredBy: "Daily",
    summary: "Applies mean-reversion + noise to all 4 economy indicators",
    detail: "Budget: baseline 45B, 1%/day reversion, ±0.15 noise. Unemployment: baseline 5%, 2%/day, ±0.02 noise. Inflation: baseline 2%, 2%/day, ±0.015 noise. GDP Growth: baseline 0.8%, 3%/day, ±0.008 noise.",
  },
  {
    action: "sentiment_drift",
    category: "Economy",
    type: "Algorithmic",
    triggeredBy: "Daily",
    summary: "Pulls public sentiment toward baseline via mean-reversion",
    detail: "Baseline: 38. Mean-reversion: 5%/day toward baseline. Daily noise: ±0.2. Range capped at 5–75. Additional modifiers: media influence (±0.5/day max), bill impacts (±2 cap per bill), crisis hits.",
  },
  {
    action: "approval_drift",
    category: "Economy",
    type: "Algorithmic",
    triggeredBy: "Daily per party",
    summary: "Adds small random noise to each party's approval rating",
    detail: "±0.2 random noise per party per day. Range: 1–60. Weekly opinion recalc adds: +1.0 for proposers of recently passed bills; +0.5 for opposition if sentiment < 40; −0.5 for coalition if sentiment < 30.",
  },
  {
    action: "media_sentiment_impact",
    category: "Media",
    type: "Algorithmic",
    triggeredBy: "Daily — after media articles generated",
    summary: "Applies article bias influence to public sentiment",
    detail: "Each article contributes a small sentiment delta based on its bias and category. Capped at ±0.5 total per day. Applied after media generation, saved to national_state.",
  },
  {
    action: "fraktion_manage",
    category: "Legislature",
    type: "Algorithmic",
    triggeredBy: "After each election",
    summary: "Auto-creates/dissolves Fraktionen based on 5% seat threshold",
    detail: "Threshold: 37 seats (5% of 735). Parties above threshold get/keep a Fraktion (using FRAKTION_LEADERS map). Parties below have their Fraktion dissolved. Parties without Fraktion can only issue statements.",
  },
  {
    action: "referendum_resolve",
    category: "Engagement",
    type: "Algorithmic",
    triggeredBy: "Auto — on closes_on_day",
    summary: "Evaluates quorum and applies economic impact of user votes",
    detail: "10-vote quorum required for result to count. Winning option's impact fields applied to national economy. Status set to passed/rejected/expired. No-quorum = expired with no effect.",
  },
];

const TYPE_LABEL: Record<ActionType, string> = {
  "AI — Haiku":  "AI · Haiku",
  "AI — Sonnet": "AI · Sonnet",
  "Algorithmic": "Algorithmic",
};

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

// ─── Model config ─────────────────────────────────────────────────────────────

const MODEL_CONFIG = [
  {
    key: "SPD",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_SPD",
    usedFor: "SPD party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 70, auth: 40) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for SPD minister responses to interpellations.",
  },
  {
    key: "CDU",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_CDU",
    usedFor: "CDU party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 30, auth: 60) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for CDU minister responses to interpellations.",
  },
  {
    key: "Grüne",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_GRUENE",
    usedFor: "Grüne party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 65, auth: 25) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for Grüne minister responses to interpellations.",
  },
  {
    key: "FDP",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_FDP",
    usedFor: "FDP party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 35, auth: 20) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for FDP minister responses to interpellations.",
  },
  {
    key: "AfD",
    model: "xai:grok-3-mini",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_AFD",
    usedFor: "AfD party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 10, auth: 80) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Using xAI grok-3-mini ($0.30/$0.50 per 1M tokens) for cost savings. Falls back to auto-abstain on all bills if API call fails. Also used for AfD minister responses to interpellations.",
  },
  {
    key: "Linke",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_PARTY_LINKE",
    usedFor: "Linke party agent — daily actions, minister responses",
    systemPrompt: "Party ideology (left: 85, auth: 35) + 17 behavioral rules, response schema, impact constraints",
    userContext: "Party state, all parties, economy, top 20 recent events, active crises, pending bills (third/second reading), recent media (3d), recent motions (3d), recent interpellations (5d), confidence votes (7d), constitutional challenges (7d), active election, government (Chancellor + ministers), hasFraktion, fraktionLeader",
    notes: "Single call per day. Falls back to auto-abstain on all bills if API call fails. Also used for Linke minister responses to interpellations.",
  },
  {
    key: "Coalition Negotiation",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 1024,
    envVar: "MODEL_NEGOTIATION",
    usedFor: "Coalition negotiation — 3 rounds post-election (per-party calls)",
    systemPrompt: "Negotiation-specific system prompt: form a viable coalition, be strategic",
    userContext: "Party info, election results, previous round positions from all parties, ideology scores",
    notes: "1 call per party per round × 3 rounds. Normal party agents skipped during negotiation days. Uses per-party models based on PARTY_MODELS.",
  },
  {
    key: "Coalition Synthesis",
    model: "anthropic:claude-sonnet-4-5-20250929",
    maxTokens: 4096,
    envVar: "MODEL_SYNTHESIS",
    usedFor: "Coalition agreement synthesis after all 3 negotiation rounds",
    systemPrompt: "Synthesize a realistic German coalition agreement",
    userContext: "All 3 rounds of all party positions and concessions, election seat counts",
    notes: "1 call total after round 3. Must produce ≥2 parties with ≥368 seats. Falls back to algorithmic formGovernment() on failure.",
  },
  {
    key: "System (daily)",
    model: "anthropic:claude-haiku-4-5-20251001",
    maxTokens: 2048,
    envVar: "MODEL_DAILY",
    usedFor: "Citizen Q&A, media articles, polls, referendum topics, daily narrative summaries",
    systemPrompt: "Various system prompts for non-party AI calls",
    userContext: "Contextual (varies by use case: pending questions, recent events, active crises, etc.)",
    notes: "Fallback model for system-wide AI calls not tied to a specific party.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

const PRESET_OPTIONS: { value: TimingPreset; label: string; desc: string; participatory: boolean }[] = [
  { value: "ultra-fast", label: "Ultra-Fast", desc: "No delay between days", participatory: false },
  { value: "fast", label: "Fast", desc: "7 min between days", participatory: false },
  { value: "normal", label: "Normal", desc: "30 min day / 15 min night", participatory: true },
  { value: "slow", label: "Slow", desc: "1.5 h between days, night pause", participatory: true },
];

export function Admin() {
  const [crisisTemplates, setCrisisTemplates] = useState<CrisisTemplate[]>([]);
  const [injectMsg, setInjectMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedCrisis, setSelectedCrisis] = useState("");
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<TimingPreset>("normal");
  const [presetSaving, setPresetSaving] = useState(false);

  useEffect(() => {
    api.getCrisisTemplates().then(ts => {
      setCrisisTemplates(ts);
      if (ts.length > 0) setSelectedCrisis(ts[0].id);
    }).catch(console.error);
    api.getSimulationStatus().then(s => {
      setSimStatus(s);
      setSelectedPreset(s.timingPreset ?? "normal");
    }).catch(console.error);
  }, []);

  const notify = useCallback((text: string, ok: boolean) => {
    setInjectMsg({ text, ok });
    setTimeout(() => setInjectMsg(null), 4000);
  }, []);

  async function inject(type: string, data?: Record<string, unknown>) {
    try {
      await api.injectEvent(type, data);
      const labels: Record<string, string> = {
        crisis: "Crisis queued",
        election: "Snap election queued",
        economic_shock: "Economic shock queued",
        invalidate_election: "Election invalidation queued",
      };
      notify(`${labels[type] ?? "Event queued"} — takes effect on the next simulation day.`, true);
    } catch {
      notify(`Failed to inject ${type}.`, false);
    }
  }

  const toggleAction = (key: string) =>
    setExpandedActions(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleModel = (key: string) =>
    setExpandedModels(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const categories = ["all", ...Array.from(new Set(ACTIONS.map(a => a.category)))];
  const filtered = categoryFilter === "all" ? ACTIONS : ACTIONS.filter(a => a.category === categoryFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-title !mb-0">Admin</h2>
        <div className="flex items-center gap-4">
          <Link to="/admin/analytics" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Analytics &rarr;</Link>
          <Link to="/admin/costs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">AI Model Costs &rarr;</Link>
        </div>
      </div>

      {/* ── Simulation Speed ─────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Simulationsgeschwindigkeit</h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              Controls how fast simulation days progress. Ultra-Fast and Fast are watch-only (no user participation).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {PRESET_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors",
                    selectedPreset === opt.value ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="preset"
                    value={opt.value}
                    checked={selectedPreset === opt.value}
                    onChange={() => setSelectedPreset(opt.value)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{opt.label}</span>
                      <Badge variant="outline" className={PRESET_BADGE[opt.value]}>
                        {opt.participatory ? "Interactive" : "Watch-only"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                className={cn(
                  "px-4 py-1.5 text-sm font-medium rounded-md transition-colors",
                  presetSaving
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : selectedPreset === simStatus?.timingPreset
                      ? "bg-muted text-muted-foreground cursor-default"
                      : "bg-foreground text-background hover:bg-foreground/90",
                )}
                disabled={presetSaving || selectedPreset === simStatus?.timingPreset}
                onClick={async () => {
                  setPresetSaving(true);
                  try {
                    await api.setPreset(selectedPreset);
                    notify("Preset updated to " + selectedPreset, true);
                    setSimStatus(s => s ? { ...s, timingPreset: selectedPreset } : s);
                  } catch { notify("Failed to update preset", false); }
                  setPresetSaving(false);
                }}
              >
                {presetSaving ? "Saving..." : "Apply"}
              </button>
              {simStatus?.timingPreset && selectedPreset !== simStatus.timingPreset && (
                <span className="text-xs text-muted-foreground">
                  Current: {PRESET_OPTIONS.find(o => o.value === simStatus.timingPreset)?.label ?? simStatus.timingPreset}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Inject Events ──────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Ereignisse einspeisen</h2>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              Manually trigger simulation events. All injections take effect at the start of the next simulation day.
            </p>

            {injectMsg && (
              <div className={cn(
                "text-sm mb-4 px-3 py-2 rounded",
                injectMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              )}>
                {injectMsg.text}
              </div>
            )}

            <div className="flex flex-col gap-4">
              {/* Crisis */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>Trigger Crisis</strong>
                    <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Injects a crisis from the 8 German templates. Daily economic drain + sentiment hit for its duration.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selectedCrisis}
                    onChange={e => setSelectedCrisis(e.target.value)}
                    className={SELECT_CLS}
                  >
                    {crisisTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.severity})</option>
                    ))}
                  </select>
                  <button
                    className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                    onClick={() => { if (selectedCrisis) inject("crisis", { templateId: selectedCrisis }); }}
                  >
                    Inject
                  </button>
                </div>
              </div>

              {/* Snap Election */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>Call Snap Election</strong>
                    <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Schedules an election announcement on the next sim day. Overrides nextElectionDay.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                    onClick={() => inject("election")}
                  >
                    Inject
                  </button>
                </div>
              </div>

              {/* Economic Shock */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>Economic Shock</strong>
                    <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applies a fixed shock: budget −5B, unemployment +0.5pp, inflation +0.3pp, GDP −0.5pp, sentiment −5.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="px-3.5 py-1.5 rounded border border-amber-500 bg-amber-500 text-white text-sm cursor-pointer hover:bg-amber-600"
                    onClick={() => inject("economic_shock", {
                      impact: { budget: -5, unemployment: 0.5, inflation: 0.3, gdpGrowth: -0.5, publicSentiment: -5 },
                    })}
                  >
                    Inject
                  </button>
                </div>
              </div>

              {/* Trigger Budget Cycle */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>Trigger Budget Cycle</strong>
                    <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Forces a budget vote on the next sim day, regardless of the 60-day cycle.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                    onClick={() => inject("budget")}
                  >
                    Inject
                  </button>
                </div>
              </div>

              {/* Invalidate Election */}
              <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <strong>Invalidate Election</strong>
                    <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cancels an active election in progress (announced/campaign phase). Resets to next scheduled term (4 years out).
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="px-3.5 py-1.5 rounded border border-destructive bg-destructive text-white text-sm cursor-pointer hover:bg-destructive/90"
                    onClick={() => inject("invalidate_election")}
                  >
                    Inject
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── AI Model Configuration ─────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">KI-Modell-Konfiguration</h2>
        <Card>
          <CardContent className="p-0 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Key</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Model</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Tokens</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Env Override</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Used For</th>
                  <th className="w-8 bg-muted/50 border-b-2 border-border"></th>
                </tr>
              </thead>
              <tbody>
                {MODEL_CONFIG.map(m => (
                  <Fragment key={m.key}>
                    <tr className={expandedModels.has(m.key) ? "bg-muted/50" : ""}>
                      <td className="px-3 py-2 border-b border-border align-middle"><code>{m.key}</code></td>
                      <td className="px-3 py-2 border-b border-border align-middle text-xs font-mono">{m.model}</td>
                      <td className="px-3 py-2 border-b border-border align-middle text-right">{m.maxTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 border-b border-border align-middle"><code className="text-xs">{m.envVar}</code></td>
                      <td className="px-3 py-2 border-b border-border align-middle text-sm text-muted-foreground">{m.usedFor}</td>
                      <td className="px-3 py-2 border-b border-border align-middle">
                        <button
                          className="bg-transparent border-none cursor-pointer text-xs text-muted-foreground px-1 py-0.5 rounded hover:bg-accent hover:text-foreground"
                          onClick={() => toggleModel(m.key)}
                          title={expandedModels.has(m.key) ? "Collapse" : "Expand"}
                        >
                          {expandedModels.has(m.key) ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>
                    {expandedModels.has(m.key) && (
                      <tr>
                        <td colSpan={6} className="bg-muted/30 p-0">
                          <div className="px-4 py-3 border-l-[3px] border-l-primary/30">
                            <div className="flex gap-3 mb-1.5 text-sm leading-relaxed">
                              <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">System prompt</span>
                              <span>{m.systemPrompt}</span>
                            </div>
                            <div className="flex gap-3 mb-1.5 text-sm leading-relaxed">
                              <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">User context</span>
                              <span>{m.userContext}</span>
                            </div>
                            <div className="flex gap-3 text-sm leading-relaxed">
                              <span className="shrink-0 w-28 font-semibold text-muted-foreground text-xs uppercase pt-px">Notes</span>
                              <span>{m.notes}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Simulation Actions Reference ───────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Simulationsaktionen</h2>

        {/* Category filter */}
        <FilterPills
          className="mb-4"
          options={categories.map(c => ({
            value: c,
            label: c === "all" ? `All (${ACTIONS.length})` : `${c} (${ACTIONS.filter(a => a.category === c).length})`,
          }))}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />

        <Card>
          <CardContent className="p-0 overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Action</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Category</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Type</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Triggered By</th>
                  <th className="text-left px-3 py-2.5 bg-muted/50 border-b-2 border-border text-xs uppercase text-muted-foreground font-semibold">Description</th>
                  <th className="w-8 bg-muted/50 border-b-2 border-border"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const key = a.action;
                  const isOpen = expandedActions.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className={isOpen ? "bg-muted/50" : ""}>
                        <td className="px-3 py-2 border-b border-border align-middle"><code className="text-xs">{a.action}</code></td>
                        <td className="px-3 py-2 border-b border-border align-middle text-xs text-muted-foreground">{a.category}</td>
                        <td className="px-3 py-2 border-b border-border align-middle">
                          <Badge className={`${MODEL_TYPE_BADGE[a.type]} whitespace-nowrap`}>{TYPE_LABEL[a.type]}</Badge>
                        </td>
                        <td className="px-3 py-2 border-b border-border align-middle text-xs text-muted-foreground">{a.triggeredBy}</td>
                        <td className="px-3 py-2 border-b border-border align-middle text-sm">{a.summary}</td>
                        <td className="px-3 py-2 border-b border-border align-middle">
                          <button
                            className="bg-transparent border-none cursor-pointer text-xs text-muted-foreground px-1 py-0.5 rounded hover:bg-accent hover:text-foreground"
                            onClick={() => toggleAction(key)}
                            title={isOpen ? "Collapse" : "Show detail"}
                          >
                            {isOpen ? "▲" : "▼"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} className="bg-muted/30 p-0">
                            <div className="px-4 py-3 border-l-[3px] border-l-primary/30">
                              <p className="m-0 text-sm leading-relaxed">{a.detail}</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
