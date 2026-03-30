import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  { model: "grok-3-mini", provider: "xAI", priceIn: "$0.30", priceOut: "$0.50", usedFor: "AfD party agent — Grok used because other models refuse to roleplay as AfD" },
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

// ─── Input scaling comparison ───────────────────────────────────────────────

interface InputScaleRow {
  preset: string;
  simDaysPerDay: string;
  currentPerMonth: string;
  scaled20xPerMonth: string;
  delta: string;
}

const INPUT_SCALE: InputScaleRow[] = [
  { preset: "Ultra-fast", simDaysPerDay: "~1,400", currentPerMonth: "$1,512", scaled20xPerMonth: "$13,188", delta: "+$11,676" },
  { preset: "Fast", simDaysPerDay: "~209", currentPerMonth: "$226", scaled20xPerMonth: "$1,969", delta: "+$1,743" },
  { preset: "Normal", simDaysPerDay: "48", currentPerMonth: "$52", scaled20xPerMonth: "$452", delta: "+$400" },
  { preset: "Slow", simDaysPerDay: "10", currentPerMonth: "$11", scaled20xPerMonth: "$94", delta: "+$83" },
];

// ─── Comprehensive cost matrix: preset × depth × users ─────────────────────

interface CostMatrixRow {
  preset: string;
  depth: string;
  noUsers: string;
  users1k: string;
  users10k: string;
  users100k: string;
  highlight?: boolean;
}

// Ultra-fast & Fast have no users (non-participatory)
// Normal: 48 sim days/real day × 30 = 1,440/month
// Slow: 10 sim days/real day × 30 = 300/month
// User-driven per sim day: 1K=$0.024, 10K=$0.06, 100K=$0.235
const COST_MATRIX: CostMatrixRow[] = [
  // Ultra-fast: 42,000 sim days/month, no users
  { preset: "Ultra-fast", depth: "Low", noUsers: "$1,260", users1k: "—", users10k: "—", users100k: "—" },
  { preset: "Ultra-fast", depth: "Normal", noUsers: "$2,310", users1k: "—", users10k: "—", users100k: "—" },
  { preset: "Ultra-fast", depth: "High", noUsers: "$3,780", users1k: "—", users10k: "—", users100k: "—" },
  // Fast: 6,270 sim days/month, no users
  { preset: "Fast", depth: "Low", noUsers: "$188", users1k: "—", users10k: "—", users100k: "—" },
  { preset: "Fast", depth: "Normal", noUsers: "$345", users1k: "—", users10k: "—", users100k: "—" },
  { preset: "Fast", depth: "High", noUsers: "$564", users1k: "—", users10k: "—", users100k: "—" },
  // Normal: 1,440 sim days/month
  { preset: "Normal", depth: "Low", noUsers: "$43", users1k: "$78", users10k: "$130", users100k: "$382" },
  { preset: "Normal", depth: "Normal", noUsers: "$79", users1k: "$114", users10k: "$166", users100k: "$418", highlight: true },
  { preset: "Normal", depth: "High", noUsers: "$130", users1k: "$164", users10k: "$216", users100k: "$468" },
  // Slow: 300 sim days/month
  { preset: "Slow", depth: "Low", noUsers: "$9", users1k: "$16", users10k: "$27", users100k: "$80" },
  { preset: "Slow", depth: "Normal", noUsers: "$17", users1k: "$24", users10k: "$35", users100k: "$87", highlight: true },
  { preset: "Slow", depth: "High", noUsers: "$27", users1k: "$34", users10k: "$45", users100k: "$98" },
];

// ─── Context depth levels ───────────────────────────────────────────────────

interface DepthRow {
  depth: string;
  tokenBudget: string;
  briefing: string;
  ownActions: string;
  events: string;
  media: string;
  p3: string;
  secondary: string;
  estCostDay: string;
  costBadge: string;
}

