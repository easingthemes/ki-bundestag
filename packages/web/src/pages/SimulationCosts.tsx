import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Cost data ───────────────────────────────────────────────────────────────

interface ModelRow {
  model: string;
  provider: string;
  priceIn: string;
  priceOut: string;
  usedFor: string;
}

const MODELS: ModelRow[] = [
  { model: "claude-haiku-4-5-20251001", provider: "Anthropic", priceIn: "$0.80", priceOut: "$4.00", usedFor: "Party agents, media, polls, referendums, summaries, Q&A, interpellations, proposals, negotiations" },
  { model: "claude-sonnet-4-5-20250929", provider: "Anthropic", priceIn: "$3.00", priceOut: "$15.00", usedFor: "Coalition agreement synthesis (rare)" },
  { model: "grok-3-mini", provider: "xAI", priceIn: "$0.30", priceOut: "$0.50", usedFor: "AfD party agent + AfD-specific calls" },
];

interface SimCallRow {
  action: string;
  model: string;
  maxTokens: number;
  estInput: string;
  callsPerDay: string;
  note: string;
}

const SIM_CALLS: SimCallRow[] = [
  { action: "Daily Briefing (shared)", model: "Haiku", maxTokens: 512, estInput: "~2000", callsPerDay: "1", note: "Always (Pre-A), day 3+" },
  { action: "Party Agents (6x, batched)", model: "Haiku/Grok", maxTokens: 2048, estInput: "~4000 each", callsPerDay: "1 batch", note: "Always (Group A)" },
  { action: "Media + Summary (batched)", model: "Haiku", maxTokens: 2048, estInput: "~2800", callsPerDay: "1 batch", note: "Always (Group C)" },
  { action: "Interpellation Answers (batched)", model: "Haiku/Grok", maxTokens: 300, estInput: "~400 each", callsPerDay: "0-1 batch", note: "Group B" },
  { action: "Discipline Reasoning (batched)", model: "Haiku/Grok", maxTokens: 512, estInput: "~300 each", callsPerDay: "0-1 batch", note: "Every 7d (Group B)" },
  { action: "Context Poll + Referendum (batched)", model: "Haiku", maxTokens: 512, estInput: "~600", callsPerDay: "0-1 batch", note: "Weekly/Monthly" },
];

const VISITOR_CALLS: SimCallRow[] = [
  { action: "Citizen Q&A (batch per party)", model: "Haiku/Grok", maxTokens: 2048, estInput: "varies", callsPerDay: "0-6", note: "Up to 50 Q/party, grouped" },
  { action: "MdB Application Select (batch per party)", model: "Haiku/Grok", maxTokens: 1024, estInput: "varies", callsPerDay: "0-6", note: "Select top N, grouped" },
  { action: "Speech Evaluation (batch per bill)", model: "Haiku", maxTokens: 512, estInput: "varies", callsPerDay: "0-10", note: "Flag exceptions only" },
  { action: "Proposal Ranking (batch per party)", model: "Haiku/Grok", maxTokens: 1024, estInput: "varies", callsPerDay: "0-6", note: "Rank & select top 2" },
  { action: "Interpellation Answer", model: "Haiku/Grok", maxTokens: 300, estInput: "~400", callsPerDay: "0-2", note: "Agent files" },
];

const ELECTION_CALLS: SimCallRow[] = [
  { action: "Negotiation Round (6 parties, batched)", model: "Haiku/Grok", maxTokens: 1024, estInput: "~1200 each", callsPerDay: "1 batch/round", note: "3 batches total" },
  { action: "Coalition Synthesis", model: "Sonnet", maxTokens: 4096, estInput: "~2000", callsPerDay: "1", note: "1 total" },
];

interface CostRow {
  label: string;
  count: number | string;
  inputTok: string;
  outputTok: string;
  cost: string;
  highlight?: boolean;
}

