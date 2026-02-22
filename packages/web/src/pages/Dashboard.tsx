import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Bill, type Crisis, type Election, type Government, type MediaArticle, type NationalState, type Party, type Poll, type SimulationEvent, type SimulationStatus, type BundestagSeat, type MdbApplication } from "../api";
import { usePolling } from "../usePolling";
import { Button, SkeletonCard, SkeletonTitle } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MOOD_BADGE, SEVERITY_BADGE, ALERT_STYLES, SEMANTIC_HEX, VOTE_COLORS, PHASE_BADGE, DISCIPLINE_BADGE, DISCIPLINE_LABEL } from "@/lib/colors";

const OUTLET_STYLE: Record<string, { color: string; label: string }> = {
  "Berliner Tagesspiegel": { color: "#1d4ed8", label: "Tagesspiegel" },
  "Volksstimme": { color: "#dc2626", label: "Volksstimme" },
  "Wirtschaftswoche": { color: "#334155", label: "WiWo" },
};

function fixColor(c: string) { return c === "#FFED00" ? "#c4a900" : c; }

export function Dashboard() {
  const { user } = useUser();
  const [state, setState] = useState<NationalState | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [election, setElection] = useState<Election | null>(null);
  const [government, setGovernment] = useState<Government | null>(null);
  const [media, setMedia] = useState<MediaArticle[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [mySeat, setMySeat] = useState<BundestagSeat | null>(null);
  const [myApplications, setMyApplications] = useState<MdbApplication[]>([]);

  const refreshCore = useCallback(() => {
    api.getState().then(setState).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getEvents(3).then(r => setEvents(r.events)).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
    api.getPolls(true).then(setPolls).catch(console.error);
    api.getMySeat().then(r => { setMySeat(r.seat); setMyApplications(r.applications); }).catch(() => {});
  }, []);

  const refreshSlow = useCallback(() => {
    api.getCrises(true).then(setCrises).catch(console.error);
    api.getActiveElection().then(setElection).catch(console.error);
    api.getGovernment().then(setGovernment).catch(console.error);
    api.getMedia().then(setMedia).catch(console.error);
    api.getBills().then(setBills).catch(console.error);
  }, []);

  useEffect(() => { refreshCore(); refreshSlow(); }, [refreshCore, refreshSlow]);
  usePolling(refreshCore);
  usePolling(refreshSlow, 60000);

  if (!state || !simStatus) {
    return (
      <div>
        <SkeletonTitle />
        <div className="grid grid-cols-2 gap-4 mb-8">
          <SkeletonCard /><SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
  const sentimentColor = state.publicSentiment > 60 ? SEMANTIC_HEX.positive : state.publicSentiment > 40 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative;
  const MAJORITY = 368;
  const coalitionPartyList = parties.filter(p => state.coalitionParties.includes(p.id) && p.seatCount > 0);
  const oppositionPartyList = parties.filter(p => state.oppositionParties.includes(p.id) && p.seatCount > 0);
  const coalitionSeats = coalitionPartyList.reduce((s, p) => s + p.seatCount, 0);
  const oppositionSeats = oppositionPartyList.reduce((s, p) => s + p.seatCount, 0);
  const hasMajority = coalitionSeats >= MAJORITY;
  const majorityPct = totalSeats > 0 ? (MAJORITY / totalSeats) * 100 : 50;

  const recentBills = bills.filter(b =>
    b.votes.length > 0 && b.proposedOnDay >= simStatus.currentDay - 30
  );
  const decisionOfMonth = recentBills.length > 0
    ? recentBills.reduce((best, b) => {
        const total = b.votes.reduce((s, v) => s + (parties.find(pp => pp.id === v.partyId)?.seatCount ?? 0), 0);
        const bestTotal = best.votes.reduce((s, v) => s + (parties.find(pp => pp.id === v.partyId)?.seatCount ?? 0), 0);
        return total > bestTotal ? b : best;
      })
    : null;

  const politicianOfMonth = parties
    .filter(p => p.seatCount > 0 && p.recentApprovals && p.recentApprovals.length >= 2)
    .map(p => ({
      party: p,
      delta: p.recentApprovals[p.recentApprovals.length - 1] - p.recentApprovals[0],
    }))
    .sort((a, b) => b.delta - a.delta)[0] ?? null;

  const latestMedia = [...media].sort((a, b) => b.dayNumber - a.dayNumber).slice(0, 2);

  let narrative = simStatus.dailySummary ?? "";
  let mood: string | null = null;
  if (simStatus.dailySummary) {
    try {
      const parsed = JSON.parse(simStatus.dailySummary) as { narrative?: string; mood?: string };
      if (typeof parsed.narrative === "string") narrative = parsed.narrative;
      if (typeof parsed.mood === "string") mood = parsed.mood;
    } catch { /* old plain-text */ }
  }
  const moodBadgeCls = mood ? (MOOD_BADGE[mood] ?? null) : null;

  return (
    <div>
      <h1>Dashboard — Day {simStatus.currentDay}</h1>

      {/* Hero summary */}
      {narrative && (
        <Card className="bg-muted/50 mb-6 py-4">
          <CardContent className="px-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Today in the Bundestag
              {mood && moodBadgeCls && (
                <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", moodBadgeCls)}>{mood}</span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{narrative}</p>
          </CardContent>
        </Card>
      )}

      {/* Watch-only mode banner */}
      {simStatus.timingPreset && (simStatus.timingPreset === "ultra-fast" || simStatus.timingPreset === "fast") && (
        <div className={cn(ALERT_STYLES.info, "font-medium mb-4")}>
          <strong>Watch-Only Mode</strong> — Simulation running in {simStatus.timingPreset === "ultra-fast" ? "Ultra-Fast" : "Fast"} mode. Switch to Normal or Slow to interact.
        </div>
      )}

      {/* Provisional budget banner */}
      {state.provisionalBudget && (
        <div className={cn(ALERT_STYLES.warning, "font-medium mb-4")}>
          <strong>Provisional Budget Active</strong> — operating under Art. 111 GG.
          {simStatus.budgetRetryDay != null && (
            <span className="ml-1.5">Revised vote on Day {simStatus.budgetRetryDay}.</span>
          )}
        </div>
      )}

      {/* === 2-column grid === */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

        {/* ── Main column ── */}
        <div className="min-w-0">

          {/* Bundestag composition */}
          <div className="mb-8">
            <div className="flex justify-between items-baseline mb-3">
              <h2 className="!mb-0">Bundestag</h2>
              <span className="text-xs text-muted-foreground">{totalSeats} seats · majority {MAJORITY}</span>
            </div>

            {/* Seat bar */}
            <div className="relative mb-1">
              <div className="absolute top-0 bottom-0 w-0.5 bg-foreground z-[2]" style={{ left: `${majorityPct}%` }} />
              <div className="flex h-7 rounded overflow-hidden gap-0.5">
                <div className="flex" style={{ flex: `0 0 ${(coalitionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {coalitionPartyList.map(p => (
                    <div key={p.id} className="flex items-center justify-center text-xs text-white font-semibold overflow-hidden whitespace-nowrap" style={{ flex: p.seatCount, backgroundColor: fixColor(p.color) }}>
                      {p.seatCount > 50 ? `${p.name} ${p.seatCount}` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
                <div className="flex-none w-0.5 bg-white" />
                <div className="flex" style={{ flex: `0 0 ${(oppositionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {oppositionPartyList.map(p => (
                    <div key={p.id} className="flex items-center justify-center text-xs text-foreground font-semibold overflow-hidden whitespace-nowrap" style={{ flex: p.seatCount, backgroundColor: `${fixColor(p.color)}99` }}>
                      {p.seatCount > 50 ? `${p.name} ${p.seatCount}` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="relative h-3.5 mb-2">
              <div className="absolute text-xs text-muted-foreground whitespace-nowrap -translate-x-1/2" style={{ left: `${majorityPct}%` }}>
                ▲ {MAJORITY}
              </div>
            </div>

            {/* Coalition / Opposition chips */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-emerald-600 mb-1">
                  Coalition
                  <span className={cn("ml-1 font-bold text-xs", hasMajority ? "text-emerald-600" : "text-destructive")}>
                    {coalitionSeats} {hasMajority ? "✓" : "✗"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-[3px]">
                  {coalitionPartyList.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border" style={{ borderColor: fixColor(p.color), background: `${fixColor(p.color)}18` }}>
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: fixColor(p.color) }} />
                      {p.name} <span className="text-xs opacity-60">{p.seatCount}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground mb-1">
                  Opposition <span className="ml-1 font-semibold text-xs text-muted-foreground">{oppositionSeats}</span>
                </div>
                <div className="flex flex-wrap gap-[3px]">
                  {oppositionPartyList.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border border-border bg-muted/50 text-foreground">
                      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: fixColor(p.color) }} />
                      {p.name} <span className="text-xs opacity-60">{p.seatCount}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {state.coalitionCohesion != null && (
              <div className="mt-2.5 pt-2 border-t border-border text-sm flex items-center gap-2">
                <span className="text-muted-foreground">Cohesion:</span>
                <div className="flex-1 bg-muted rounded h-[5px] max-w-[100px]">
                  <div className="h-full rounded" style={{
                    width: `${state.coalitionCohesion}%`,
                    background: state.coalitionCohesion >= 90 ? SEMANTIC_HEX.positive : state.coalitionCohesion >= 70 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative,
                  }} />
                </div>
                <span className="font-semibold" style={{ color: state.coalitionCohesion >= 90 ? SEMANTIC_HEX.positive : state.coalitionCohesion >= 70 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative }}>
                  {state.coalitionCohesion}%
                </span>
              </div>
            )}
          </div>

          {/* Economy */}
          <div className="mb-8">
            <h2>Economy</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { v: `${state.economy.gdpGrowth}%`, l: "GDP Growth", c: state.economy.gdpGrowth >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative },
                { v: `${state.economy.unemployment}%`, l: "Unemployment", c: state.economy.unemployment > 8 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral },
                { v: `${state.economy.inflation}%`, l: "Inflation", c: state.economy.inflation > 3 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral },
                { v: `${state.economy.budget}B`, l: "Budget (EUR)", c: SEMANTIC_HEX.neutral },
              ].map(s => (
                <Card key={s.l} className="py-4">
                  <CardContent className="px-4">
                    <div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div>
                    <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground mt-1">{s.l}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Latest Events */}
          <div className="mb-8">
            <div className="flex justify-between items-baseline">
              <h2 className="!mb-0">Latest Events</h2>
              <Link to="/news" className="text-xs text-primary">View all →</Link>
            </div>
            <Card className="mt-2 py-0">
              <CardContent className="px-4 py-0 divide-y divide-border">
                {events.length === 0 ? (
                  <div className="py-4 text-sm text-muted-foreground">No events yet.</div>
                ) : events.map(ev => (
                  <div key={ev.id} className="py-3">
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">#{ev.dayNumber} · {ev.type.replace(/_/g, " ")}</div>
                    <div className="font-semibold mt-0.5">{ev.title}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{ev.description}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Media Highlights */}
          {latestMedia.length > 0 && (
            <div className="mb-8">
              <div className="flex justify-between items-baseline">
                <h2 className="!mb-0">Media Highlights</h2>
                <Link to="/media" className="text-xs text-primary">All articles →</Link>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                {latestMedia.map(a => {
                  const outlet = OUTLET_STYLE[a.outlet] ?? { color: "#555", label: a.outlet };
                  return (
                    <Card key={a.id} className="py-3">
                      <CardContent className="px-4">
                        <div className="flex justify-between items-center mb-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: outlet.color }}>
                            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: outlet.color }} />
                            {outlet.label}
                          </span>
                          <span className="text-xs text-muted-foreground">Day {a.dayNumber}</span>
                        </div>
                        <div className="font-semibold text-sm leading-snug">{a.headline}</div>
                        <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
                          {a.summary.length > 140 ? a.summary.slice(0, 140) + "..." : a.summary}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-3">

          {/* Chancellor card */}
          {government && (() => {
            const cp = parties.find(p => p.id === government.chancellorPartyId);
            return (
              <Card className="py-4">
                <CardContent className="px-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: fixColor(cp?.color || "#333") }} />
                    Bundeskanzler/in
                  </div>
                  <div className="font-bold text-base">{government.chancellorName}</div>
                  <div className="text-sm text-muted-foreground">
                    {cp?.name ?? government.chancellorPartyId}
                    <span className="text-xs text-muted-foreground ml-1.5">since Day {government.formedOnDay}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Engagement CTAs */}
          <div className="flex flex-col gap-1.5">
            {!user ? (
              <Link to="/login" className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-bold text-sm text-primary">Anmelden</span>
                <span className="block text-xs text-muted-foreground">Log in to participate</span>
              </Link>
            ) : user.partyId ? (
              <Link to={`/parties/${user.partyId}`} className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-bold text-sm text-primary">Your Party</span>
                <span className="block text-xs text-muted-foreground">{parties.find(p => p.id === user.partyId)?.name ?? user.partyId}</span>
              </Link>
            ) : (
              <Link to="/parties" className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-bold text-sm text-primary">Join a Party</span>
                <span className="block text-xs text-muted-foreground">Pick a party to participate</span>
              </Link>
            )}
            {polls.length > 0 && (
              <Link to="/polls" className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-bold text-sm text-primary">Vote on Polls</span>
                <span className="block text-xs text-muted-foreground">{polls.length} active poll{polls.length !== 1 ? "s" : ""}</span>
              </Link>
            )}
            <Link to="/referendums" className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
              <span className="block font-bold text-sm text-primary">Referendums</span>
              <span className="block text-xs text-muted-foreground">Vote on national questions</span>
            </Link>
          </div>

          {/* MdB Seat card */}
          {mySeat && (() => {
            const seatParty = parties.find(p => p.id === mySeat.partyId);
            const seatColor = fixColor(seatParty?.color || "#333");
            const thirdReadingBills = bills.filter(b => b.status === "third_reading");
            return (
              <Card className="py-4" style={{ borderLeft: `3px solid ${seatColor}` }}>
                <CardContent className="px-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide mb-1">
                    <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: seatColor }} />
                    Your MdB Seat
                  </div>
                  <div className="font-bold text-base">Seat #{mySeat.seatNumber}</div>
                  <div className="text-sm text-muted-foreground">{seatParty?.name ?? mySeat.partyId}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs">Discipline:</span>
                    <Badge variant="outline" className={cn("text-xs", DISCIPLINE_BADGE[mySeat.disciplineLevel] ?? DISCIPLINE_BADGE[0])}>
                      {DISCIPLINE_LABEL[mySeat.disciplineLevel] ?? "?"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Proxy: {mySeat.proxyDefault === "party_line" ? "Party Line" : "Abstain"}
                  </div>
                  {thirdReadingBills.length > 0 && (
                    <Link to="/bills?status=third_reading" className="text-xs text-primary mt-2 inline-block no-underline hover:underline">
                      {thirdReadingBills.length} bill{thirdReadingBills.length !== 1 ? "s" : ""} awaiting your vote →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {!mySeat && user?.partyId && myApplications.length === 0 && (
            <Link to={`/parties/${user.partyId}`} className="block px-3 py-2 rounded border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
              <span className="block font-bold text-sm text-primary">Apply for a Seat</span>
              <span className="block text-xs text-muted-foreground">Become an MdB and vote directly</span>
            </Link>
          )}
          {!mySeat && myApplications.some(a => a.status === "pending") && (
            <div className="px-3 py-2 rounded border border-amber-200 bg-amber-50 text-sm text-amber-800">
              Seat application pending...
            </div>
          )}

          {/* Public Sentiment */}
          <Card className="py-4">
            <CardContent className="px-4">
              <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground mb-1.5">Public Sentiment</div>
              <div className="flex items-center gap-2">
                <div className="font-bold text-lg" style={{ color: sentimentColor }}>{state.publicSentiment}</div>
                <div className="flex-1 bg-muted rounded h-1.5">
                  <div className="h-full rounded" style={{ width: `${state.publicSentiment}%`, backgroundColor: sentimentColor }} />
                </div>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </CardContent>
          </Card>

          {/* Active Crises */}
          {crises.length > 0 && (
            <Card className="py-4">
              <CardContent className="px-4">
                <div className="text-xs font-bold uppercase tracking-[0.05em] text-destructive mb-1.5">Active Crises</div>
                {crises.map(c => (
                  <div key={c.id} className="mb-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm">{c.name}</span>
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        c.severity === "high" && "border-destructive text-destructive",
                        SEVERITY_BADGE[c.severity],
                      )}>{c.severity}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{c.category} · Day {c.startDay}–{c.endDay}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Active Election */}
          {election && (
            <Card className="py-4">
              <CardContent className="px-4">
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600 mb-1">Election</div>
                <div className="flex justify-between items-center mb-1">
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    PHASE_BADGE[election.status],
                  )}>{election.status}</Badge>
                  <span className="text-sm">Day {election.electionDay}</span>
                </div>
                <div className="text-sm text-muted-foreground">{election.triggerReason}</div>
                {election.electionDay - simStatus.currentDay > 0 && (
                  <div className="mt-1 font-semibold text-sm">{election.electionDay - simStatus.currentDay} days until vote</div>
                )}
                <Link to="/elections" className="text-xs text-primary mt-1 inline-block">Details →</Link>
              </CardContent>
            </Card>
          )}

          {/* Ask a Party widget */}
          {parties.length > 0 && (
            <AskPartyWidget parties={parties} coalitionParties={state.coalitionParties} />
          )}
        </div>
      </div>

      {/* === Featured section (full width) === */}
      {(decisionOfMonth || politicianOfMonth) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          {decisionOfMonth && (() => {
            const proposer = parties.find(p => p.id === decisionOfMonth.proposedBy);
            const yesSeats = decisionOfMonth.votes.filter(v => v.vote === "yes").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const noSeats = decisionOfMonth.votes.filter(v => v.vote === "no").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const total = yesSeats + noSeats;
            return (
              <Card className="py-4">
                <CardContent className="px-4">
                  <Badge variant="secondary" className="text-xs mb-2">Decision of the Month</Badge>
                  <Link to={`/bills/${decisionOfMonth.id}`} className="font-bold text-base text-foreground no-underline hover:underline">
                    {decisionOfMonth.title}
                  </Link>
                  <div className="text-sm text-muted-foreground mt-1">
                    {decisionOfMonth.category} · by {proposer?.name ?? decisionOfMonth.proposedBy}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={decisionOfMonth.status === "passed" ? "default" : "destructive"} className={cn(
                      decisionOfMonth.status === "passed" && "bg-emerald-600",
                    )}>{decisionOfMonth.status}</Badge>
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground">Yes {yesSeats} · No {noSeats}</span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="flex h-1.5 rounded overflow-hidden mt-1.5">
                      <div className={VOTE_COLORS.yes} style={{ width: `${(yesSeats / total) * 100}%` }} />
                      <div className={VOTE_COLORS.no} style={{ width: `${(noSeats / total) * 100}%` }} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {politicianOfMonth && (
            <Card className="py-4">
              <CardContent className="px-4">
                <Badge variant="secondary" className="text-xs mb-2">Party of the Month</Badge>
                <Link to={`/parties/${politicianOfMonth.party.id}`} className="flex items-center gap-2 no-underline text-foreground">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: fixColor(politicianOfMonth.party.color) }} />
                  <span className="font-bold text-base">{politicianOfMonth.party.name}</span>
                </Link>
                <div className="text-sm text-muted-foreground mt-1">
                  Current approval: {politicianOfMonth.party.approvalRating.toFixed(1)}%
                </div>
                <div className="mt-1.5 font-bold text-lg" style={{ color: politicianOfMonth.delta > 0 ? SEMANTIC_HEX.positive : politicianOfMonth.delta < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral }}>
                  {politicianOfMonth.delta > 0 ? "+" : ""}{politicianOfMonth.delta.toFixed(1)}
                  <span className="font-normal text-xs text-muted-foreground ml-1">approval change (recent)</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Ask a Party widget ── */
function AskPartyWidget({ parties, coalitionParties }: { parties: Party[]; coalitionParties: string[] }) {
  const seatedParties = parties.filter(p => p.seatCount > 0);
  const defaultPartyId = coalitionParties[0] || (seatedParties[0]?.id ?? "");
  const [selectedPartyId, setSelectedPartyId] = useState(defaultPartyId);
  const [questionText, setQuestionText] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async () => {
    if (questionText.length < 5 || questionText.length > 140) return;
    setSubmitStatus("submitting");
    try {
      await api.submitQuestion(questionText, selectedPartyId);
      setSubmitStatus("success");
      setQuestionText("");
      setTimeout(() => setSubmitStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus("idle"), 4000);
    }
  };

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-sm">Ask a Party</span>
          <Link to="/questions" className="text-xs text-primary">Questions →</Link>
        </div>
        <select
          value={selectedPartyId}
          onChange={e => setSelectedPartyId(e.target.value)}
          className="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] mb-1.5"
          aria-label="Select party"
        >
          {seatedParties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="5–140 chars"
            value={questionText}
            onChange={e => setQuestionText(e.target.value)}
            maxLength={140}
            className="border-input h-9 flex-1 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <Button
            onClick={handleSubmit}
            disabled={submitStatus === "submitting" || questionText.length < 5}
            loading={submitStatus === "submitting"}
            size="sm"
            variant="primary"
          >
            Ask
          </Button>
        </div>
        {submitStatus === "success" && (
          <div className="mt-1.5 px-2.5 py-1.5 rounded bg-emerald-50 text-emerald-700 text-sm">Submitted! Check Questions page.</div>
        )}
        {submitStatus === "error" && (
          <div className="mt-1.5 px-2.5 py-1.5 rounded bg-red-50 text-red-700 text-sm">{errorMsg}</div>
        )}
      </CardContent>
    </Card>
  );
}