const DEPTH_LEVELS: DepthRow[] = [
  { depth: "Low", tokenBudget: "3,000", briefing: "Off", ownActions: "Off", events: "5", media: "2", p3: "Off", secondary: "Off", estCostDay: "~$0.030", costBadge: "$" },
  { depth: "Normal", tokenBudget: "8,000", briefing: "30 days", ownActions: "14 days (15 items)", events: "10", media: "3", p3: "On", secondary: "On", estCostDay: "~$0.055", costBadge: "$$" },
  { depth: "High", tokenBudget: "16,000", briefing: "60 days", ownActions: "30 days (30 items)", events: "20", media: "5", p3: "On", secondary: "On", estCostDay: "~$0.09", costBadge: "$$$" },
];

// ─── Live cost data types ───────────────────────────────────────────────────

interface CostOverviewData {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  failedCalls: number;
  firstDay: number | null;
  lastDay: number | null;
}

interface DayCost {
  dayNumber: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  failedCalls: number;
}

interface TaskCost {
  task: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

interface ModelCost {
  provider: string;
  model: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

interface LiveCostData {
  overview: CostOverviewData | null;
  byDay: DayCost[];
  byTask: TaskCost[];
  byModel: ModelCost[];
}

function useLiveCosts() {
  const [data, setData] = useState<LiveCostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/simulation/costs")
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

function formatUsd(v: number): string {
  if (v < 0.001) return "<$0.001";
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

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
  const { data: liveCosts, loading: costsLoading } = useLiveCosts();

  return (
    <div>
      <h2 className="section-title">KI-Modell-Kosten</h2>

      {/* ── Live Cost Tracking ───────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Live-Kostenübersicht</h2>
        {costsLoading ? (
          <div className="grid md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
        ) : liveCosts?.overview && liveCosts.overview.totalCalls > 0 ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Calls</p>
                  <p className="text-2xl font-bold tabular-nums">{liveCosts.overview.totalCalls.toLocaleString()}</p>
                  {liveCosts.overview.failedCalls > 0 && (
                    <p className="text-xs text-red-500">{liveCosts.overview.failedCalls} failed</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Cost</p>
                  <p className="text-2xl font-bold tabular-nums">{formatUsd(liveCosts.overview.totalCostUsd)}</p>
                  <p className="text-xs text-muted-foreground">
                    Days {liveCosts.overview.firstDay}–{liveCosts.overview.lastDay}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Input Tokens</p>
                  <p className="text-2xl font-bold tabular-nums">{formatTokens(liveCosts.overview.totalInputTokens)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Output Tokens</p>
                  <p className="text-2xl font-bold tabular-nums">{formatTokens(liveCosts.overview.totalOutputTokens)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Cost by model */}
            {liveCosts.byModel.length > 0 && (
              <Card className="mb-4">
                <CardContent className="p-5 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-3">Cost by Model</h3>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Provider</th>
                        <th className={TH}>Model</th>
                        <th className={cn(TH, "text-right")}>Calls</th>
                        <th className={cn(TH, "text-right")}>Input</th>
                        <th className={cn(TH, "text-right")}>Output</th>
                        <th className={cn(TH, "text-right")}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveCosts.byModel.map(m => (
                        <tr key={`${m.provider}-${m.model}`} className={TROW}>
                          <td className={TD}><ProviderBadge provider={m.provider === "anthropic" ? "Anthropic" : "xAI"} /></td>
                          <td className={cn(TD, "font-mono text-xs")}>{m.model}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{m.totalCalls.toLocaleString()}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(m.totalInputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(m.totalOutputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums font-medium")}>{formatUsd(m.totalCostUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Cost by task (top 10) */}
            {liveCosts.byTask.length > 0 && (
              <Card className="mb-4">
                <CardContent className="p-5 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-3">Cost by Task (Top 10)</h3>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={TH}>Task</th>
                        <th className={cn(TH, "text-right")}>Calls</th>
                        <th className={cn(TH, "text-right")}>Input</th>
                        <th className={cn(TH, "text-right")}>Output</th>
                        <th className={cn(TH, "text-right")}>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveCosts.byTask.slice(0, 10).map(t => (
                        <tr key={t.task} className={TROW}>
                          <td className={cn(TD, "font-mono text-xs")}>{t.task}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{t.totalCalls.toLocaleString()}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(t.totalInputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(t.totalOutputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums font-medium")}>{formatUsd(t.totalCostUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Cost by day (last 20) */}
            {liveCosts.byDay.length > 0 && (
              <Card>
                <CardContent className="p-5 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-3">Cost by Day (Recent)</h3>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className={cn(TH, "text-right")}>Day</th>
                        <th className={cn(TH, "text-right")}>Calls</th>
                        <th className={cn(TH, "text-right")}>Input</th>
                        <th className={cn(TH, "text-right")}>Output</th>
                        <th className={cn(TH, "text-right")}>Cost</th>
                        <th className={cn(TH, "text-right")}>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveCosts.byDay.slice(0, 20).map(d => (
                        <tr key={d.dayNumber} className={TROW}>
                          <td className={cn(TD, "text-right tabular-nums font-medium")}>{d.dayNumber}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{d.totalCalls}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(d.totalInputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums")}>{formatTokens(d.totalOutputTokens)}</td>
                          <td className={cn(TD, "text-right tabular-nums font-medium")}>{formatUsd(d.totalCostUsd)}</td>
                          <td className={cn(TD, "text-right tabular-nums", d.failedCalls > 0 ? "text-red-500" : "text-muted-foreground")}>{d.failedCalls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">No cost data recorded yet. Cost tracking starts automatically when the simulation runs.</p>
            </CardContent>
          </Card>
        )}
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
        <p className="text-xs text-muted-foreground mt-2">Speed varies by preset: Ultra-Fast (~3-7 days/term, no users), Fast (~2 weeks/term, no users), Normal (~1 month/term, 30% human seats), Slow (~5 months/term, 70% human seats). All AI calls use the Batch API for 50% cost savings (adds ~2-5 min latency per batch). Sequential calls would be faster but cost 2x more.</p>
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

      {/* ── Cost Matrix: Preset × Depth × Users ───────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Kostenmatrix: Modus × Tiefe × Nutzer (pro Realmonat)</h2>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-3">
              All costs per real calendar month (30 days). Ultra-fast/Fast are non-participatory (no user interactions).
              User-driven costs are depth-independent (same batch calls regardless of context level).
              Highlighted rows show the default configuration (Normal depth).
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Preset</th>
                  <th className={TH}>Depth</th>
                  <th className={cn(TH, "text-right")}>No Users</th>
                  <th className={cn(TH, "text-right")}>1K Users</th>
                  <th className={cn(TH, "text-right")}>10K Users</th>
                  <th className={cn(TH, "text-right")}>100K Users</th>
                </tr>
              </thead>
              <tbody>
                {COST_MATRIX.map((r, i) => {
                  const isGroupStart = i === 0 || COST_MATRIX[i - 1].preset !== r.preset;
                  return (
                    <tr key={`${r.preset}-${r.depth}`} className={cn(
                      TROW,
                      r.highlight && "bg-muted/40 font-semibold",
                      isGroupStart && i > 0 && "border-t-2 border-border",
                    )}>
                      <td className={cn(TD, "font-medium")}>{isGroupStart ? r.preset : ""}</td>
                      <td className={TD}>{r.depth}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{r.noUsers}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{r.users1k}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{r.users10k}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{r.users100k}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              Sim days/month: Ultra-fast ~42,000 | Fast ~6,270 | Normal ~1,440 | Slow ~300.
              User-driven adds per sim day: 1K +$0.024, 10K +$0.06, 100K +$0.235.
              Low depth saves ~$0.025/sim day vs Normal by skipping briefing + reducing context.
              High depth costs ~$0.035/sim day more than Normal (doubled lookbacks + budget).
            </p>
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

      {/* ── Context Depth Levels ────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Kontext-Tiefe (Konfigurierbar)</h2>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Controls how much context each AI agent receives. Configurable via GitHub Actions workflow or admin API.
              Default: <strong>Normal</strong>. Low is cheapest (no briefing, minimal context). High gives richest decisions.
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Depth</th>
                  <th className={cn(TH, "text-right")}>Token Budget</th>
                  <th className={TH}>Briefing</th>
                  <th className={TH}>Own Actions</th>
                  <th className={cn(TH, "text-right")}>Events</th>
                  <th className={cn(TH, "text-right")}>Media</th>
                  <th className={TH}>P3 Sections</th>
                  <th className={TH}>Enrich Secondary</th>
                  <th className={cn(TH, "text-right")}>Est. Cost/Day</th>
                </tr>
              </thead>
              <tbody>
                {DEPTH_LEVELS.map(d => (
                  <tr key={d.depth} className={cn(TROW, d.depth === "Normal" && "bg-muted/40")}>
                    <td className={cn(TD, "font-medium")}>{d.depth} <span className="text-muted-foreground text-xs ml-1">{d.costBadge}</span></td>
                    <td className={cn(TD, "text-right tabular-nums")}>{d.tokenBudget}</td>
                    <td className={TD}>{d.briefing}</td>
                    <td className={TD}>{d.ownActions}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{d.events}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{d.media}</td>
                    <td className={TD}>{d.p3}</td>
                    <td className={TD}>{d.secondary}</td>
                    <td className={cn(TD, "text-right tabular-nums font-medium")}>{d.estCostDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              P3 sections: motions, interpellations, confidence votes, constitutional challenges.
              Secondary calls: citizen Q&amp;A, interpellation answers, media articles receive the daily briefing for richer context.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Input Scaling: Current vs 20× ─────────────────────────── */}
      <div className="mb-8">
        <h2 className="section-title">Input-Token-Skalierung (aktuell vs. 20×)</h2>
        <Card>
          <CardContent className="p-5 overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-3">
              What happens if we fill prompts with 20× more context (~80K tokens/agent instead of ~4K)?
              Output tokens stay the same — only input scales. Haiku&apos;s 200K context window can handle it.
              At batch pricing ($0.50/MTok input, $2.50/MTok output), input is 5× cheaper than output per token.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Current</p>
                <p className="text-sm">~29K input/day &middot; Input = 42% of cost</p>
                <p className="text-lg font-semibold">$0.036/sim day</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">20× Input</p>
                <p className="text-sm">~586K input/day &middot; Input = 93% of cost</p>
                <p className="text-lg font-semibold">$0.314/sim day</p>
              </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Preset</th>
                  <th className={cn(TH, "text-right")}>Sim Days / Real Day</th>
                  <th className={cn(TH, "text-right")}>Current / Real Month</th>
                  <th className={cn(TH, "text-right")}>20× Input / Real Month</th>
                  <th className={cn(TH, "text-right")}>Delta</th>
                </tr>
              </thead>
              <tbody>
                {INPUT_SCALE.map(r => (
                  <tr key={r.preset} className={TROW}>
                    <td className={cn(TD, "font-medium")}>{r.preset}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.simDaysPerDay}</td>
                    <td className={cn(TD, "text-right tabular-nums")}>{r.currentPerMonth}</td>
                    <td className={cn(TD, "text-right tabular-nums font-semibold text-amber-600")}>{r.scaled20xPerMonth}</td>
                    <td className={cn(TD, "text-right tabular-nums text-red-600")}>{r.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              Quiet day (no visitors, no election). Based on batch pricing: $0.50/MTok input, $2.50/MTok output.
              At 20× input, each agent call uses ~80K tokens (40% of 200K window). Normal/Slow modes remain affordable.
              Ultra-fast/Fast are theoretical max-throughput — not intended for production.
            </p>
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
              <li><strong>AfD/Grok</strong>: Grok is used for AfD because other models (e.g. Claude) refuse to authentically roleplay as AfD — they reply with disclaimers like &ldquo;I can&rsquo;t answer as AfD, but here&rsquo;s info about them&rdquo; instead of in-character actions. Grok performs genuine role-playing without political-correctness filtering. This was not a cost decision. As a side effect, grok-3-mini for 1/6 of party calls saves ~$0.005/day (~10% of party agent cost).</li>
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
