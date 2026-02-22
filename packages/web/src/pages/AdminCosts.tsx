import { Link } from "react-router-dom";
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
  { action: "Party Agent (SPD, CDU, Grüne, FDP, Linke)", model: "Haiku", maxTokens: 2048, estInput: "~3000", callsPerDay: "5", note: "Always" },
  { action: "Party Agent (AfD)", model: "Grok-3-mini", maxTokens: 2048, estInput: "~3000", callsPerDay: "1", note: "Always" },
  { action: "Daily Summary", model: "Haiku", maxTokens: 320, estInput: "~800", callsPerDay: "1", note: "Always" },
  { action: "Media Articles (2-3)", model: "Haiku", maxTokens: 2048, estInput: "~1500", callsPerDay: "0-1", note: "Always" },
  { action: "Context Poll", model: "Haiku", maxTokens: 512, estInput: "~600", callsPerDay: "0-1", note: "Weekly" },
  { action: "Referendum", model: "Haiku", maxTokens: 512, estInput: "~600", callsPerDay: "0-1", note: "Every 30d" },
];

const VISITOR_CALLS: SimCallRow[] = [
  { action: "Citizen Q&A", model: "Haiku/Grok", maxTokens: 512, estInput: "~300", callsPerDay: "0-3", note: "User questions" },
  { action: "Interpellation Answer", model: "Haiku/Grok", maxTokens: 300, estInput: "~400", callsPerDay: "0-2", note: "Agent files" },
  { action: "Proposal Review", model: "Haiku/Grok", maxTokens: 256, estInput: "~400", callsPerDay: "0-6", note: "User proposals" },
];

const ELECTION_CALLS: SimCallRow[] = [
  { action: "Negotiation Round (per party)", model: "Haiku/Grok", maxTokens: 1024, estInput: "~1200", callsPerDay: "5-6", note: "15-18 total (3 rounds)" },
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
  { label: "5x Party Agent (Haiku)", count: 5, inputTok: "15,000", outputTok: "5,000", cost: "$0.032" },
  { label: "1x Party Agent (AfD/Grok)", count: 1, inputTok: "3,000", outputTok: "1,000", cost: "$0.0014" },
  { label: "Daily Summary", count: 1, inputTok: "800", outputTok: "200", cost: "$0.0014" },
  { label: "Media Articles", count: 1, inputTok: "1,500", outputTok: "1,500", cost: "$0.0072" },
  { label: "Total", count: 8, inputTok: "20,300", outputTok: "7,700", cost: "~$0.047", highlight: true },
];

const ACTIVE_DAY: CostRow[] = [
  { label: "Base (sim-driven)", count: 8, inputTok: "20,300", outputTok: "7,700", cost: "$0.047" },
  { label: "Citizen Q&A", count: 3, inputTok: "900", outputTok: "900", cost: "$0.0043" },
  { label: "Interpellation Answers", count: 2, inputTok: "800", outputTok: "400", cost: "$0.0022" },
  { label: "Proposal Reviews", count: 3, inputTok: "1,200", outputTok: "450", cost: "$0.0028" },
  { label: "Total", count: 16, inputTok: "23,200", outputTok: "9,450", cost: "~$0.056", highlight: true },
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
  { scenario: "Quiet (no visitors, no election)", callsDay: "8", costDay: "$0.047", callsMonth: "240", costMonth: "$1.41", costWP: "$5.75" },
  { scenario: "Active (visitors + questions)", callsDay: "16", costDay: "$0.056", callsMonth: "480", costMonth: "$1.68", costWP: "$6.83" },
  { scenario: "Election month (1 election)", callsDay: "~9", costDay: "$0.051", callsMonth: "259", costMonth: "$1.52", costWP: "$6.23" },
  { scenario: "Busy month (visitors + election)", callsDay: "~17", costDay: "$0.060", callsMonth: "499", costMonth: "$1.79", costWP: "$7.31" },
];

