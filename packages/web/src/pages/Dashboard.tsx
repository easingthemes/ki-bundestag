import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type Bill, type CalendarData, type Crisis, type Election, type Government, type MediaArticle, type NationalState, type Party, type Poll, type SimulationEvent, type SimulationStatus, type BundestagSeat, type MdbApplication, type UpcomingCalendarData } from "../api";
import { MDB_BADGE } from "@/lib/colors";
import { CalendarWidget } from "../components/CalendarWidget";
import { UpcomingCalendar } from "../components/UpcomingCalendar";
import { Hemicycle } from "../components/Hemicycle";
import { usePolling } from "../usePolling";
import { SkeletonCard, SkeletonTitle } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, fixColor } from "@/lib/utils";
import { MOOD_BADGE, SEVERITY_BADGE, ALERT_STYLES, SEMANTIC_HEX, PHASE_BADGE, DISCIPLINE_BADGE, DISCIPLINE_LABEL, EVENT_TYPE_LABEL } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";
import { OnboardingOverlay } from "@/components/dashboard/OnboardingOverlay";
import { QuickActionsBar } from "@/components/dashboard/QuickActionsBar";
import { MyImpactCard } from "@/components/dashboard/MyImpactCard";
import { CatchupCard } from "@/components/dashboard/CatchupCard";
import { LiveEventTicker } from "@/components/dashboard/LiveEventTicker";
import { AskPartyWidget } from "@/components/dashboard/AskPartyWidget";
import { SimStatusPill } from "@/components/dashboard/SimStatusPill";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const OUTLET_STYLE: Record<string, { color: string; label: string }> = {
  "Berliner Tagesspiegel": { color: "#1d4ed8", label: "Tagesspiegel" },
  "Volksstimme": { color: "#dc2626", label: "Volksstimme" },
  "Wirtschaftswoche": { color: "#334155", label: "WiWo" },
};

