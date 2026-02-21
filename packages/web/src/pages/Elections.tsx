import { useEffect, useState, useCallback } from "react";
import { api, type Election, type ElectionResult, type NationalState, type Party, type SimulationStatus, type Fraktion } from "../api";
import { usePolling } from "../usePolling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_BADGE, PHASE_BADGE, VOTE_HEX, SEMANTIC_HEX } from "@/lib/colors";
import { TERM_DURATION, PRESET_LABEL, formatTimeToElection } from "@/lib/timing";

const MAJORITY_THRESHOLD = 368;

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function ideologicalSpread(selected: Party[]): number | null {
  if (selected.length < 2) return null;
  let total = 0, pairs = 0;
  const keys = ["economy", "social", "environment", "immigration", "spending"] as const;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const dist = keys.reduce((s, k) =>
        s + Math.abs(((selected[i].policyPriorities as Record<string, number>)[k] ?? 0) - ((selected[j].policyPriorities as Record<string, number>)[k] ?? 0)), 0);
      total += dist; pairs++;
    }
  }
  return Math.round((total / pairs) * 10) / 10;
}

function CoalitionCalculator({ parties, currentCoalitionIds }: { parties: Party[]; currentCoalitionIds: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentCoalitionIds));

  const seatedParties = [...parties].filter(p => p.seatCount > 0).sort((a, b) => b.seatCount - a.seatCount);
  const totalSeats = seatedParties.reduce((s, p) => s + p.seatCount, 0) || 735;
  const selectedParties = seatedParties.filter(p => selected.has(p.id));
  const selectedSeats = selectedParties.reduce((s, p) => s + p.seatCount, 0);
  const hasMajority = selectedSeats >= MAJORITY_THRESHOLD;
  const spread = ideologicalSpread(selectedParties);
  const spreadLabel = spread == null ? null : spread <= 1.0 ? "Compatible" : spread <= 2.0 ? "Manageable" : "Fragmented";
  const spreadColor = spread == null ? SEMANTIC_HEX.neutral : spread <= 1.0 ? SEMANTIC_HEX.positive : spread <= 2.0 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="mb-8">
      <h2 className="border-b border-border pb-2 mb-4">Coalition Calculator</h2>
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-1.5">
            {seatedParties.map(p => {
              const color = p.color === "#FFED00" ? "#c4a900" : p.color;
              const isSelected = selected.has(p.id);
              const barWidth = (p.seatCount / totalSeats) * 100;
              return (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded"
                  style={{
                    background: isSelected ? `${color}18` : "transparent",
                    border: `1px solid ${isSelected ? color : "#eee"}`,
                    opacity: isSelected ? 1 : 0.55,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(p.id)}
                    onClick={e => e.stopPropagation()}
                    className="cursor-pointer size-3.5"
                  />
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-semibold text-sm min-w-15">{p.name}</span>
                  <span className="text-sm text-muted-foreground min-w-16">{p.seatCount} seats</span>
                  <div className="flex-1 bg-muted rounded h-2 max-w-44">
                    <div className="h-full rounded" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 pt-3 border-t border-border flex gap-5 flex-wrap items-center">
            <div className="font-bold text-sm">
              <span style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {selectedSeats} / {totalSeats} seats
              </span>
              <span className="ml-2.5 text-sm font-extrabold" style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {hasMajority ? "MAJORITY ✓" : "MINORITY ✗"}
              </span>
            </div>
            {spread != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Ideology spread: </span>
                <span className="font-bold" style={{ color: spreadColor }}>{spread} — {spreadLabel}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BundesadlerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,215,0,0.9)">
      <path d="M12 2 C10 3 6 4 4 7 L7 8 C5 10 4 12 5 14 L8 13 C9 16 10 18 12 20 C14 18 15 16 16 13 L19 14 C20 12 19 10 17 8 L20 7 C18 4 14 3 12 2Z" />
    </svg>
  );
}

function avatarUrl(name: string, color: string, size = 32): string {
  const bg = (color === "#FFED00" ? "#c4a900" : color).replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size * 2}&bold=true&background=${bg}&color=fff&rounded=true`;
}

function Hemicycle({ results, parties }: { results: ElectionResult[]; parties: Party[] }) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => {
    const order = ["linke", "gruene", "spd", "fdp", "cdu", "afd"];
    return order.indexOf(a.partyId) - order.indexOf(b.partyId);
  });

  const totalSeats = sorted.reduce((s, r) => s + r.seatsWon, 0);
  const cx = 200, cy = 190, outerR = 170, innerR = 95, gap = 0.01;
  let currentAngle = Math.PI;

  const arcs = sorted.map(r => {
    const party = parties.find(p => p.id === r.partyId);
    const sweep = (r.seatsWon / totalSeats) * Math.PI - gap;
    const startAngle = currentAngle;
    const endAngle = currentAngle - sweep;
    currentAngle = endAngle - gap;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy - outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy - outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy - innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy - innerR * Math.sin(startAngle);

    const largeArc = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      `Z`,
    ].join(" ");

    return { d, color: party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999"), partyId: r.partyId };
  });

  return (
    <svg viewBox="0 0 400 210" style={{ width: "100%", maxWidth: 360 }}>
      {arcs.map(arc => <path key={arc.partyId} d={arc.d} fill={arc.color} />)}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="22" fontWeight="700" fill="#333">{totalSeats} seats</text>
    </svg>
  );
}

function VoteBarChart({ results, parties, previousResults }: {
  results: ElectionResult[];
  parties: Party[];
  previousResults: ElectionResult[] | null;
}) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => b.votesPercent - a.votesPercent);
  const maxPct = Math.ceil(Math.max(...sorted.map(r => r.votesPercent)) / 5) * 5 + 5;

  return (
    <div className="flex flex-col gap-0.5 mt-2">
      <div className="flex items-end h-[200px] gap-0 pl-0">
        {sorted.map(r => {
          const party = parties.find(p => p.id === r.partyId);
          const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
          const prevResult = previousResults?.find(pr => pr.partyId === r.partyId);
          const barHeight = (r.votesPercent / maxPct) * 180;
          const prevBarHeight = prevResult ? (prevResult.votesPercent / maxPct) * 180 : 0;

          return (
            <div key={r.partyId} className="flex flex-col items-center flex-1 gap-0.5">
              <span className="text-xs font-semibold">{r.votesPercent}%</span>
              <div className="flex items-end gap-0.5 h-[180px]">
                <div className="w-6 rounded-t" style={{ height: barHeight, backgroundColor: color }} />
                {previousResults && (
                  <div className="w-4 rounded-t bg-muted-foreground/30" style={{ height: prevBarHeight }} />
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-16 text-center">
                {party?.name || r.partyId}
              </span>
            </div>
          );
        })}
      </div>
      {previousResults && (
        <div className="flex gap-4 justify-center mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-3 bg-zinc-600 inline-block" /> Current
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 bg-muted-foreground/30 inline-block" /> Previous
          </span>
        </div>
      )}
    </div>
  );
}

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`;
  if (n === 0) return "\u00B10";
  return `${n}`;
}

function formatPctDelta(current: number, previous: number | undefined): string {
  if (previous === undefined) return "-";
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) return `+${diff}`;
  if (diff === 0) return "\u00B10.0";
  return `${diff}`;
}

function SeatsDotAndName({ color, name }: { color: string; name: string }) {
  return (
    <td className="px-3 py-2 border-b border-border">
      <span className="inline-block size-3 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
      <strong>{name}</strong>
    </td>
  );
}

function CoalitionChips({ ids, parties, results, isFull }: { ids: string[]; parties: Party[]; results?: ElectionResult[] | null; isFull?: boolean }) {
  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {ids.map(id => {
        const p = parties.find(x => x.id === id);
        const color = p?.color === "#FFED00" ? "#c4a900" : (p?.color || "#999");
        const result = results?.find(r => r.partyId === id);
        return (
          <div
            key={id}
            className={cn("flex items-center gap-1.5 px-3 py-1 rounded", isFull ? "font-semibold text-sm" : "text-sm text-muted-foreground")}
            style={isFull
              ? { border: `2px solid ${color}`, background: `${color}18` }
              : { border: "1px solid var(--color-border)" }
            }
          >
            {isFull && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
            {p?.name || id}
            {result && <span className="font-normal text-muted-foreground">({result.seatsWon})</span>}
            {!result && p && <span className="text-muted-foreground">({p.seatCount})</span>}
          </div>
        );
      })}
    </div>
  );
}

export function Elections() {
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [fraktionen, setFraktionen] = useState<Fraktion[]>([]);
  const [state, setState] = useState<NationalState | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getElections().then(el => {
      const sorted = [...el].sort((a, b) => b.electionDay - a.electionDay);
      setElections(sorted);
      if (!selectedId && sorted.length > 0) setSelectedId(sorted[0].id);
    }).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getFraktionen().then(setFraktionen).catch(console.error);
    api.getState().then(setState).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
  }, [selectedId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const selected = elections.find(e => e.id === selectedId) || null;
  const selectedIndex = elections.findIndex(e => e.id === selectedId);
  const previousElection = selectedIndex >= 0 && selectedIndex < elections.length - 1
    ? elections[selectedIndex + 1]
    : null;

  const fraktionLeaderMap = new Map<string, string>();
  for (const f of fraktionen) {
    if (f.status === "active" || !fraktionLeaderMap.has(f.partyId)) {
      fraktionLeaderMap.set(f.partyId, f.leaderName);
    }
  }

  // No elections yet — show current composition
  if (elections.length === 0 && parties.length > 0 && state) {
    const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
    const currentResults: ElectionResult[] = parties.map(p => ({
      partyId: p.id,
      seatsWon: p.seatCount,
      votesPercent: Math.round((p.seatCount / totalSeats) * 1000) / 10,
      seatDelta: 0,
    }));
    const coalitionIds = state.coalitionParties;
    const oppositionIds = state.oppositionParties;
    const coalitionSeats = parties.filter(p => coalitionIds.includes(p.id)).reduce((s, p) => s + p.seatCount, 0);

    return (
      <div>
        {/* Header */}
        <div className="bg-blue-900 px-6 py-4 rounded border-b-[3px] border-b-amber-400">
          <div className="flex items-center gap-2.5">
            <BundesadlerIcon size={28} />
            <h1 className="!m-0 !text-white !text-xl">Bundestag — Current Composition</h1>
          </div>
          {simStatus && (
            <div className="text-sm text-white/80 mt-1.5">
              Next scheduled election: <strong>Day {simStatus.nextElectionDay}</strong>
              {simStatus.nextElectionDay > simStatus.currentDay && (
                <span className="text-white/65"> — {simStatus.nextElectionDay - simStatus.currentDay} sim days ({formatTimeToElection(simStatus.nextElectionDay - simStatus.currentDay, simStatus.timingPreset)} in {PRESET_LABEL[simStatus.timingPreset]} mode)</span>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 mb-8">
          <p className="text-sm text-muted-foreground mb-3">
            Initial seating — no election has been simulated yet. Trigger one via Admin or wait for the scheduled election (4 sim years ≈ {TERM_DURATION[simStatus?.timingPreset ?? "normal"]} real time in {PRESET_LABEL[simStatus?.timingPreset ?? "normal"]} mode).
          </p>
          <div className="grid grid-cols-[auto_1fr] gap-8 items-start max-md:grid-cols-1">
            <div>
              <Hemicycle results={currentResults} parties={parties} />
              <div className="text-center text-xs text-muted-foreground mt-1">
                Coalition majority: {coalitionSeats} / {totalSeats} seats
              </div>
            </div>
            <div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Political party</th>
                    <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Seats</th>
                    <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {[...parties].sort((a, b) => b.seatCount - a.seatCount).map(p => {
                    const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                    return (
                      <tr key={p.id}>
                        <SeatsDotAndName color={color} name={p.name} />
                        <td className="px-3 py-2 border-b border-border text-right font-semibold">{p.seatCount}</td>
                        <td className="px-3 py-2 border-b border-border text-right">
                          <Badge className={`${ROLE_BADGE[p.coalitionRole] || ""} text-xs`}>{p.coalitionRole}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="border-b border-border pb-2 mb-4">Government</h2>
          <Card>
            <CardContent className="p-5">
              <div className="mb-3">
                <strong>Coalition</strong>
                <CoalitionChips ids={coalitionIds} parties={parties} isFull />
              </div>
              <div>
                <strong>Opposition</strong>
                <CoalitionChips ids={oppositionIds} parties={parties} />
              </div>
            </CardContent>
          </Card>
        </div>

        <CoalitionCalculator parties={parties} currentCoalitionIds={coalitionIds} />
      </div>
    );
  }

  if (elections.length === 0) {
    return <div><h1>Elections</h1><p className="text-center py-8 text-muted-foreground">Loading…</p></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-blue-900 px-6 py-4 rounded border-b-[3px] border-b-amber-400">
        <div className="flex items-center gap-2.5">
          <BundesadlerIcon size={28} />
          <h1 className="!m-0 !text-white !text-xl">Bundestag Election</h1>
        </div>
        {simStatus && !selected && (
          <div className="text-xs text-white/80 mt-1">
            Next election: Day {simStatus.nextElectionDay}
            {simStatus.nextElectionDay > simStatus.currentDay && ` (${simStatus.nextElectionDay - simStatus.currentDay} sim days ≈ ${formatTimeToElection(simStatus.nextElectionDay - simStatus.currentDay, simStatus.timingPreset)})`}
          </div>
        )}
      </div>

      {/* Election selector */}
      <div className="mt-6 mb-6 flex items-center gap-4 flex-wrap">
        <label htmlFor="election-select" className="font-semibold">Select election:</label>
        <select
          id="election-select"
          value={selectedId || ""}
          onChange={e => setSelectedId(e.target.value)}
          className={SELECT_CLS}
        >
          {elections.map(el => (
            <option key={el.id} value={el.id}>
              Day {el.electionDay} — {el.triggerReason} ({el.status})
            </option>
          ))}
        </select>
      </div>

      {selected && selected.status === "completed" && selected.results && (
        <>
          {/* Anchor links */}
          <div className="flex gap-6 mb-6 text-sm">
            <a href="#seats" className="text-primary font-medium no-underline hover:underline before:content-['↓_']">Distribution of seats</a>
            <a href="#votes" className="text-primary font-medium no-underline hover:underline before:content-['↓_']">Votes</a>
            <a href="#results" className="text-primary font-medium no-underline hover:underline before:content-['↓_']">Result table</a>
          </div>

          {/* Distribution of seats */}
          <div id="seats" className="mb-8">
            <h2 className="border-b border-border pb-2 mb-4">Distribution of seats</h2>
            <div className="grid grid-cols-[auto_1fr] gap-8 items-start max-md:grid-cols-1">
              <div>
                <Hemicycle results={selected.results} parties={parties} />
              </div>
              <div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Political party</th>
                      <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Seats</th>
                      <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold">Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected.results].sort((a, b) => b.seatsWon - a.seatsWon).map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                      const isCoalition = selected.newCoalition?.includes(r.partyId);
                      return (
                        <tr key={r.partyId}>
                          <td className="px-3 py-2 border-b border-border">
                            <span className="inline-block size-3 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                            <strong>{party?.name || r.partyId}</strong>
                            {isCoalition && (
                              <span className="text-xs text-primary ml-1.5">
                                {selected.newCoalition?.[0] === r.partyId ? "Leader" : "Coalition"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold">{r.seatsWon}</td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold"
                            style={{ color: r.seatDelta > 0 ? SEMANTIC_HEX.positive : r.seatDelta < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral }}>
                            {formatDelta(r.seatDelta)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Votes bar chart */}
          <div id="votes" className="mb-8">
            <h2 className="border-b border-border pb-2 mb-2">Votes</h2>
            <div className="text-xs text-muted-foreground mb-2">Election Day {selected.electionDay}</div>
            <Card>
              <CardContent className="p-5">
                <VoteBarChart results={selected.results} parties={parties} previousResults={previousElection?.results || null} />
              </CardContent>
            </Card>
          </div>

          {/* Result table */}
          <div id="results" className="mb-8">
            <h2 className="border-b border-border pb-2 mb-2">Result table</h2>
            <div className="text-xs text-muted-foreground mb-3">Final result</div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="text-left px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold">Specification</th>
                      <th colSpan={3} className="text-center px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold">Votes</th>
                    </tr>
                    <tr>
                      <th className="text-right px-3 py-2 bg-muted/50 text-primary text-xs font-semibold">%</th>
                      <th className="text-right px-3 py-2 bg-muted/50 text-primary text-xs font-semibold">Seats</th>
                      <th className="text-right px-3 py-2 bg-muted/50 text-primary text-xs font-semibold">Diff. on prev.<br />in p.p.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted/50">
                      <td className="px-3 py-2 font-semibold border-b-2 border-border">Total seats</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border">-</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border">{selected.results.reduce((s, r) => s + r.seatsWon, 0)}</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border">-</td>
                    </tr>
                    {[...selected.results].sort((a, b) => b.votesPercent - a.votesPercent).map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                      const prevResult = previousElection?.results?.find(pr => pr.partyId === r.partyId);
                      return (
                        <tr key={r.partyId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 border-b border-border">
                            <span className="inline-block size-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                            {party?.name || r.partyId}
                          </td>
                          <td className="px-3 py-2 border-b border-border text-right">{r.votesPercent}</td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold">{r.seatsWon}</td>
                          <td className="px-3 py-2 border-b border-border text-right"
                            style={{
                              color: prevResult
                                ? (r.votesPercent - prevResult.votesPercent > 0 ? SEMANTIC_HEX.positive : r.votesPercent - prevResult.votesPercent < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral)
                                : SEMANTIC_HEX.neutral,
                            }}>
                            {formatPctDelta(r.votesPercent, prevResult?.votesPercent)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Coalition info */}
          {selected.newCoalition && (
            <div className="mb-8">
              <h2 className="border-b border-border pb-2 mb-4">Government</h2>
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3">
                    <strong>Coalition</strong>
                    <CoalitionChips ids={selected.newCoalition} parties={parties} results={selected.results} isFull />
                  </div>
                  {selected.newOpposition && selected.newOpposition.length > 0 && (
                    <div>
                      <strong>Opposition</strong>
                      <CoalitionChips ids={selected.newOpposition} parties={parties} results={selected.results} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Coalition Agreement */}
          {selected.coalitionAgreement && (
            <div className="mb-8">
              <h2 className="border-b border-border pb-2 mb-4">Coalition Agreement</h2>
              <Card>
                <CardContent className="p-5">
                  <p className="mb-3 leading-relaxed">{selected.coalitionAgreement.summary}</p>
                  {selected.coalitionAgreement.keyPolicies.length > 0 && (
                    <div className="mb-3">
                      <strong>Key Policies</strong>
                      <ul className="mt-1 pl-5 list-disc">
                        {selected.coalitionAgreement.keyPolicies.map((p, i) => (
                          <li key={i} className="text-sm mb-1">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Object.keys(selected.coalitionAgreement.concessions).length > 0 && (
                    <div>
                      <strong>Concessions</strong>
                      <div className="mt-1">
                        {Object.entries(selected.coalitionAgreement.concessions).map(([partyId, concession]) => {
                          const party = parties.find(p => p.id === partyId);
                          return (
                            <div key={partyId} className="text-sm text-muted-foreground mb-1">
                              <strong>{party?.name || partyId}:</strong> {concession}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Negotiation Rounds */}
          {selected.negotiationRounds && selected.negotiationRounds.length > 0 && (
            <div className="mb-8">
              <h2 className="border-b border-border pb-2 mb-4">Negotiation Rounds</h2>
              {selected.negotiationRounds.map((round, roundIdx) => (
                <Card key={roundIdx} className="mb-3">
                  <CardContent className="p-5">
                    <h3 className="text-base font-semibold mb-2 text-primary">Round {roundIdx + 1}</h3>
                    {round.map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                      const leaderName = fraktionLeaderMap.get(r.partyId);
                      return (
                        <div key={r.partyId} className="mb-2.5 pl-3" style={{ borderLeft: `3px solid ${color}` }}>
                          <div className="flex items-center gap-2 font-semibold text-sm">
                            {leaderName && party && (
                              <img
                                src={avatarUrl(leaderName, party.color, 32)}
                                alt={leaderName}
                                className="size-8 rounded-full shrink-0"
                              />
                            )}
                            <span>{party?.name || r.partyId}{leaderName ? ` — ${leaderName}` : ""}</span>
                          </div>
                          <div className="text-sm mt-0.5">{r.position}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Concession: {r.concession}</div>
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            Acceptable partners: {r.acceptablePartners.map(id => parties.find(p => p.id === id)?.name || id).join(", ")}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Active election */}
      {selected && selected.status !== "completed" && (
        <div className="mb-8">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <Badge className={`${PHASE_BADGE[selected.status] || ""} text-sm px-2.5 py-1`}>
                  {selected.status.toUpperCase()}
                </Badge>
                <span className="font-semibold text-lg">{selected.triggerReason}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>Announced on Day {selected.announcedOnDay}</div>
                <div>Campaign starts Day {selected.campaignStartDay}</div>
                <div>Election Day {selected.electionDay}</div>
                {simStatus && selected.status !== "negotiation" && selected.electionDay > simStatus.currentDay && (
                  <div className="mt-2 font-bold text-lg text-foreground">
                    {selected.electionDay - simStatus.currentDay} days until election
                  </div>
                )}
                {selected.status === "negotiation" && (
                  <div className="mt-2">
                    <div className="font-bold text-lg text-primary">Coalition Negotiations in Progress</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Round {(selected.negotiationRounds?.length || 0)} of 3 completed
                    </div>
                    {selected.results && (
                      <div className="mt-2">
                        <Hemicycle results={selected.results} parties={parties} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {state && parties.length > 0 && (
        <CoalitionCalculator parties={parties} currentCoalitionIds={state.coalitionParties} />
      )}
    </div>
  );
}
