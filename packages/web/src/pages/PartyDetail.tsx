import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type Party, type PartyHistory, type Bill, type PartyVoteRecord, type SimulationEvent, type CitizenQuestion, type Fraktion, type SimulationStatus, type InternalProposal, type BundestagSeat, type MdbApplication, type Sidejob } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, VOTE_HEX, FRAKTION_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ApprovalChart } from "@/components/party/ApprovalChart";
import { PartyBillsList } from "@/components/party/PartyBillsList";
import { MdbRosterTable } from "@/components/party/MdbRosterTable";
import { ProposalForm } from "@/components/party/ProposalForm";
import { QuestionForm } from "@/components/party/QuestionForm";
import { usePageMeta } from "@/hooks/usePageMeta";

export function PartyDetail() {
  const { t } = useTranslation("parties");
  const { id } = useParams<{ id: string }>();
  const { user, updateUser } = useUser();
  const [party, setParty] = useState<Party | null>(null);
  const [history, setHistory] = useState<PartyHistory[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [votes, setVotes] = useState<PartyVoteRecord[]>([]);
  const [statements, setStatements] = useState<SimulationEvent[]>([]);
  const [questions, setQuestions] = useState<CitizenQuestion[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [fraktion, setFraktion] = useState<Fraktion | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [visibleBills, setVisibleBills] = useState(5);
  const [visibleVotes, setVisibleVotes] = useState(5);
  const [visibleStatements, setVisibleStatements] = useState(5);
  const [proposals, setProposals] = useState<InternalProposal[]>([]);
  const [joinStatus, setJoinStatus] = useState<"idle" | "loading" | "error">("idle");
  const [joinError, setJoinError] = useState("");
  const joinNavigate = useNavigate();
  const [seats, setSeats] = useState<BundestagSeat[]>([]);
  const [availableSeats, setAvailableSeats] = useState<Record<string, { open: number; humanTotal: number; total: number }>>({});
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyMotivation, setApplyMotivation] = useState("");
  const [applyFocus, setApplyFocus] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);
  const [myApplications, setMyApplications] = useState<MdbApplication[]>([]);
  const [sidejobs, setSidejobs] = useState<Sidejob[]>([]);
  const [showSidejobs, setShowSidejobs] = useState(false);

  usePageMeta({
    title: party?.name ? `${party.name} — Partei` : "Partei",
    description: party?.name ? `Profil und Aktivitäten von ${party.name} im KI-Bundestag.` : undefined,
  });

  const refresh = useCallback(() => {
    if (!id) return;
    api.getParty(id).then(setParty).catch(console.error);
    api.getPartyHistory(id).then(setHistory).catch(console.error);
    api.getPartyBills(id).then(b => setBills(b.sort((a, c) => c.proposedOnDay - a.proposedOnDay))).catch(console.error);
    api.getPartyVotes(id).then(setVotes).catch(console.error);
    api.getPartyStatements(id).then(setStatements).catch(console.error);
    api.getQuestions(id).then(setQuestions).catch(console.error);
    api.getPartyProposals(id).then(setProposals).catch(console.error);
    api.getParties().then(setAllParties).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
    api.getPartySeats(id).then(setSeats).catch(console.error);
    api.getAvailableSeats().then(setAvailableSeats).catch(console.error);
    if (user) api.getMySeat().then(r => setMyApplications(r.applications)).catch(() => {});
    api.getSidejobs(id).then(setSidejobs).catch(() => {});
    api.getFraktionen().then(all => {
      const active = all.find(f => f.partyId === id && f.status === "active");
      if (active) {
        setFraktion(active);
      } else {
        const dissolved = all
          .filter(f => f.partyId === id && f.status === "dissolved")
          .sort((a, b) => (b.dissolvedOnDay ?? 0) - (a.dissolvedOnDay ?? 0));
        setFraktion(dissolved[0] || null);
      }
    }).catch(console.error);
  }, [id, user]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (!party) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const displayColor = party.color === "#FFED00" ? "#c4a900" : party.color;
  const isMyParty = user?.partyId === id;

  const partyAvail = availableSeats[id!];
  const openCount = partyAvail?.open ?? 0;
  const hasSeat = seats.some(s => s.userId === user?.id);
  const pendingApp = myApplications.find(a => a.status === "pending" && a.partyId === id);
  const rejectedApp = myApplications.find(a => a.status === "rejected" && a.partyId === id);
  const canApply = isMyParty && !hasSeat && !pendingApp && openCount > 0;
  const humanSeats = seats.filter(s => s.controller === "human");

  const handleJoin = async () => {
    if (!user) {
      joinNavigate(`/login?redirect=/parties/${id}`);
      return;
    }
    if (joinStatus === "loading") return;
    setJoinStatus("loading");
    setJoinError("");
    try {
      const result = await api.joinParty(id!);
      updateUser(result);
      setJoinStatus("idle");
      api.getParty(id!).then(setParty).catch(console.error);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Beitritt fehlgeschlagen");
      setJoinStatus("error");
    }
  };

  const handleLeave = async () => {
    try {
      const result = await api.leaveParty();
      updateUser(result);
      api.getParty(id!).then(setParty).catch(console.error);
    } catch { /* ignore */ }
  };

  return (
    <div className="min-w-0 overflow-hidden">
      {/* Header */}
      <div className="mb-6">
        <Link to="/parties" className="text-sm text-muted-foreground no-underline hover:text-foreground">{t("detail.backLink")}</Link>
      </div>

      {/* Party color block header */}
      <div className="rounded-lg overflow-hidden mb-8 border border-border">
        <div className="px-6 py-5" style={{ backgroundColor: displayColor }}>
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h1 className="!m-0 !text-white text-2xl">{party.name}</h1>
              <div className="text-white/80 mt-1 text-sm">{party.ideology}</div>
            </div>
            <Badge variant="outline" className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
              {party.coalitionRole}
            </Badge>
          </div>
        </div>
        <div className="bg-card px-6 py-4">
          <div className="flex gap-8">
            <div>
              <div className="stat-value" style={{ color: displayColor }}>{party.seatCount}</div>
              <div className="stat-label">{t("detail.seats")}</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: displayColor }}>{party.approvalRating}%</div>
              <div className="stat-label">{t("detail.approval")}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="stat-label">{t("detail.policyPriorities")}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(party.policyPriorities).map(([key, val]) => (
                <span
                  key={key}
                  className={cn("text-xs px-2 py-0.5 rounded", val > 0 ? "bg-emerald-50" : val < 0 ? "bg-red-50" : "bg-zinc-100")}
                >
                  {key}: {val > 0 ? "+" : ""}{val}
                </span>
              ))}
            </div>
          </div>

          {/* Membership section */}
          <div id="join-party" className="mt-4 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">
              👥 {t("detail.memberCount", { count: party.memberCount })}
              {isMyParty && <span className="ml-2 font-bold" style={{ color: displayColor }}>{t("detail.memberBadge")}</span>}
            </span>
            {isMyParty ? (
              <button
                onClick={handleLeave}
                className="text-xs px-3 py-1 rounded border border-input bg-card text-muted-foreground cursor-pointer hover:bg-accent"
              >
                {t("detail.leave")}
              </button>
            ) : (
              <div className="flex gap-1.5 items-center flex-wrap">
                <button
                  onClick={handleJoin}
                  disabled={joinStatus === "loading"}
                  className="text-sm px-3.5 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: displayColor, color: displayColor }}
                >
                  {joinStatus === "loading" ? t("detail.joining") : t("detail.join")}
                </button>
                {joinStatus === "error" && <span className="text-xs text-destructive">{joinError}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fraktion */}
      {fraktion && (
        <div className="mb-8">
          <h2 className="section-title">{t("detail.fraktionSection")}</h2>
          <Card>
            <CardContent className="p-5">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{t("detail.fraktionLeader", { name: fraktion.leaderName })}</div>
                  <div className="text-sm text-muted-foreground mt-1">{t("detail.fraktionFormed", { day: fraktion.formedOnDay })}</div>
                  {fraktion.status === "dissolved" && fraktion.dissolvedOnDay != null && (
                    <div className="text-sm text-destructive mt-0.5">{t("detail.fraktionDissolved", { day: fraktion.dissolvedOnDay })}</div>
                  )}
                </div>
                <Badge variant="outline" className={fraktion.status === "active" ? FRAKTION_BADGE.active : FRAKTION_BADGE.none}>
                  {fraktion.status === "active" ? t("detail.fraktionActive") : t("detail.fraktionDissolvedBadge")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bundestag Members (MdB Roster) */}
      {seats.length > 0 && (
        <div id="mdb-seats" className="mb-8">
          <h2 className="section-title">
            {t("detail.mdbSection")}
            <span className="block sm:inline text-sm font-normal text-muted-foreground sm:ml-2 mt-0.5 sm:mt-0">
              {t("detail.mdbSeatStats", { occupied: humanSeats.filter(s => s.userId).length, total: humanSeats.length, seats: seats.length })}
              {openCount > 0 && <span className="text-emerald-600 ml-1">{t("detail.mdbOpenSeats", { count: openCount })}</span>}
            </span>
          </h2>

          {/* Prominent MdB Apply CTA */}
          {canApply && !showApplyForm && (
            <Card className="mb-4 border-2" style={{ borderColor: `${displayColor}40` }}>
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row gap-4 md:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base mb-1.5" style={{ color: displayColor }}>{t("detail.mdbApplyTitle", { name: party.name })}</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("detail.mdbApplyDesc")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>{t("detail.mdbBenefit1")}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>{t("detail.mdbBenefit2")}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>{t("detail.mdbBenefit3")}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>{t("detail.mdbBenefit4")}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t("detail.mdbReq1")}</span>
                      <span>·</span>
                      <span>{t("detail.mdbReq2")}</span>
                      <span>·</span>
                      <span>{t("detail.mdbReq3")}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="shrink-0 px-5 py-2.5 rounded-lg text-white font-semibold text-sm cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ background: displayColor }}
                  >
                    {t("detail.mdbApplyButton")}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending application notice */}
          {pendingApp && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
              <span className="font-semibold">{t("detail.mdbPendingTitle")}</span>
              <span className="text-xs text-amber-600">{t("detail.mdbPendingDetail", { day: pendingApp.createdOnDay })}</span>
            </div>
          )}

          {/* Rejected with cooldown notice */}
          {rejectedApp && rejectedApp.cooldownUntilDay && simStatus && rejectedApp.cooldownUntilDay > simStatus.currentDay && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
              {t("detail.mdbRejectedCooldown", { day: rejectedApp.cooldownUntilDay })}
            </div>
          )}

          {/* Apply form */}
          {showApplyForm && (
            <Card className="mb-4" style={{ borderLeft: `3px solid ${displayColor}` }}>
              <CardContent className="p-5">
                <div className="font-semibold mb-1">{t("detail.mdbFormTitle")}</div>
                <p className="text-xs text-muted-foreground mb-3">{t("detail.mdbFormDesc")}</p>
                <textarea
                  value={applyMotivation}
                  onChange={e => setApplyMotivation(e.target.value)}
                  placeholder={t("detail.mdbFormPlaceholder")}
                  maxLength={500}
                  rows={3}
                  className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
                />
                <select
                  value={applyFocus}
                  onChange={e => setApplyFocus(e.target.value)}
                  aria-label={t("detail.mdbFocusPlaceholder")}
                  className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 bg-transparent"
                >
                  <option value="">{t("detail.mdbFocusPlaceholder")}</option>
                  <option value="economy">{t("detail.mdbFocusEconomy")}</option>
                  <option value="social">{t("detail.mdbFocusSocial")}</option>
                  <option value="environment">{t("detail.mdbFocusEnvironment")}</option>
                  <option value="immigration">{t("detail.mdbFocusImmigration")}</option>
                  <option value="defense">{t("detail.mdbFocusDefense")}</option>
                  <option value="education">{t("detail.mdbFocusEducation")}</option>
                  <option value="healthcare">{t("detail.mdbFocusHealthcare")}</option>
                  <option value="infrastructure">{t("detail.mdbFocusInfrastructure")}</option>
                </select>
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    onClick={async () => {
                      if (applyMotivation.trim().length < 20) return;
                      setApplySubmitting(true);
                      setApplyMsg(null);
                      try {
                        await api.applyForSeat(applyMotivation.trim(), applyFocus.trim() || undefined);
                        setApplyMotivation(""); setApplyFocus("");
                        setShowApplyForm(false);
                        setApplyMsg(t("detail.mdbApplied"));
                        refresh();
                      } catch (e) {
                        setApplyMsg(e instanceof Error ? e.message : "Fehler beim Einreichen");
                      } finally {
                        setApplySubmitting(false);
                        setTimeout(() => setApplyMsg(null), 5000);
                      }
                    }}
                    disabled={applySubmitting || applyMotivation.trim().length < 20}
                    className="px-3.5 py-1.5 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                    style={{ background: displayColor }}
                  >
                    {applySubmitting ? t("detail.mdbSubmitting") : t("detail.mdbSubmit")}
                  </button>
                  <button
                    onClick={() => { setShowApplyForm(false); setApplyMotivation(""); setApplyFocus(""); }}
                    className="px-2.5 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
                  >
                    {t("detail.mdbCancel")}
                  </button>
                  {applyMsg && <span className={`text-xs ${applyMsg.includes("Fehler") ? "text-destructive" : "text-emerald-500"}`}>{applyMsg}</span>}
                </div>
              </CardContent>
            </Card>
          )}

          <MdbRosterTable seats={seats} partyId={id!} />
        </div>
      )}

      {/* Approval chart */}
      {history.length >= 2 && (
        <div className="mb-8">
          <h2 className="section-title">{t("detail.approvalSection")}</h2>
          <Card>
            <CardContent className="p-5">
              <ApprovalChart history={history} color={party.color} partyId={party.id} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bills proposed */}
      <div className="mb-8">
        <h2 className="section-title">{t("detail.billsSection", { count: bills.length })}</h2>
        <PartyBillsList
          bills={bills}
          visibleBills={visibleBills}
          onShowMore={() => setVisibleBills(v => v + 5)}
        />
      </div>

      {/* Voting record */}
      <div className="mb-8">
        <h2 className="section-title">{t("detail.votesSection", { count: votes.length })}</h2>
        {votes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.noVotes")}</p>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full border-collapse text-sm min-w-[480px]">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 border-b-2 border-border">{t("detail.votesColBill")}</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">{t("detail.votesColDay")}</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">{t("detail.votesColVote")}</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">{t("detail.votesColOutcome")}</th>
                  </tr>
                </thead>
                <tbody>
                  {votes.slice(0, visibleVotes).map(({ bill, vote }) => (
                    <tr key={bill.id}>
                      <td className="px-3 py-2 border-b border-border">
                        <Link to={`/bills/${bill.id}`} className="text-inherit no-underline hover:text-primary">{bill.title}</Link>
                        <div className="text-xs text-muted-foreground mt-0.5">{vote.reason}</div>
                      </td>
                      <td className="px-3 py-2 border-b border-border text-center">{t("detail.votesDay", { day: bill.proposedOnDay })}</td>
                      <td className="px-3 py-2 border-b border-border text-center">
                        <span className="font-semibold" style={{ color: VOTE_HEX[vote.vote as keyof typeof VOTE_HEX] || "#888" }}>
                          {vote.vote.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 border-b border-border text-center">
                        <Badge variant="outline" className={STATUS_BADGE[bill.status] || ""}>{bill.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShowMoreButton
                total={votes.length}
                visible={Math.min(visibleVotes, votes.length)}
                increment={5}
                onShowMore={() => setVisibleVotes(v => v + 5)}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Voting Alignment */}
      {votes.length >= 5 && (() => {
        const currentDay = simStatus?.currentDay ?? (votes.length > 0 ? Math.max(...votes.map(r => r.bill.proposedOnDay)) : 0);
        const recentVotes = votes.filter(r => r.bill.proposedOnDay >= currentDay - 30);
        const sample = recentVotes.length >= 5 ? recentVotes : votes;

        const alignment = allParties
          .filter(p => p.id !== party.id)
          .map(other => {
            const shared = sample.filter(r => r.bill.votes.some(v => v.partyId === other.id));
            const agreed = shared.filter(r =>
              r.vote.vote === r.bill.votes.find(v => v.partyId === other.id)?.vote
            );
            const pct = shared.length >= 2 ? Math.round((agreed.length / shared.length) * 100) : null;
            return { party: other, pct, count: shared.length };
          })
          .filter(a => a.pct !== null)
          .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

        if (alignment.length === 0) return null;

        return (
          <div className="mb-8">
            <h2 className="section-title">{t("detail.alignmentSection")}</h2>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground mb-3">
                  {t("detail.alignmentBasis", { count: sample === recentVotes ? recentVotes.length : votes.length })}
                </div>
                {alignment.map(({ party: other, pct, count }) => {
                  const otherColor = other.color === "#FFED00" ? "#c4a900" : other.color;
                  const barColor = (pct ?? 0) > 70 ? SEMANTIC_HEX.positive : (pct ?? 0) >= 40 ? SEMANTIC_HEX.neutral : SEMANTIC_HEX.negative;
                  return (
                    <div key={other.id} className="flex items-center gap-2 sm:gap-3 mb-2">
                      <div className="w-20 sm:w-36 shrink-0 text-xs sm:text-sm truncate">
                        <Link to={`/parties/${other.id}`} className="font-semibold no-underline" style={{ color: otherColor }}>
                          {other.name}
                        </Link>
                      </div>
                      <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="w-16 sm:w-20 shrink-0 text-xs sm:text-sm text-muted-foreground text-right">
                        <strong className="text-foreground">{pct}%</strong>
                        <span className="ml-1 opacity-60">({count})</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Policy Focus Areas */}
      {votes.length > 0 && (() => {
        const categoryCount: Record<string, number> = {};
        votes.forEach(r => {
          if (r.bill.proposedBy === party.id || r.vote.vote === "yes") {
            categoryCount[r.bill.category] = (categoryCount[r.bill.category] ?? 0) + 1;
          }
        });
        const topCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
        if (topCategories.length === 0) return null;

        return (
          <div className="mb-8">
            <h2 className="section-title">{t("detail.policyFocusSection")}</h2>
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap gap-2">
                  {topCategories.map(([cat, count]) => (
                    <span key={cat} className="inline-block px-3 py-1 rounded-full bg-sky-50 text-sm font-medium">
                      {cat.charAt(0).toUpperCase() + cat.slice(1)} <span className="text-muted-foreground">({count})</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Nebentätigkeiten */}
      {sidejobs.length > 0 && (
        <div className="mb-8">
          <h2 className="section-title">Nebentätigkeiten</h2>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  {sidejobs.length} Nebentätigkeiten, davon{" "}
                  <span className="font-medium text-red-600">
                    {sidejobs.filter(s => s.isControversial).length} kontrovers
                  </span>
                </p>
                <button
                  onClick={() => setShowSidejobs(!showSidejobs)}
                  className="text-sm text-primary hover:underline"
                >
                  {showSidejobs ? "Ausblenden" : "Anzeigen"}
                </button>
              </div>
              {showSidejobs && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Organisation</th>
                        <th className="py-2 pr-3 font-medium">Tätigkeit</th>
                        <th className="py-2 pr-3 font-medium">Einkommen</th>
                        <th className="py-2 font-medium">Kategorie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...sidejobs].sort((a, b) => {
                        if (a.isControversial !== b.isControversial) return a.isControversial ? -1 : 1;
                        const order = ["30000+", "15000-30000", "7000-15000", "3500-7000", "1000-3500"];
                        return order.indexOf(a.incomeLevel) - order.indexOf(b.incomeLevel);
                      }).map(sj => (
                        <tr key={sj.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {sj.politicianName}
                            {sj.isControversial && (
                              <Badge variant="outline" className="ml-1.5 text-xs bg-red-50 text-red-700 border-red-200">!</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground">{sj.organization}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{sj.role}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className={cn("text-xs",
                              sj.incomeLevel === "30000+" || sj.incomeLevel === "15000-30000"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : sj.incomeLevel === "7000-15000"
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                  : "bg-green-50 text-green-700 border-green-200"
                            )}>
                              {sj.incomeLevel}€
                            </Badge>
                          </td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-xs">
                              {{ beratung: "Beratung", vortrag: "Vortrag", aufsichtsrat: "Aufsichtsrat", verband: "Verband", medien: "Medien", sonstiges: "Sonstiges" }[sj.category] ?? sj.category}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Statements */}
      <div className="mb-8">
        <h2 className="section-title">{t("detail.statementsSection", { count: statements.length })}</h2>
        {statements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("detail.noStatements")}</p>
        ) : (
          <div>
            {statements.slice(0, visibleStatements).map(s => (
              <Card key={s.id} className="mb-2" style={{ borderLeft: `3px solid ${displayColor}` }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{t("detail.statementDay", { day: s.dayNumber })}</div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{s.description}</div>
                </CardContent>
              </Card>
            ))}
            <ShowMoreButton
              total={statements.length}
              visible={Math.min(visibleStatements, statements.length)}
              increment={5}
              onShowMore={() => setVisibleStatements(v => v + 5)}
            />
          </div>
        )}
      </div>

      {/* Member Proposals */}
      <ProposalForm
        partyId={id!}
        displayColor={displayColor}
        proposals={proposals}
        simCurrentDay={simStatus?.currentDay}
        onProposalsChange={setProposals}
        onNavigateToLogin={() => {
          if (!user) joinNavigate(`/login?redirect=/parties/${id}`);
        }}
      />

      {/* Ask a Question */}
      <QuestionForm
        partyId={id!}
        partyName={party.name}
        displayColor={displayColor}
        questions={questions}
      />
    </div>
  );
}