export function Dashboard() {
  usePageMeta(ROUTE_SEO["/"] ?? { title: "Dashboard" });
  const { t } = useTranslation("dashboard");
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
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  const [upcomingCalendar, setUpcomingCalendar] = useState<UpcomingCalendarData | null>(null);
  const [calendarView, setCalendarView] = useState<"upcoming" | "past">("upcoming");
  const [showWelcome, setShowWelcome] = useState(false);
  const [debateEvents, setDebateEvents] = useState<SimulationEvent[]>([]);

  const refreshCore = useCallback(() => {
    api.getState().then(setState).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getEvents(5).then(r => setEvents(r.events)).catch(console.error);
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
    api.getEvents(10, 0, "mdb_speech").then(r => setDebateEvents(r.events)).catch(console.error);
  }, []);

  useEffect(() => { refreshCore(); refreshSlow(); }, [refreshCore, refreshSlow]);
  usePolling(refreshCore);
  usePolling(refreshSlow, 60000);

  useEffect(() => {
    api.getCalendar(calendarMonth).then(setCalendar).catch(console.error);
  }, [calendarMonth]);

  useEffect(() => {
    api.getUpcomingCalendar().then(setUpcomingCalendar).catch(console.error);
  }, []);

  if (!state || !simStatus) {
    return (
      <div>
        <SkeletonTitle />
        <div className="grid grid-cols-2 gap-4 mb-8"><SkeletonCard /><SkeletonCard /></div>
        <SkeletonCard />
      </div>
    );
  }

  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
  const sentimentColor = state.publicSentiment > 60 ? SEMANTIC_HEX.positive : state.publicSentiment > 40 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative;
  const coalitionPartyList = parties.filter(p => state.coalitionParties.includes(p.id) && p.seatCount > 0);
  const oppositionPartyList = parties.filter(p => state.oppositionParties.includes(p.id) && p.seatCount > 0);
  const coalitionSeats = coalitionPartyList.reduce((s, p) => s + p.seatCount, 0);

  const GERMAN_MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const simStartMs = simStatus?.startDate ? new Date(simStatus.startDate).getTime() : null;
  const simDate = simStartMs ? new Date(simStartMs + simStatus.currentDay * 86400000) : null;
  const simMonthLabel = simDate ? GERMAN_MONTH_NAMES[simDate.getMonth()] : null;
  const simFullDateLabel = simDate ? `${simDate.getDate()}. ${GERMAN_MONTH_NAMES[simDate.getMonth()]} ${simDate.getFullYear()}` : null;

  // Compute first sim day of the current sim calendar month
  const monthStartDay = (() => {
    if (!simStartMs) return simStatus.currentDay - 30; // fallback to rolling 30d
    const currentSimDate = new Date(simStartMs + simStatus.currentDay * 86400000);
    const firstOfMonth = new Date(currentSimDate.getFullYear(), currentSimDate.getMonth(), 1);
    return Math.max(0, Math.floor((firstOfMonth.getTime() - simStartMs) / 86400000));
  })();

  const recentBills = bills.filter(b => b.votes.length > 0 && b.proposedOnDay >= monthStartDay);
  const decisionOfMonth = recentBills.length > 0
    ? recentBills.reduce((best, b) => {
        const total = b.votes.reduce((s, v) => s + (parties.find(pp => pp.id === v.partyId)?.seatCount ?? 0), 0);
        const bestTotal = best.votes.reduce((s, v) => s + (parties.find(pp => pp.id === v.partyId)?.seatCount ?? 0), 0);
        return total > bestTotal ? b : best;
      })
    : null;

  const politicianOfMonth = parties
    .filter(p => p.seatCount > 0 && p.recentApprovals && p.recentApprovals.length >= 2)
    .map(p => {
      const monthApprovals = p.recentApprovals.filter(a => a.day >= monthStartDay);
      if (monthApprovals.length < 2) return null;
      return { party: p, delta: monthApprovals[monthApprovals.length - 1].approval - monthApprovals[0].approval };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
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

  // Parties sorted by approval for sidebar ranking
  const partiesByApproval = [...parties].filter(p => p.seatCount > 0).sort((a, b) => b.approvalRating - a.approvalRating);
  const maxApproval = partiesByApproval[0]?.approvalRating ?? 50;

  // Parliament day = days since current government formed (day 1 = formation day)
  const parliamentDay = government ? simStatus.currentDay - government.formedOnDay + 1 : simStatus.currentDay;

  // Hemicycle seat data
  const hemicycleSeats = parties
    .filter(p => p.seatCount > 0)
    .map(p => ({ partyId: p.id, count: p.seatCount, color: p.color, name: p.name }));

  return (
    <div>
      <OnboardingOverlay parties={parties} externalOpen={showWelcome} onClose={() => setShowWelcome(false)} />

      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-1 gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="!mb-0">{simFullDateLabel ?? t("parlamentstag", { day: parliamentDay })}</h1>
            <p className="text-sm text-muted-foreground">{t("parlamentstag", { day: parliamentDay })}</p>
          </div>
          <SimStatusPill status={simStatus} />
        </div>
        {mood && moodBadgeCls && (
          <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", moodBadgeCls)}>{mood}</span>
        )}
      </div>

      {/* Hero narrative — current day summary or previous day's if current not ready yet */}
      {narrative && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-2 max-w-3xl">{narrative}</p>
      )}

      {/* Day preview (start-of-day) — shows pending bills, crises, etc. */}
      {simStatus.dayPreview && (
        <p className="text-xs text-muted-foreground/70 mb-2 max-w-3xl italic">{simStatus.dayPreview}</p>
      )}

      {/* Previous day summary — useful in fast/ultra-fast mode where days flip quickly */}
      {simStatus.previousDaySummary && !narrative && (
        <div className="bg-muted/50 rounded-lg p-3 mb-4 max-w-3xl">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
            Tag {simStatus.previousDaySummary.dayNumber}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{simStatus.previousDaySummary.narrative}</p>
        </div>
      )}

      {/* Banners */}
      {simStatus.timingPreset && (simStatus.timingPreset === "ultra-fast" || simStatus.timingPreset === "fast") && (
        <div className={cn(ALERT_STYLES.info, "font-medium mb-4 text-sm")}>
          <strong>Nur-Zuschauen-Modus</strong> — Simulation läuft im {simStatus.timingPreset === "ultra-fast" ? "Ultraschnell" : "Schnell"}-Modus.
        </div>
      )}
      {state.provisionalBudget && (
        <div className={cn(ALERT_STYLES.warning, "font-medium mb-4 text-sm")}>
          <strong>Vorläufige Haushaltsführung aktiv</strong> — Art. 111 GG.
          {simStatus.budgetRetryDay != null && <span className="ml-1">Neue Abstimmung Tag {simStatus.budgetRetryDay}.</span>}
        </div>
      )}

      <QuickActionsBar user={user} mySeat={mySeat} bills={bills} polls={polls} />
      <CatchupCard />

      {/* ═══ 2-COLUMN GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ── MAIN COLUMN ── */}
        <div className="min-w-0 space-y-6">

          {/* Bundestag Composition — Hemicycle + coalition info */}
          <section>
            <div className="section-title">{t("bundestag")}</div>
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-col gap-5 items-center">
                  {/* Hemicycle */}
                  <div className="w-full flex justify-center">
                    <Hemicycle seats={hemicycleSeats} coalitionIds={state.coalitionParties} totalSeats={totalSeats} size="md" showLegend={false} />
                  </div>
                  {/* Coalition / Opposition info */}
                  <div className="grid grid-cols-2 gap-x-12 w-full max-w-4xl px-4">
                    <div className="flex flex-col gap-2 items-center">
                      <div className="text-[13px] font-bold uppercase tracking-wide text-emerald-600">
                        {t("koalition")}
                        <span className={cn("ml-1.5", coalitionSeats >= 368 ? "text-emerald-600" : "text-destructive")}>
                          {coalitionSeats} Sitze {coalitionSeats >= 368 ? "✓" : "✗"}
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {coalitionPartyList.map(p => (
                          <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium" style={{ background: `${fixColor(p.color)}15`, color: fixColor(p.color) }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: fixColor(p.color) }} />
                            {p.name} {p.seatCount}
                          </span>
                        ))}
                      </div>
                      {state.coalitionCohesion != null && (
                        <div className="pt-2 border-t border-border mt-1 w-full max-w-[200px]">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{t("kohesion")}</span>
                            <span className="font-bold" style={{ color: state.coalitionCohesion >= 90 ? SEMANTIC_HEX.positive : state.coalitionCohesion >= 70 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative }}>
                              {state.coalitionCohesion}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded bg-muted overflow-hidden">
                            <div className="h-full rounded" style={{
                              width: `${state.coalitionCohesion}%`,
                              background: state.coalitionCohesion >= 90 ? SEMANTIC_HEX.positive : state.coalitionCohesion >= 70 ? SEMANTIC_HEX.warning : SEMANTIC_HEX.negative,
                            }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 items-center">
                      <div className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("opposition")}
                        <span className="ml-1.5 text-muted-foreground">
                          {oppositionPartyList.reduce((s, p) => s + p.seatCount, 0)} Sitze
                        </span>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2">
                        {oppositionPartyList.map(p => (
                          <span key={p.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium" style={{ background: `${fixColor(p.color)}15`, color: fixColor(p.color) }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: fixColor(p.color) }} />
                            {p.name} {p.seatCount}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Economy Stats */}
          <section>
            <div className="section-title">{t("wirtschaft")}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { v: state.economy.gdpGrowth, l: "BIP-Wachstum", fmt: (n: number) => `${n >= 0 ? "+" : ""}${n}%`, c: state.economy.gdpGrowth >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative },
                { v: state.economy.unemployment, l: "Arbeitslosigkeit", fmt: (n: number) => `${n}%`, c: state.economy.unemployment > 8 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral },
                { v: state.economy.inflation, l: "Inflation", fmt: (n: number) => `${n}%`, c: state.economy.inflation > 3 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral },
                { v: state.economy.budget, l: "Haushalt (Mrd.)", fmt: (n: number) => `${n}`, c: SEMANTIC_HEX.neutral },
              ].map(s => (
                <Card key={s.l}>
                  <CardContent className="p-4">
                    <div className="stat-value" style={{ color: s.c }}>{s.fmt(s.v)}</div>
                    <div className="stat-label">{s.l}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Latest Events */}
          <section>
            <div className="flex justify-between items-baseline mb-3">
              <div className="section-title !mb-0 !pb-0 !border-b-0">{t("aktuelleEreignisse")}</div>
              <Link to="/news" className="text-xs font-medium text-primary hover:underline">{t("alleEreignisse")}</Link>
            </div>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4">{t("keineEreignisse")}</div>
              ) : events.map(ev => (
                <Card key={ev.id}>
                  <CardContent className="p-3.5">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm leading-snug">{ev.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-medium text-muted-foreground">Tag {ev.dayNumber}</div>
                        <div className="text-[10px] text-muted-foreground/60">{EVENT_TYPE_LABEL[ev.type] ?? ev.type.replace(/_/g, " ")}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Top Debates */}
          {debateEvents.length > 0 && (
            <section>
              <div className="flex justify-between items-baseline mb-3">
                <div className="section-title !mb-0 !pb-0 !border-b-0">{t("debatten")}</div>
                <Link to="/debatten" className="text-xs font-medium text-primary hover:underline">{t("alleDebatten")}</Link>
              </div>
              <div className="space-y-2">
                {debateEvents.slice(0, 5).map(ev => {
                  const displayName = ev.title.match(/^MdB (.+?) spricht/)?.[1] ?? "MdB";
                  const billTitle = ev.title.replace(/^MdB .+ spricht zu "/, "").replace(/" \(\d\. Lesung\)$/, "");
                  const billId = ev.data?.billId as string | undefined;
                  return (
                    <Card key={ev.id}>
                      <CardContent className="p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <Badge variant="outline" className={cn("text-[10px]", MDB_BADGE)}>MdB</Badge>
                              <span className="font-semibold text-xs">{displayName}</span>
                            </div>
                            <div className="text-xs text-muted-foreground line-clamp-2">{ev.description}</div>
                            {billId && (
                              <Link to={`/bills/${billId}`} className="text-[11px] text-primary no-underline hover:underline mt-1 inline-block">
                                {billTitle}
                              </Link>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-[10px] font-medium text-muted-foreground">Tag {ev.dayNumber}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Media Highlights */}
          {latestMedia.length > 0 && (
            <section>
              <div className="flex justify-between items-baseline mb-3">
                <div className="section-title !mb-0 !pb-0 !border-b-0">{t("presse")}</div>
                <Link to="/media" className="text-xs font-medium text-primary hover:underline">{t("alleArtikel")}</Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {latestMedia.map(a => {
                  const outlet = OUTLET_STYLE[a.outlet] ?? { color: "#555", label: a.outlet };
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: outlet.color }} />
                          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: outlet.color }}>{outlet.label}</span>
                          <span className="text-[11px] text-muted-foreground ml-auto">Tag {a.dayNumber}</span>
                        </div>
                        <div className="font-semibold text-sm leading-snug">{a.headline}</div>
                        <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{a.summary}</div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {/* Calendar */}
          {(calendar || upcomingCalendar) && (
            <section>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <div className="section-title !mb-0 !pb-0 !border-b-0">{t("kalender")}</div>
                  <div className="flex gap-1">
                    {(["upcoming", "past"] as const).map(v => (
                      <button key={v} onClick={() => setCalendarView(v)} className={cn(
                        "px-2.5 py-0.5 text-[11px] font-medium rounded-full border cursor-pointer transition-colors",
                        calendarView === v ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/30",
                      )}>
                        {v === "upcoming" ? t("termine") : t("vergangene")}
                      </button>
                    ))}
                  </div>
                </div>
                <Link to="/log" className="text-xs font-medium text-primary hover:underline">{t("alleTage")}</Link>
              </div>
              {calendarView === "upcoming" && upcomingCalendar && <UpcomingCalendar data={upcomingCalendar} />}
              {calendarView === "past" && calendar && <CalendarWidget data={calendar} onMonthChange={setCalendarMonth} />}
            </section>
          )}
        </div>

        {/* ── SIDEBAR ── */}
        <div className="flex flex-col gap-4">

          {/* Chancellor card */}
          {government && (() => {
            const cp = parties.find(p => p.id === government.chancellorPartyId);
            return (
              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{t("bundeskanzlerin")}</div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: fixColor(cp?.color || "#333") }}>
                      {government.chancellorName.split(" ").map(w => w[0]).join("").slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{government.chancellorName}</div>
                      <div className="text-xs text-muted-foreground">{cp?.name ?? government.chancellorPartyId} · {t("imAmt", { days: parliamentDay })}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Party Approval Ranking */}
          <Card>
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t("zustimmung")}</div>
                <Link to="/parties" className="text-[11px] font-medium text-primary hover:underline">{t("alleParteien")}</Link>
              </div>
              <div className="space-y-2">
                {partiesByApproval.map(p => {
                  const color = fixColor(p.color);
                  const barW = maxApproval > 0 ? (p.approvalRating / maxApproval) * 100 : 0;
                  return (
                    <Link key={p.id} to={`/parties/${p.id}`} className="flex items-center gap-2 no-underline group">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-medium text-foreground group-hover:text-primary w-14 truncate">{p.name}</span>
                      <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                        <div className="h-full rounded transition-all duration-300" style={{ width: `${barW}%`, backgroundColor: color }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums w-10 text-right" style={{ color }}>{p.approvalRating.toFixed(1)}%</span>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Public Sentiment */}
          <Card>
            <CardContent className="p-4">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{t("oeffentlicheStimmung")}</div>
              <div className="flex items-center gap-3">
                <div className="stat-value text-2xl" style={{ color: sentimentColor }}>{state.publicSentiment}</div>
                <div className="flex-1">
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${state.publicSentiment}%`, backgroundColor: sentimentColor }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 text-right">/100</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* MdB Seat card */}
          {mySeat && (() => {
            const seatParty = parties.find(p => p.id === mySeat.partyId);
            const seatColor = fixColor(seatParty?.color || "#333");
            const thirdReadingBills = bills.filter(b => b.status === "third_reading");
            return (
              <Card style={{ borderLeft: `3px solid ${seatColor}` }}>
                <CardContent className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{t("mdbSitz")}</div>
                  <div className="font-bold text-sm">Sitz #{mySeat.seatNumber} · {seatParty?.name ?? mySeat.partyId}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">Disziplin:</span>
                    <Badge variant="outline" className={cn("text-[10px]", DISCIPLINE_BADGE[mySeat.disciplineLevel] ?? DISCIPLINE_BADGE[0])}>
                      {DISCIPLINE_LABEL[mySeat.disciplineLevel] ?? "?"}
                    </Badge>
                  </div>
                  {thirdReadingBills.length > 0 && (
                    <Link to="/bills?status=third_reading" className="text-xs text-primary mt-2 inline-block no-underline hover:underline font-medium">
                      {thirdReadingBills.length} Gesetz{thirdReadingBills.length !== 1 ? "e" : ""} warten →
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {!mySeat && user?.partyId && myApplications.length === 0 && (
            <Link to={`/parties/${user.partyId}#mdb-seats`} className="block p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
              <span className="block font-semibold text-xs text-primary">{t("mdbBeantragen")}</span>
              <span className="block text-[11px] text-muted-foreground">{t("mdbBeantragenBeschreibung")}</span>
            </Link>
          )}
          {!mySeat && myApplications.some(a => a.status === "pending") && (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">{t("bewerbungLaeuft")}</div>
          )}

          {/* Active Crises */}
          {crises.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-destructive mb-2">{t("aktiveKrisen")}</div>
                {crises.map(c => (
                  <div key={c.id} className="mb-2 last:mb-0">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-xs">{c.name}</span>
                      <Badge variant="outline" className={cn("text-[10px]", SEVERITY_BADGE[c.severity])}>{c.severity}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{c.category} · Tag {c.startDay}–{c.endDay}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Active Election */}
          {election && (
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600 mb-2">{t("wahl")}</div>
                <div className="flex justify-between items-center mb-1">
                  <Badge variant="outline" className={cn("text-[10px]", PHASE_BADGE[election.status])}>{election.status}</Badge>
                  <span className="text-xs text-muted-foreground">Tag {election.electionDay}</span>
                </div>
                <div className="text-xs text-muted-foreground">{election.triggerReason}</div>
                {election.electionDay - simStatus.currentDay > 0 && (
                  <div className="mt-1.5 font-bold text-sm">{t("tagesBisWahl", { days: election.electionDay - simStatus.currentDay })}</div>
                )}
                <Link to="/elections" className="text-xs text-primary mt-1.5 inline-block font-medium hover:underline">Details →</Link>
              </CardContent>
            </Card>
          )}

          {/* Engagement CTAs */}
          <div className="space-y-1.5">
            {!user ? (
              <Link to="/login" className="block p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-semibold text-xs text-primary">{t("anmelden")}</span>
                <span className="block text-[11px] text-muted-foreground">{t("anmeldenBeschreibung")}</span>
              </Link>
            ) : user.partyId ? (
              <Link to={`/parties/${user.partyId}`} className="block p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-semibold text-xs text-primary">{t("ihrepartei")}</span>
                <span className="block text-[11px] text-muted-foreground">{parties.find(p => p.id === user.partyId)?.name ?? user.partyId}</span>
              </Link>
            ) : (
              <Link to="/parties" className="block p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors no-underline">
                <span className="block font-semibold text-xs text-primary">{t("parteiBeitreten")}</span>
                <span className="block text-[11px] text-muted-foreground">{t("parteiBetreteNBeschreibung")}</span>
              </Link>
            )}
            {user && (
              <button
                onClick={() => setShowWelcome(true)}
                className="w-full text-left p-3 rounded-lg border border-dashed border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <span className="block font-semibold text-xs text-muted-foreground">{t("willkommenGuide")}</span>
                <span className="block text-[11px] text-muted-foreground/70">{t("einfuehrungnochmal")}</span>
              </button>
            )}
          </div>

          {/* Ask a Party widget */}
          {parties.length > 0 && <AskPartyWidget parties={parties} coalitionParties={state.coalitionParties} />}

          {/* My Impact card */}
          <MyImpactCard />
        </div>
      </div>

      {/* ═══ FEATURED (full width) ═══ */}
      {(decisionOfMonth || politicianOfMonth) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          {decisionOfMonth && (() => {
            const proposer = parties.find(p => p.id === decisionOfMonth.proposedBy);
            const yesSeats = decisionOfMonth.votes.filter(v => v.vote === "yes").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const noSeats = decisionOfMonth.votes.filter(v => v.vote === "no").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const total = yesSeats + noSeats;
            return (
              <Card>
                <CardContent className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{simMonthLabel ? `Entscheidung im ${simMonthLabel}` : t("entscheidungDesMonats")}</div>
                  <Link to={`/bills/${decisionOfMonth.id}`} className="font-bold text-sm text-foreground no-underline hover:underline leading-snug">
                    {decisionOfMonth.title}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {decisionOfMonth.category} · {proposer?.name ?? decisionOfMonth.proposedBy}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={decisionOfMonth.status === "passed" ? "default" : "destructive"} className={cn("text-[10px]", decisionOfMonth.status === "passed" && "bg-emerald-600")}>
                      {decisionOfMonth.status}
                    </Badge>
                    {total > 0 && <span className="text-[11px] text-muted-foreground">Ja {yesSeats} · Nein {noSeats}</span>}
                  </div>
                  {total > 0 && (
                    <div className="mt-2">
                      <VoteBar yes={yesSeats} no={noSeats} abstain={0} total={total} height="h-1.5" />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {politicianOfMonth && (
            <Card>
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{simMonthLabel ? `Partei im ${simMonthLabel}` : t("parteiDesMonats")}</div>
                <Link to={`/parties/${politicianOfMonth.party.id}`} className="flex items-center gap-2 no-underline text-foreground">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: fixColor(politicianOfMonth.party.color) }} />
                  <span className="font-bold text-sm">{politicianOfMonth.party.name}</span>
                </Link>
                <div className="text-xs text-muted-foreground mt-1">{t("aktuelleZustimmung", { value: politicianOfMonth.party.approvalRating.toFixed(1) })}</div>
                <div className="mt-1.5 font-extrabold text-lg" style={{ color: politicianOfMonth.delta > 0 ? SEMANTIC_HEX.positive : politicianOfMonth.delta < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral }}>
                  {politicianOfMonth.delta > 0 ? "+" : ""}{politicianOfMonth.delta.toFixed(1)}
                  <span className="font-normal text-[11px] text-muted-foreground ml-1.5">{t("veraenderung")}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <LiveEventTicker simStatus={simStatus} />
    </div>
  );
}