const QUIET_DAY: CostRow[] = [
  { label: "Daily Briefing (Haiku)", count: 1, inputTok: "2,000", outputTok: "512", cost: "$0.002" },
  { label: "5x Party Agent (Haiku)", count: 5, inputTok: "20,000", outputTok: "5,000", cost: "$0.035" },
  { label: "1x Party Agent (AfD/Grok)", count: 1, inputTok: "4,000", outputTok: "1,000", cost: "$0.002" },
  { label: "Daily Summary", count: 1, inputTok: "800", outputTok: "200", cost: "$0.001" },
  { label: "Media Articles", count: 1, inputTok: "2,500", outputTok: "1,500", cost: "$0.005" },
  { label: "Total", count: 9, inputTok: "29,300", outputTok: "8,212", cost: "~$0.055", highlight: true },
];

const ACTIVE_DAY_1K: CostRow[] = [
  { label: "Base (sim-driven)", count: 9, inputTok: "29,300", outputTok: "8,212", cost: "$0.055" },
  { label: "Q&A batch (6 parties)", count: 6, inputTok: "5,400", outputTok: "2,400", cost: "$0.014" },
  { label: "MdB app select (6 parties)", count: 6, inputTok: "2,000", outputTok: "500", cost: "$0.004" },
  { label: "Speech flag (5 bills)", count: 5, inputTok: "3,250", outputTok: "200", cost: "$0.004" },
  { label: "Proposal rank (6 parties)", count: 6, inputTok: "1,500", outputTok: "300", cost: "$0.002" },
  { label: "Total", count: 32, inputTok: "41,450", outputTok: "11,612", cost: "~$0.079", highlight: true },
];

const ACTIVE_DAY_100K: CostRow[] = [
  { label: "Base (sim-driven)", count: 9, inputTok: "29,300", outputTok: "8,212", cost: "$0.055" },
  { label: "Q&A batch (6 parties × 50 Qs)", count: 6, inputTok: "54,000", outputTok: "24,000", cost: "$0.140" },
  { label: "MdB app select (6 parties)", count: 6, inputTok: "30,000", outputTok: "1,000", cost: "$0.028" },
  { label: "Speech flag (~10 bills)", count: 10, inputTok: "65,000", outputTok: "500", cost: "$0.054" },
  { label: "Proposal rank (6 parties)", count: 6, inputTok: "13,200", outputTok: "600", cost: "$0.013" },
  { label: "Total", count: 37, inputTok: "191,500", outputTok: "34,312", cost: "~$0.29", highlight: true },
];

const ACTIVE_DAY_1M: CostRow[] = [
  { label: "Base (sim-driven)", count: 9, inputTok: "29,300", outputTok: "8,212", cost: "$0.055" },
  { label: "Q&A batch (12 chunks)", count: 12, inputTok: "108,000", outputTok: "48,000", cost: "$0.278" },
  { label: "MdB app select (12 chunks)", count: 12, inputTok: "120,000", outputTok: "2,000", cost: "$0.104" },
  { label: "Speech flag (~20 bills)", count: 20, inputTok: "390,000", outputTok: "2,000", cost: "$0.320" },
  { label: "Proposal rank (6 parties)", count: 6, inputTok: "66,000", outputTok: "1,500", cost: "$0.059" },
  { label: "Total", count: "~59", inputTok: "713,300", outputTok: "61,712", cost: "~$0.82", highlight: true },
];

const ELECTION_COSTS: CostRow[] = [
  { label: "Negotiation Rounds (3x6)", count: 18, inputTok: "21,600", outputTok: "10,800", cost: "$0.060" },
  { label: "Coalition Synthesis (Sonnet)", count: 1, inputTok: "2,000", outputTok: "3,000", cost: "$0.051" },
  { label: "Election Total", count: 19, inputTok: "23,600", outputTok: "13,800", cost: "~$0.111", highlight: true },
];

interface AggRow {
  scenario: string;
  callsDay: string;
  costDay: string;
  callsMonth: string;
  costMonth: string;
  costWP: string;
}

