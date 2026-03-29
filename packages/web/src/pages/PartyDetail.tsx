import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, type Party, type PartyHistory, type Bill, type PartyVoteRecord, type SimulationEvent, type CitizenQuestion, type Fraktion, type SimulationStatus, type InternalProposal, type BundestagSeat, type MdbApplication } from "../api";
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

export function PartyDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, login } = useUser();
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
      login(result.id, result);
      setJoinStatus("idle");
      api.getParty(id!).then(setParty).catch(console.error);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Failed to join");
      setJoinStatus("error");
    }
  };

  const handleLeave = async () => {
    try {
      const result = await api.leaveParty();
      login(result.id, result);
      api.getParty(id!).then(setParty).catch(console.error);
    } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/parties" className="text-sm text-muted-foreground no-underline hover:text-foreground">&larr; Alle Parteien</Link>
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
              <div className="stat-label">Sitze</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: displayColor }}>{party.approvalRating}%</div>
              <div className="stat-label">Zustimmung</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="stat-label">Politische Schwerpunkte</div>
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
              👥 <strong>{party.memberCount}</strong> member{party.memberCount !== 1 ? "s" : ""}
              {isMyParty && <span className="ml-2 font-bold" style={{ color: displayColor }}>Mitglied</span>}
            </span>
            {isMyParty ? (
              <button
                onClick={handleLeave}
                className="text-xs px-3 py-1 rounded border border-input bg-card text-muted-foreground cursor-pointer hover:bg-accent"
              >
                Austreten
              </button>
            ) : (
              <div className="flex gap-1.5 items-center flex-wrap">
                <button
                  onClick={handleJoin}
                  disabled={joinStatus === "loading"}
                  className="text-sm px-3.5 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: displayColor, color: displayColor }}
                >
                  {joinStatus === "loading" ? "Beitritt…" : "Beitreten"}
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
          <h2 className="section-title">Fraktion</h2>
          <Card>
            <CardContent className="p-5">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">Fraktion Leader: {fraktion.leaderName}</div>
                  <div className="text-sm text-muted-foreground mt-1">Formed on Day {fraktion.formedOnDay}</div>
                  {fraktion.status === "dissolved" && fraktion.dissolvedOnDay != null && (
                    <div className="text-sm text-destructive mt-0.5">Dissolved on Day {fraktion.dissolvedOnDay}</div>
                  )}
                </div>
                <Badge variant="outline" className={fraktion.status === "active" ? FRAKTION_BADGE.active : FRAKTION_BADGE.none}>
                  {fraktion.status === "active" ? "Active" : "Dissolved"}
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
            Bundestagsabgeordnete
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {humanSeats.filter(s => s.userId).length}/{humanSeats.length} besetzt · {seats.length} Sitze gesamt
              {openCount > 0 && <span className="text-emerald-600 ml-1">({openCount} frei)</span>}
            </span>
          </h2>

          {/* Prominent MdB Apply CTA */}
          {canApply && !showApplyForm && (
            <Card className="mb-4 border-2" style={{ borderColor: `${displayColor}40` }}>
              <CardContent className="p-5">
                <div className="flex flex-col md:flex-row gap-4 md:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base mb-1.5" style={{ color: displayColor }}>Werde MdB für {party.name}</div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Als Mitglied des Bundestags nimmst du direkt an der parlamentarischen Arbeit teil.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-3">
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>Direkte Abstimmung über Gesetze in 3. Lesung</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>Reden halten in allen Lesungen</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>Anträge und Entschließungen einbringen</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                        <span>Änderungsanträge in 2. Lesung stellen</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Voraussetzung: Parteimitglied</span>
                      <span>·</span>
                      <span>KI-Bewertung der Bewerbung</span>
                      <span>·</span>
                      <span>7 Tage Wartezeit nach Ablehnung</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="shrink-0 px-5 py-2.5 rounded-lg text-white font-semibold text-sm cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ background: displayColor }}
                  >
                    Jetzt bewerben
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending application notice */}
          {pendingApp && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 flex items-center gap-2">
              <span className="font-semibold">Bewerbung läuft</span>
              <span className="text-xs text-amber-600">— eingereicht Tag {pendingApp.createdOnDay}, wird demnächst geprüft</span>
            </div>
          )}

          {/* Rejected with cooldown notice */}
          {rejectedApp && rejectedApp.cooldownUntilDay && simStatus && rejectedApp.cooldownUntilDay > simStatus.currentDay && (
            <div className="mb-4 px-4 py-3 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground">
              Letzte Bewerbung abgelehnt — erneute Bewerbung ab Tag {rejectedApp.cooldownUntilDay} möglich
            </div>
          )}

          {/* Apply form */}
          {showApplyForm && (
            <Card className="mb-4" style={{ borderLeft: `3px solid ${displayColor}` }}>
              <CardContent className="p-5">
                <div className="font-semibold mb-1">Bewerbung als Bundestagsabgeordnete/r</div>
                <p className="text-xs text-muted-foreground mb-3">Begründe, warum du diese Partei vertreten willst. Nenne konkrete politische Ziele — die KI-Fraktionsführung bewertet Substanz und Parteinähe.</p>
                <textarea
                  value={applyMotivation}
                  onChange={e => setApplyMotivation(e.target.value)}
                  placeholder="Warum willst du diese Partei vertreten? (20–500 Zeichen)"
                  maxLength={500}
                  rows={3}
                  className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
                />
                <select
                  value={applyFocus}
                  onChange={e => setApplyFocus(e.target.value)}
                  aria-label="Politischer Schwerpunkt"
                  className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 bg-transparent"
                >
                  <option value="">Politischer Schwerpunkt (optional)</option>
                  <option value="economy">Wirtschaft</option>
                  <option value="social">Soziales</option>
                  <option value="environment">Umwelt</option>
                  <option value="immigration">Migration</option>
                  <option value="defense">Verteidigung</option>
                  <option value="education">Bildung</option>
                  <option value="healthcare">Gesundheit</option>
                  <option value="infrastructure">Infrastruktur</option>
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
                        setApplyMsg("Bewerbung eingereicht! Du wirst über das Ergebnis benachrichtigt.");
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
                    {applySubmitting ? "Wird gesendet…" : "Bewerben"}
                  </button>
                  <button
                    onClick={() => { setShowApplyForm(false); setApplyMotivation(""); setApplyFocus(""); }}
                    className="px-2.5 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
                  >
                    Abbrechen
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
          <h2 className="section-title">Zustimmungsverlauf</h2>
          <Card>
            <CardContent className="p-5">
              <ApprovalChart history={history} color={party.color} partyId={party.id} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bills proposed */}
      <div className="mb-8">
        <h2 className="section-title">Gesetzentwürfe ({bills.length})</h2>
        <PartyBillsList
          bills={bills}
          visibleBills={visibleBills}
          onShowMore={() => setVisibleBills(v => v + 5)}
        />
      </div>

      {/* Voting record */}
      <div className="mb-8">
        <h2 className="section-title">Abstimmungsverhalten ({votes.length})</h2>
        {votes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No votes yet.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 border-b-2 border-border">Bill</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">Day</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">Vote</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {votes.slice(0, visibleVotes).map(({ bill, vote }) => (
                    <tr key={bill.id}>
                      <td className="px-3 py-2 border-b border-border">
                        <Link to={`/bills/${bill.id}`} className="text-inherit no-underline hover:text-primary">{bill.title}</Link>
                        <div className="text-xs text-muted-foreground mt-0.5">{vote.reason}</div>
                      </td>
                      <td className="px-3 py-2 border-b border-border text-center">{bill.proposedOnDay}</td>
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
            <h2 className="section-title">Abstimmungsübereinstimmung</h2>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs text-muted-foreground mb-3">
                  Based on last 30 days ({sample === recentVotes ? recentVotes.length : votes.length} shared votes)
                </div>
                {alignment.map(({ party: other, pct, count }) => {
                  const otherColor = other.color === "#FFED00" ? "#c4a900" : other.color;
                  const barColor = (pct ?? 0) > 70 ? SEMANTIC_HEX.positive : (pct ?? 0) >= 40 ? SEMANTIC_HEX.neutral : SEMANTIC_HEX.negative;
                  return (
                    <div key={other.id} className="flex items-center gap-3 mb-2">
                      <div className="w-36 shrink-0 text-sm">
                        <Link to={`/parties/${other.id}`} className="font-semibold no-underline" style={{ color: otherColor }}>
                          {other.name}
                        </Link>
                      </div>
                      <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <div className="w-20 shrink-0 text-sm text-muted-foreground">
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
            <h2 className="section-title">Politische Schwerpunkte</h2>
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

      {/* Statements */}
      <div className="mb-8">
        <h2 className="section-title">Erklärungen ({statements.length})</h2>
        {statements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No statements yet.</p>
        ) : (
          <div>
            {statements.slice(0, visibleStatements).map(s => (
              <Card key={s.id} className="mb-2" style={{ borderLeft: `3px solid ${displayColor}` }}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="font-semibold text-sm">{s.title}</div>
                    <div className="text-xs text-muted-foreground">Day {s.dayNumber}</div>
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
