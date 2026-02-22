import { useEffect, useState, useCallback } from "react";
import { api, type Election, type ElectionResult, type NationalState, type Party, type SimulationStatus, type Fraktion } from "../api";
import { usePolling } from "../usePolling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_BADGE, PHASE_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { TERM_DURATION, PRESET_LABEL, formatTimeToElection } from "@/lib/timing";
import { Hemicycle } from "@/components/Hemicycle";

const MAJORITY_THRESHOLD = 368;

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function fixColor(c: string): string {
  return c === "#FFED00" ? "#c4a900" : c;
}

/** Convert election results + parties → SeatGroup[] for the Hemicycle component */
function resultsToSeats(results: ElectionResult[], parties: Party[]) {
  return results.filter(r => r.seatsWon > 0).map(r => {
    const party = parties.find(p => p.id === r.partyId);
    return { partyId: r.partyId, count: r.seatsWon, color: party?.color || "#999", name: party?.name || r.partyId };
  });
}

function partiesToSeats(parties: Party[]) {
  return parties.filter(p => p.seatCount > 0).map(p => ({
    partyId: p.id, count: p.seatCount, color: p.color, name: p.name,
  }));
}

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
  const spreadLabel = spread == null ? null : spread <= 1.0 ? "Kompatibel" : spread <= 2.0 ? "Moderat" : "Fragmentiert";
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
      <h2 className="section-title">Koalitionsrechner</h2>
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-1.5">
            {seatedParties.map(p => {
              const color = fixColor(p.color);
              const isSelected = selected.has(p.id);
              const barWidth = (p.seatCount / totalSeats) * 100;
              return (
                <div
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded"
                  style={{
                    background: isSelected ? `${color}18` : "transparent",
                    border: `1px solid ${isSelected ? color : "var(--color-border)"}`,
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
                  <span className="font-semibold text-sm min-w-20">{p.name}</span>
                  <span className="text-sm text-muted-foreground tabular-nums min-w-16">{p.seatCount} Sitze</span>
                  <div className="flex-1 bg-muted rounded h-2.5 max-w-48">
                    <div className="h-full rounded" style={{ width: `${barWidth}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 pt-3 border-t border-border flex gap-5 flex-wrap items-center">
            <div className="font-bold text-sm">
              <span style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {selectedSeats} / {totalSeats} Sitze
              </span>
              <span className="ml-2.5 text-sm font-extrabold" style={{ color: hasMajority ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                {hasMajority ? "MEHRHEIT" : "MINDERHEIT"}
              </span>
            </div>
            {spread != null && (
              <div className="text-sm">
                <span className="text-muted-foreground">Ideologische Distanz: </span>
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
  const bg = fixColor(color).replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size * 2}&bold=true&background=${bg}&color=fff&rounded=true`;
}

/** Horizontal bar chart — Politico-style */
function VoteBarChart({ results, parties, previousResults }: {
  results: ElectionResult[];
  parties: Party[];
  previousResults: ElectionResult[] | null;
}) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => b.votesPercent - a.votesPercent);
  const maxPct = Math.max(...sorted.map(r => r.votesPercent), 1);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(r => {
        const party = parties.find(p => p.id === r.partyId);
        const color = fixColor(party?.color || "#999");
        const prevResult = previousResults?.find(pr => pr.partyId === r.partyId);
        const barWidth = (r.votesPercent / maxPct) * 100;
        const prevWidth = prevResult ? (prevResult.votesPercent / maxPct) * 100 : 0;
        const delta = prevResult ? Math.round((r.votesPercent - prevResult.votesPercent) * 10) / 10 : null;

        return (
          <div key={r.partyId} className="flex items-center gap-3">
            <div className="min-w-24 shrink-0 flex items-center gap-2">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium truncate">{party?.name || r.partyId}</span>
            </div>
            <div className="flex-1 relative h-7 bg-muted/50 rounded overflow-hidden">
              {previousResults && prevResult && (
                <div
                  className="absolute top-0 h-full rounded bg-muted-foreground/15"
                  style={{ width: `${prevWidth}%` }}
                />
              )}
              <div
                className="absolute top-0 h-full rounded"
                style={{ width: `${barWidth}%`, backgroundColor: color }}
              />
            </div>
            <div className="min-w-20 shrink-0 text-right">
              <span className="text-sm font-extrabold tabular-nums">{r.votesPercent}%</span>
              {delta != null && (
                <span
                  className="text-xs ml-1.5 tabular-nums"
                  style={{ color: delta > 0 ? SEMANTIC_HEX.positive : delta < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral }}
                >
                  {delta > 0 ? "+" : ""}{delta}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {previousResults && (
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded bg-zinc-500 inline-block" /> Aktuell
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded bg-muted-foreground/15 inline-block" /> Vorherig
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

function CoalitionChips({ ids, parties, results, isFull }: { ids: string[]; parties: Party[]; results?: ElectionResult[] | null; isFull?: boolean }) {
  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {ids.map(id => {
        const p = parties.find(x => x.id === id);
        const color = fixColor(p?.color || "#999");
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

  /* ── No elections yet — show current composition ───────────────── */
  if (elections.length === 0 && parties.length > 0 && state) {
    const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
    const coalitionIds = state.coalitionParties;
    const oppositionIds = state.oppositionParties;
    const coalitionSeats = parties.filter(p => coalitionIds.includes(p.id)).reduce((s, p) => s + p.seatCount, 0);

    return (
      <div>
        {/* Header */}
        <div className="bg-primary px-6 py-4 rounded-t border-b-[3px] border-b-amber-400">
          <div className="flex items-center gap-2.5">
            <BundesadlerIcon size={28} />
            <h1 className="!m-0 !text-white !text-xl">Bundestag — Aktuelle Zusammensetzung</h1>
          </div>
          {simStatus && (
            <div className="text-sm text-white/80 mt-1.5">
              Nächste Wahl: <strong>Tag {simStatus.nextElectionDay}</strong>
              {simStatus.nextElectionDay > simStatus.currentDay && (
                <span className="text-white/65"> — {simStatus.nextElectionDay - simStatus.currentDay} Simulationstage ({formatTimeToElection(simStatus.nextElectionDay - simStatus.currentDay, simStatus.timingPreset)} im {PRESET_LABEL[simStatus.timingPreset]}-Modus)</span>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 mb-8">
          <p className="text-sm text-muted-foreground mb-4">
            Anfangssitzverteilung — es wurde noch keine Wahl simuliert. Lösen Sie eine über Admin aus oder warten Sie auf die geplante Wahl (4 Sim-Jahre ≈ {TERM_DURATION[simStatus?.timingPreset ?? "normal"]} Echtzeit im {PRESET_LABEL[simStatus?.timingPreset ?? "normal"]}-Modus).
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
            <div className="flex flex-col items-center">
              <Hemicycle seats={partiesToSeats(parties)} size="md" />
              <div className="text-xs text-muted-foreground mt-1">
                Koalitionsmehrheit: {coalitionSeats} / {totalSeats} Sitze
              </div>
            </div>
            <div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Partei</th>
                    <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Sitze</th>
                    <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Rolle</th>
                  </tr>
                </thead>
                <tbody>
                  {[...parties].sort((a, b) => b.seatCount - a.seatCount).map(p => {
                    const color = fixColor(p.color);
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 border-b border-border">
                          <span className="inline-block size-3 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                          <strong>{p.name}</strong>
                        </td>
                        <td className="px-3 py-2 border-b border-border text-right font-semibold tabular-nums">{p.seatCount}</td>
                        <td className="px-3 py-2 border-b border-border text-right">
                          <Badge variant="outline" className={cn(ROLE_BADGE[p.coalitionRole] || "", "text-xs")}>{p.coalitionRole}</Badge>
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
          <h2 className="section-title">Regierung</h2>
          <Card>
            <CardContent className="p-5">
              <div className="mb-3">
                <strong>Koalition</strong>
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
    return <div><h1>Wahlen</h1><p className="text-center py-8 text-muted-foreground">Laden…</p></div>;
  }

  /* ── Main election view ────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div className="bg-primary px-6 py-4 rounded-t border-b-[3px] border-b-amber-400">
        <div className="flex items-center gap-2.5">
          <BundesadlerIcon size={28} />
          <h1 className="!m-0 !text-white !text-xl">Bundestagswahl</h1>
        </div>
        {simStatus && !selected && (
          <div className="text-xs text-white/80 mt-1">
            Nächste Wahl: Tag {simStatus.nextElectionDay}
            {simStatus.nextElectionDay > simStatus.currentDay && ` (${simStatus.nextElectionDay - simStatus.currentDay} Tage ≈ ${formatTimeToElection(simStatus.nextElectionDay - simStatus.currentDay, simStatus.timingPreset)})`}
          </div>
        )}
      </div>

      {/* Election selector */}
      <div className="mt-6 mb-6 flex items-center gap-4 flex-wrap">
        <label htmlFor="election-select" className="font-semibold text-sm">Wahl auswählen:</label>
        <select
          id="election-select"
          value={selectedId || ""}
          onChange={e => setSelectedId(e.target.value)}
          className={SELECT_CLS}
        >
          {elections.map(el => (
            <option key={el.id} value={el.id}>
              Tag {el.electionDay} — {el.triggerReason} ({el.status})
            </option>
          ))}
        </select>
      </div>

      {selected && selected.status === "completed" && selected.results && (
        <>
          {/* Anchor links */}
          <div className="flex gap-6 mb-6 text-sm">
            <a href="#seats" className="text-primary font-medium no-underline hover:underline">Sitzverteilung</a>
            <a href="#votes" className="text-primary font-medium no-underline hover:underline">Stimmenanteile</a>
            <a href="#results" className="text-primary font-medium no-underline hover:underline">Ergebnistabelle</a>
          </div>

          {/* Distribution of seats */}
          <div id="seats" className="mb-8">
            <h2 className="section-title">Sitzverteilung</h2>
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
              <div className="flex flex-col items-center">
                <Hemicycle seats={resultsToSeats(selected.results, parties)} size="md" />
              </div>
              <div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Partei</th>
                      <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Sitze</th>
                      <th className="text-right px-3 py-1.5 border-b-2 border-primary text-primary text-xs uppercase font-semibold tracking-wider">Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected.results].sort((a, b) => b.seatsWon - a.seatsWon).map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = fixColor(party?.color || "#999");
                      const isCoalition = selected.newCoalition?.includes(r.partyId);
                      return (
                        <tr key={r.partyId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 border-b border-border">
                            <span className="inline-block size-3 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                            <strong>{party?.name || r.partyId}</strong>
                            {isCoalition && (
                              <span className="text-xs text-primary ml-1.5">
                                {selected.newCoalition?.[0] === r.partyId ? "Regierung" : "Koalition"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold tabular-nums">{r.seatsWon}</td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold tabular-nums"
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

          {/* Votes — horizontal bar chart */}
          <div id="votes" className="mb-8">
            <h2 className="section-title">Stimmenanteile</h2>
            <div className="text-xs text-muted-foreground mb-3">Wahltag {selected.electionDay}</div>
            <Card>
              <CardContent className="p-5">
                <VoteBarChart results={selected.results} parties={parties} previousResults={previousElection?.results || null} />
              </CardContent>
            </Card>
          </div>

          {/* Result table */}
          <div id="results" className="mb-8">
            <h2 className="section-title">Ergebnistabelle</h2>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold tracking-wider">Partei</th>
                      <th className="text-right px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold tracking-wider">%</th>
                      <th className="text-right px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold tracking-wider">Sitze</th>
                      <th className="text-right px-3 py-2 border-b-2 border-primary bg-muted/50 text-primary text-xs font-semibold tracking-wider">Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-muted/50">
                      <td className="px-3 py-2 font-semibold border-b-2 border-border">Gesamt</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border">-</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border font-semibold tabular-nums">{selected.results.reduce((s, r) => s + r.seatsWon, 0)}</td>
                      <td className="px-3 py-2 text-right border-b-2 border-border">-</td>
                    </tr>
                    {[...selected.results].sort((a, b) => b.votesPercent - a.votesPercent).map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = fixColor(party?.color || "#999");
                      const prevResult = previousElection?.results?.find(pr => pr.partyId === r.partyId);
                      return (
                        <tr key={r.partyId} className="hover:bg-muted/30">
                          <td className="px-3 py-2 border-b border-border">
                            <span className="inline-block size-2.5 rounded-full mr-2 align-middle" style={{ backgroundColor: color }} />
                            {party?.name || r.partyId}
                          </td>
                          <td className="px-3 py-2 border-b border-border text-right tabular-nums">{r.votesPercent}</td>
                          <td className="px-3 py-2 border-b border-border text-right font-semibold tabular-nums">{r.seatsWon}</td>
                          <td className="px-3 py-2 border-b border-border text-right tabular-nums"
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
              <h2 className="section-title">Regierung</h2>
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3">
                    <strong>Koalition</strong>
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
              <h2 className="section-title">Koalitionsvertrag</h2>
              <Card>
                <CardContent className="p-5">
                  <p className="mb-3 leading-relaxed">{selected.coalitionAgreement.summary}</p>
                  {selected.coalitionAgreement.keyPolicies.length > 0 && (
                    <div className="mb-3">
                      <strong>Kernpolitiken</strong>
                      <ul className="mt-1 pl-5 list-disc">
                        {selected.coalitionAgreement.keyPolicies.map((p, i) => (
                          <li key={i} className="text-sm mb-1">{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Object.keys(selected.coalitionAgreement.concessions).length > 0 && (
                    <div>
                      <strong>Zugeständnisse</strong>
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
              <h2 className="section-title">Koalitionsverhandlungen</h2>
              {selected.negotiationRounds.map((round, roundIdx) => (
                <Card key={roundIdx} className="mb-3">
                  <CardContent className="p-5">
                    <h3 className="text-base font-semibold mb-3 text-primary">Runde {roundIdx + 1}</h3>
                    {round.map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = fixColor(party?.color || "#999");
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
                          <div className="text-xs text-muted-foreground mt-0.5">Zugeständnis: {r.concession}</div>
                          <div className="text-xs text-muted-foreground/70 mt-0.5">
                            Akzeptable Partner: {r.acceptablePartners.map(id => parties.find(p => p.id === id)?.name || id).join(", ")}
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
                <Badge className={cn(PHASE_BADGE[selected.status] || "", "text-sm px-2.5 py-1")}>
                  {selected.status.toUpperCase()}
                </Badge>
                <span className="font-semibold text-lg">{selected.triggerReason}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                <div>Angekündigt am Tag {selected.announcedOnDay}</div>
                <div>Wahlkampf ab Tag {selected.campaignStartDay}</div>
                <div>Wahltag {selected.electionDay}</div>
                {simStatus && selected.status !== "negotiation" && selected.electionDay > simStatus.currentDay && (
                  <div className="mt-2 font-bold text-lg text-foreground">
                    {selected.electionDay - simStatus.currentDay} Tage bis zur Wahl
                  </div>
                )}
                {selected.status === "negotiation" && (
                  <div className="mt-2">
                    <div className="font-bold text-lg text-primary">Koalitionsverhandlungen laufen</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Runde {(selected.negotiationRounds?.length || 0)} von 3 abgeschlossen
                    </div>
                    {selected.results && (
                      <div className="mt-3">
                        <Hemicycle seats={resultsToSeats(selected.results, parties)} size="sm" />
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