const AGG_SIM: AggRow[] = [
  { scenario: "Quiet (no visitors, no election)", callsDay: "9", costDay: "$0.055", callsMonth: "270", costMonth: "$1.65", costWP: "$6.72" },
  { scenario: "Active — 1K users (batch)", callsDay: "~32", costDay: "$0.079", callsMonth: "960", costMonth: "$2.37", costWP: "$9.60" },
  { scenario: "Active — 100K users (batch)", callsDay: "~37", costDay: "$0.29", callsMonth: "1,110", costMonth: "$8.70", costWP: "$35" },
  { scenario: "Active — 1M users (batch)", callsDay: "~59", costDay: "$0.82", callsMonth: "1,770", costMonth: "$24.60", costWP: "$100" },
  { scenario: "Election cycle (3 neg. days)", callsDay: "~10", costDay: "$0.059", callsMonth: "289", costMonth: "$1.77", costWP: "$7.18" },
];

interface RealTimeRow {
  scenario: string;
  simDays: string;
  wallClock: string;
  costDay: string;
  costMonth: string;
}

const AGG_REAL: RealTimeRow[] = [
  { scenario: "Ultra-fast / Fast (pure sim)", simDays: "~1,400", wallClock: "~60s/day", costDay: "$77", costMonth: "$2,310" },
  { scenario: "Normal — 1K users", simDays: "48/day", wallClock: "~30 min + 2 min batch", costDay: "$3.79", costMonth: "$114" },
  { scenario: "Normal — 100K users", simDays: "48/day", wallClock: "~30 min + 5 min batch", costDay: "$13.92", costMonth: "$418" },
  { scenario: "Normal — 1M users", simDays: "48/day", wallClock: "~30 min + 15 min batch", costDay: "$39.36", costMonth: "$1,181" },
  { scenario: "Slow — 1K users", simDays: "~10/day", wallClock: "~90 min + 2 min batch", costDay: "$0.79", costMonth: "$24" },
  { scenario: "Slow — 100K users", simDays: "~10/day", wallClock: "~90 min + 5 min batch", costDay: "$2.90", costMonth: "$87" },
  { scenario: "Slow — 1M users", simDays: "~10/day", wallClock: "~90 min + 15 min batch", costDay: "$8.20", costMonth: "$246" },
];

interface AltRow {
  model: string;
  priceLabel: string;
  perSimDay: string;
  perWP: string;
  perRealDay: string;
  delta: string;
  deltaColor: string;
}

const ALTERNATIVES: AltRow[] = [
  { model: "All Haiku (current default)", priceLabel: "$0.80 / $4.00", perSimDay: "$0.055", perWP: "$6.72", perRealDay: "$77", delta: "baseline", deltaColor: "text-muted-foreground" },
  { model: "All Grok-3-mini", priceLabel: "$0.30 / $0.50", perSimDay: "$0.010", perWP: "$1.22", perRealDay: "$14", delta: "-79%", deltaColor: "text-emerald-600" },
  { model: "All Sonnet", priceLabel: "$3.00 / $15.00", perSimDay: "$0.177", perWP: "$21.42", perRealDay: "$248", delta: "+276%", deltaColor: "text-red-600" },
  { model: "GPT-4o-mini (OpenAI)", priceLabel: "$0.15 / $0.60", perSimDay: "$0.008", perWP: "$0.97", perRealDay: "$11", delta: "-83%", deltaColor: "text-emerald-600" },
  { model: "Gemini 2.0 Flash (Google)", priceLabel: "$0.10 / $0.40", perSimDay: "$0.005", perWP: "$0.61", perRealDay: "$7", delta: "-89%", deltaColor: "text-emerald-600" },
];

// ─── Shared table helpers ────────────────────────────────────────────────────

const TH = "text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2";
const TD = "px-3 py-2 text-sm";
const TROW = "border-b border-border last:border-b-0";

function ProviderBadge({ provider }: { provider: string }) {
  const cls =
    provider === "Anthropic" ? "bg-violet-50 text-violet-700 border-violet-200" :
    provider === "xAI" ? "bg-sky-50 text-sky-700 border-sky-200" :
    provider === "OpenAI" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    provider === "Google" ? "bg-amber-50 text-amber-700 border-amber-200" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cls}>{provider}</Badge>;
}

