import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, type Election, type ElectionResult, type NationalState, type Party, type SimulationStatus, type Fraktion } from "../api";
import { usePolling } from "../usePolling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, fixColor } from "@/lib/utils";
import { ROLE_BADGE, PHASE_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { TERM_DURATION, PRESET_LABEL, formatTimeToElection } from "@/lib/timing";
import { Hemicycle } from "@/components/Hemicycle";
import { BundesadlerIcon } from "@/components/elections/BundesadlerIcon";
import { VoteBarChart } from "@/components/elections/VoteBarChart";
import { CoalitionChips } from "@/components/elections/CoalitionChips";
import { CoalitionCalculator } from "@/components/elections/CoalitionCalculator";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

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

function InitialAvatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const bg = fixColor(color);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

export function Elections() {
  usePageMeta(ROUTE_SEO["/elections"] ?? { title: "Wahlen" });
  const { t } = useTranslation("elections");
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
            Anfangssitzverteilung — es wurde noch keine Wahl simuliert. Warten Sie auf die geplante Wahl (4 Sim-Jahre ≈ {TERM_DURATION[simStatus?.timingPreset ?? "normal"]} Echtzeit im {PRESET_LABEL[simStatus?.timingPreset ?? "normal"]}-Modus).
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
            <div className="flex flex-col items-center">
              <Hemicycle seats={partiesToSeats(parties)} coalitionIds={coalitionIds} size="md" />
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
    return <div><h1>{t("bundestagwahl")}</h1><p className="text-center py-8 text-muted-foreground">Laden…</p></div>;
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
                <Hemicycle seats={resultsToSeats(selected.results, parties)} coalitionIds={state?.coalitionParties} size="md" />
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
                                {selected.newCoalition?.[0] === r.partyId ? t("regierungBadge") : t("koalitionBadge")}
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
                <table className="w-full border-collapse text-sm min-w-[400px]">
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
                              <InitialAvatar name={leaderName} color={party.color} size={32} />
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
                        <Hemicycle seats={resultsToSeats(selected.results, parties)} coalitionIds={state?.coalitionParties} size="sm" />
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