interface RealTimeRow {
  scenario: string;
  simDays: string;
  wallClock: string;
  costDay: string;
  costMonth: string;
}

const AGG_REAL: RealTimeRow[] = [
  { scenario: "Auto-sim (quiet day)", simDays: "~1,400", wallClock: "~60s/day", costDay: "$66", costMonth: "$1,974" },
  { scenario: "Auto-sim (active day)", simDays: "~1,400", wallClock: "~60s/day", costDay: "$78", costMonth: "$2,352" },
  { scenario: "Auto-sim (theoretical max)", simDays: "2,880", wallClock: "30s/day", costDay: "$135", costMonth: "$4,050" },
  { scenario: "Manual (5 days/run, 3 runs/day)", simDays: "15", wallClock: "—", costDay: "$0.71", costMonth: "$21.2" },
  { scenario: "Manual (10 days/run, 1 run/day)", simDays: "10", wallClock: "—", costDay: "$0.47", costMonth: "$14.1" },
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
  { model: "All Haiku (current default)", priceLabel: "$0.80 / $4.00", perSimDay: "$0.047", perWP: "$5.75", perRealDay: "$66", delta: "baseline", deltaColor: "text-muted-foreground" },
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

export function AdminCosts() {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="section-title !mb-0">KI-Modell-Kosten</h2>
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Zurück zu Admin</Link>
      </div>

      {/* ── Time Scale Reference ─────────────────────────────────── */}
      <div className="mb-8 rounded-lg border border-border bg-muted/30 px-5 py-4">
        <p className="text-sm font-semibold mb-2">Time Scale (1 sim day = 1 real calendar day)</p>
        <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted-foreground">
          <span><strong className="text-foreground">~15 days</strong> = polls</span>
          <span><strong className="text-foreground">~30 days</strong> = monthly econ reports</span>
          <span><strong className="text-foreground">~1 year</strong> = budget cycle</span>
          <span><strong className="text-foreground">~4 years</strong> = 1 Wahlperiode</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Speed varies by preset: Ultra-Fast (~24h/term), Fast (~1 week/term), Normal (~1 month/term), Slow (~5 months/term).</p>
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
        <h3 className="mt-4">Simulation-Driven (Always Happen)</h3>
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

        {/* Visitor-driven */}
        <h3>User/Visitor-Driven</h3>
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

          {/* Active day */}
          <div>
            <h3>Active Day (With Visitors)</h3>
            <Card>
              <CardContent className="p-5 overflow-x-auto">
                <CostTable rows={ACTIVE_DAY} />
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
              Auto-sim interval is 30s, but AI calls add 5–30s per day. Realistic throughput is ~1,400 sim days/real day (not the theoretical 2,880).
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
              <li><strong>Wall-clock time per sim day</strong>: 30s interval + 5–30s AI latency = ~40–60s typical. Election negotiation days can take 60–90s.</li>
              <li><strong>Realistic auto-sim throughput</strong>: ~1,400 sim days/real day (not 2,880). The 30s interval is the minimum, but AI call latency adds overhead on every tick.</li>
              <li><strong>Output tokens are estimates</strong> — actual usage is typically 30-60% of maxTokens</li>
              <li><strong>Input token estimates</strong> based on typical prompt sizes observed in code (system + user prompt)</li>
              <li><strong>Sim day cycles</strong>: polls every ~2 weeks, economic reports monthly, budgets annually, elections every 4 years. Snap elections possible from confidence votes or budget failures.</li>
              <li><strong>Visitor simulation</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">npm run simulate:visitors</code>) does NOT trigger additional AI calls — it only performs UI actions which the next simulation run processes</li>
              <li><strong>AfD/Grok savings</strong>: Using grok-3-mini for 1/6 of party calls saves ~$0.005/day (~10% of party agent cost)</li>
              <li><strong>Synthesis (Sonnet)</strong> is the most expensive single call but happens only ~3 times per election cycle (~once per 4-year term)</li>
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