function ModelBadge({ model }: { model: string }) {
  const cls =
    model.includes("Haiku") || model === "Haiku" ? "bg-blue-50 text-blue-700 border-blue-200" :
    model.includes("Sonnet") || model === "Sonnet" ? "bg-purple-50 text-purple-700 border-purple-200" :
    model.includes("Grok") || model.includes("grok") ? "bg-sky-50 text-sky-700 border-sky-200" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={cls}>{model}</Badge>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SimulationCosts() {
  return (
    <div>
      <h2 className="section-title">KI-Modell-Kosten</h2>

      {/* ── Time Scale Reference ─────────────────────────────────── */}
      <div className="mb-8 rounded-lg border border-border bg-muted/30 px-5 py-4">
        <p className="text-sm font-semibold mb-2">Time Scale (1 sim day = 1 real calendar day)</p>
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted-foreground">
          <span><strong className="text-foreground">~15 days</strong> = polls</span>
          <span><strong className="text-foreground">~30 days</strong> = monthly econ reports</span>
          <span><strong className="text-foreground">~1 year</strong> = budget cycle</span>
          <span><strong className="text-foreground">~4 years</strong> = 1 Wahlperiode</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Speed varies by preset: Ultra-Fast (~24h/term, no users), Fast (~1 week/term, no users), Normal (~1 month/term, 30% human seats), Slow (~5 months/term, 70% human seats). User-driven AI calls use batch API with 50% cost discount.</p>
      </div>

      {/* ── Current Models ────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Aktuelle Modelle</h2>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Model</th>
                  <th className={TH}>Provider</th>
                  <th className={cn(TH, "text-right")}>Input</th>
                  <th className={cn(TH, "text-right")}>Output</th>
                  <th className={TH}>Used For</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map(m => (
                  <tr key={m.model} className={TROW}>
                    <td className={cn(TD, "font-mono text-xs")}>{m.model}</td>
                    <td className={TD}><ProviderBadge provider={m.provider} /></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{m.priceIn}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{m.priceOut}</td>
                    <td className={cn(TD, "text-muted-foreground text-xs max-w-[300px]")}>{m.usedFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">Prices per 1M tokens.</p>
          </CardContent>
        </Card>
      </div>

      {/* ── AI Calls Per Simulation Day ───────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">KI-Aufrufe pro Simulationstag</h2>

        {/* Simulation-driven */}
        <h3 className="mt-4">Simulation-Driven (Always Happen — All Batched)</h3>
        <Card className="mb-4">
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Action</th>
                  <th className={TH}>Model</th>
                  <th className={cn(TH, "text-right")}>Max Out</th>
                  <th className={cn(TH, "text-right")}>Est. Input</th>
                  <th className={cn(TH, "text-right")}>Calls/Day</th>
                  <th className={TH}>Frequency</th>
                </tr>
              </thead>
              <tbody>
                {SIM_CALLS.map(c => (
                  <tr key={c.action} className={TROW}>
                    <td className={TD}>{c.action}</td>
                    <td className={TD}><ModelBadge model={c.model} /></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.maxTokens.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.estInput}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.callsPerDay}</td>
                    <td className={cn(TD, "text-xs text-muted-foreground")}>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Visitor-driven (batch) */}
        <h3>User-Driven (Batch API — Normal &amp; Slow Modes Only)</h3>
        <Card className="mb-4">
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Action</th>
                  <th className={TH}>Model</th>
                  <th className={cn(TH, "text-right")}>Max Out</th>
                  <th className={cn(TH, "text-right")}>Est. Input</th>
                  <th className={cn(TH, "text-right")}>Calls/Day</th>
                  <th className={TH}>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {VISITOR_CALLS.map(c => (
                  <tr key={c.action} className={TROW}>
                    <td className={TD}>{c.action}</td>
                    <td className={TD}><ModelBadge model={c.model} /></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.maxTokens.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.estInput}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.callsPerDay}</td>
                    <td className={cn(TD, "text-xs text-muted-foreground")}>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Election-only */}
        <h3>Election-Only (~Every 4 Years)</h3>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Action</th>
                  <th className={TH}>Model</th>
                  <th className={cn(TH, "text-right")}>Max Out</th>
                  <th className={cn(TH, "text-right")}>Est. Input</th>
                  <th className={cn(TH, "text-right")}>Calls/Round</th>
                  <th className={TH}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ELECTION_CALLS.map(c => (
                  <tr key={c.action} className={TROW}>
                    <td className={TD}>{c.action}</td>
                    <td className={TD}><ModelBadge model={c.model} /></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.maxTokens.toLocaleString()}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.estInput}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{c.callsPerDay}</td>
                    <td className={cn(TD, "text-xs text-muted-foreground")}>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Cost Estimates ────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Kostenschätzungen</h2>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Quiet day */}
          <div>
            <h3>Quiet Day (No Election, No Visitors)</h3>
            <Card>
              <CardContent className="p-5 overflow-x-auto">
                <CostTable rows={QUIET_DAY} />
              </CardContent>
            </Card>
          </div>

          {/* Active day — 1K */}
          <div>
            <h3>Active Day — 1K Users <Badge variant="outline" className="ml-1 text-xs bg-blue-50 text-blue-700 border-blue-200">~100 DAU</Badge></h3>
            <Card>
              <CardContent className="p-5 overflow-x-auto">
                <CostTable rows={ACTIVE_DAY_1K} />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          {/* Active day — 100K */}
          <div>
            <h3>Active Day — 100K Users <Badge variant="outline" className="ml-1 text-xs bg-amber-50 text-amber-700 border-amber-200">~5K DAU</Badge></h3>
            <Card>
              <CardContent className="p-5 overflow-x-auto">
                <CostTable rows={ACTIVE_DAY_100K} />
              </CardContent>
            </Card>
          </div>

          {/* Active day — 1M */}
          <div>
            <h3>Active Day — 1M Users <Badge variant="outline" className="ml-1 text-xs bg-red-50 text-red-700 border-red-200">~30K DAU</Badge></h3>
            <Card>
              <CardContent className="p-5 overflow-x-auto">
                <CostTable rows={ACTIVE_DAY_1M} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Election cycle */}
        <h3>Election Cycle (3 Negotiation Days)</h3>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <CostTable rows={ELECTION_COSTS} />
          </CardContent>
        </Card>
      </div>

      {/* ── Aggregated Estimates ──────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Gesamtschätzungen</h2>

        <h3>Per Sim Day / Sim Month / Wahlperiode</h3>
        <Card className="mb-4">
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Scenario</th>
                  <th className={cn(TH, "text-right")}>Calls/Day</th>
                  <th className={cn(TH, "text-right")}>Cost/Day</th>
                  <th className={cn(TH, "text-right")}>Cost/Month<br /><span className="normal-case font-normal">(30d)</span></th>
                  <th className={cn(TH, "text-right")}>Cost/Wahlperiode<br /><span className="normal-case font-normal">(120d + 1 election)</span></th>
                </tr>
              </thead>
              <tbody>
                {AGG_SIM.map(r => (
                  <tr key={r.scenario} className={TROW}>
                    <td className={TD}>{r.scenario}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.callsDay}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.costDay}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.costMonth}</td>
                    <td className={cn(TD, "text-right tabular-nums font-semibold")}>{r.costWP}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3>Per Real Day / Real Month</h3>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Ultra-fast/fast run without users (~60s/day). Normal/slow are participatory — batch API polling adds 2-15 min per sim day depending on user volume. Sim days/real day reflects inter-day delay + batch execution time.
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Scenario</th>
                  <th className={cn(TH, "text-right")}>Sim Days/Real Day</th>
                  <th className={cn(TH, "text-right")}>Wall Clock/Day</th>
                  <th className={cn(TH, "text-right")}>Cost/Real Day</th>
                  <th className={cn(TH, "text-right")}>Cost/Real Month</th>
                </tr>
              </thead>
              <tbody>
                {AGG_REAL.map(r => (
                  <tr key={r.scenario} className={cn(TROW, r.scenario.includes("theoretical") && "text-muted-foreground")}>
                    <td className={TD}>{r.scenario}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.simDays}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.wallClock}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{r.costDay}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{r.costMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Alternative Model Comparison ──────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Modellvergleich (Alternativen)</h2>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Model</th>
                  <th className={TH}>Price (In / Out)</th>
                  <th className={cn(TH, "text-right")}>Per Sim Day</th>
                  <th className={cn(TH, "text-right")}>Per Wahlperiode</th>
                  <th className={cn(TH, "text-right")}>Per Real Day (auto)</th>
                  <th className={cn(TH, "text-right")}>vs Current</th>
                </tr>
              </thead>
              <tbody>
                {ALTERNATIVES.map(a => (
                  <tr key={a.model} className={TROW}>
                    <td className={cn(TD, "font-medium")}>{a.model}</td>
                    <td className={cn(TD, "text-xs text-muted-foreground tabular-nums")}>{a.priceLabel}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{a.perSimDay}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{a.perWP}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{a.perRealDay}</td>
                    <td className={cn(TD, "text-right font-semibold", a.deltaColor)}>{a.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Hinweise</h2>
        <Card>
          <CardContent className="p-5">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
              <li><strong>Batch API (50% discount)</strong>: All AI calls (simulation-driven AND user-driven) use the Anthropic Message Batches API. Zero sequential <code>callAI()</code> calls remain. Requests are grouped into batch groups (A: party agents, B: interpellations+discipline, C: media+summary, mid-cycle: polls+referendums, user: Q&A+speeches+apps+proposals). Polling adds ~2-15 min latency depending on batch size.</li>
              <li><strong>Selection-style prompts</strong>: Instead of reviewing each item individually, the AI selects the top N from a pool (e.g., "pick best 3 of 500 applications"). This reduces output tokens by 95-99%.</li>
              <li><strong>Pre-filtering</strong>: Deterministic scoring (activity, votes) reduces items sent to AI by 50-90% before batch submission.</li>
              <li><strong>Ultra-fast / Fast modes</strong>: No user participation (0% human seats). Pure AI simulation at ~40-60s/day wall-clock.</li>
              <li><strong>Normal mode (30 min/day)</strong>: Batch latency (2-15 min) is absorbed within the 30-minute inter-day delay. At 1M users, total day duration stretches to ~45 min.</li>
              <li><strong>Slow mode (1.5 hr/day)</strong>: Batch latency is negligible relative to the 90-minute delay. Pauses fully at night (22:00-08:00 CET).</li>
              <li><strong>DAU estimates</strong>: 1K total → ~10% DAU (100), 100K total → ~5% DAU (5,000), 1M total → ~3% DAU (30,000). Not all DAU submit content — ~30% ask questions, ~10% give speeches, ~5% submit proposals.</li>
              <li><strong>Sim day cycles</strong>: polls every ~2 weeks, economic reports monthly, budgets annually, elections every 4 years. Snap elections possible from confidence votes or budget failures.</li>
              <li><strong>AfD/Grok savings</strong>: Using grok-3-mini for 1/6 of party calls saves ~$0.005/day (~10% of party agent cost)</li>
              <li><strong>Synthesis (Sonnet)</strong> is the most expensive single call but happens only ~3 times per election cycle (~once per 4-year term)</li>
              <li><strong>Daily Briefing</strong>: 1 shared Haiku call synthesizes a political narrative from 30 days of event history. Output (~800-1200 tokens) is injected into all party agent prompts, question/interpellation answers, and media generation.</li>
              <li><strong>Party Profiles</strong>: Static per-party personality text (~200-300 tokens) in system prompts — no API cost, but increases input tokens per party agent call.</li>
              <li><strong>Cross-day Memory</strong>: Each party sees its own recent actions (14-day lookback) from the DB — no extra API calls, just larger input context.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Cost breakdown table ────────────────────────────────────────────────────

function CostTable({ rows }: { rows: CostRow[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-border">
          <th className={TH}>Call Type</th>
          <th className={cn(TH, "text-right")}>Count</th>
          <th className={cn(TH, "text-right")}>Input Tok</th>
          <th className={cn(TH, "text-right")}>Output Tok</th>
          <th className={cn(TH, "text-right")}>Cost</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className={cn(TROW, r.highlight && "bg-muted/40 font-semibold")}>
            <td className={TD}>{r.label}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.count}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.inputTok}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.outputTok}</td>
            <td className={cn(TD, "text-right tabular-nums")}>{r.cost}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
