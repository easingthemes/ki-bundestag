import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, type Party, type PartyHistory, type Bill, type PartyVoteRecord, type SimulationEvent, type CitizenQuestion, type Fraktion, type SimulationStatus, type InternalProposal, type BundestagSeat } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROLE_BADGE, STATUS_BADGE, VOTE_HEX, FRAKTION_BADGE, SEMANTIC_HEX, DISCIPLINE_BADGE, DISCIPLINE_LABEL, MDB_BADGE } from "@/lib/colors";


const PROPOSAL_STATUS: Record<string, string> = {
  open: STATUS_BADGE.proposed,
  accepted: STATUS_BADGE.passed,
  declined: STATUS_BADGE.rejected,
};

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function ApprovalChart({ history, color, partyId }: { history: PartyHistory[]; color: string; partyId: string }) {
  if (history.length < 2) return null;
  const partyColor = color === "#FFED00" ? "#c4a900" : color;
  const chartData = history.map(h => ({ day: h.dayNumber, approval: h.approvalRating }));
  const gradId = `grad-${partyId}`;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={partyColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={partyColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11 }}
          tickLine={false}
          label={{ value: "Day", position: "insideBottomRight", offset: -4, fontSize: 11 }}
        />
        <YAxis
          domain={[0, 60]}
          tick={{ fontSize: 11 }}
          tickLine={false}
          width={32}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          formatter={(v: number) => [`${v.toFixed(1)}%`, "Approval"]}
          labelFormatter={(l: number) => `Day ${l}`}
        />
        <Area
          type="monotone"
          dataKey="approval"
          stroke={partyColor}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

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
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [visibleBills, setVisibleBills] = useState(5);
  const [visibleVotes, setVisibleVotes] = useState(5);
  const [visibleStatements, setVisibleStatements] = useState(5);
  const [proposals, setProposals] = useState<InternalProposal[]>([]);
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [propTitle, setPropTitle] = useState("");
  const [propDesc, setPropDesc] = useState("");
  const [propCategory, setPropCategory] = useState("economy");
  const [propSubmitting, setPropSubmitting] = useState(false);
  const [propMsg, setPropMsg] = useState<string | null>(null);
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

  const refresh = useCallback(() => {
    if (!id) return;
    api.getParty(id).then(setParty).catch(console.error);
    api.getPartyHistory(id).then(setHistory).catch(console.error);
    api.getPartyBills(id).then(setBills).catch(console.error);
    api.getPartyVotes(id).then(setVotes).catch(console.error);
    api.getPartyStatements(id).then(setStatements).catch(console.error);
    api.getQuestions(id).then(setQuestions).catch(console.error);
    api.getPartyProposals(id).then(setProposals).catch(console.error);
    api.getParties().then(setAllParties).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
    api.getPartySeats(id).then(setSeats).catch(console.error);
    api.getAvailableSeats().then(setAvailableSeats).catch(console.error);
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
  }, [id]);

  const handleSubmitQuestion = async () => {
    if (!id || questionText.trim().length < 5) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await api.submitQuestion(questionText.trim(), id);
      setQuestionText("");
      setSubmitMsg("Question submitted!");
      refresh();
    } catch {
      setSubmitMsg("Failed to submit question.");
    } finally {
      setSubmitting(false);
      setTimeout(() => setSubmitMsg(null), 3000);
    }
  };

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (!party) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  const displayColor = party.color === "#FFED00" ? "#c4a900" : party.color;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/parties" className="text-sm text-muted-foreground no-underline hover:text-foreground">&larr; All parties</Link>
      </div>
      <Card className="mb-8" style={{ borderLeft: `4px solid ${displayColor}` }}>
        <CardContent className="p-5">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="m-0 text-2xl">{party.name}</h1>
              <div className="text-muted-foreground mt-1">{party.ideology}</div>
            </div>
            <Badge variant="outline" className={cn(ROLE_BADGE[party.coalitionRole], "text-sm px-3 py-1")}>
              {party.coalitionRole}
            </Badge>
          </div>
          <div className="flex gap-8 mt-4">
            <div>
              <div className="text-3xl font-bold" style={{ color: displayColor }}>{party.seatCount}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Seats</div>
            </div>
            <div>
              <div className="text-3xl font-bold" style={{ color: displayColor }}>{party.approvalRating}%</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Approval</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Policy Priorities</div>
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
          {(() => {
            const isMyParty = user?.partyId === id;
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
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm text-muted-foreground">
                  👥 <strong>{party.memberCount}</strong> member{party.memberCount !== 1 ? "s" : ""}
                  {isMyParty && <span className="ml-2 font-bold" style={{ color: displayColor }}>✓ You're a member</span>}
                </span>
                {isMyParty ? (
                  <button
                    onClick={handleLeave}
                    className="text-xs px-3 py-1 rounded border border-input bg-card text-muted-foreground cursor-pointer hover:bg-accent"
                  >
                    Leave Party
                  </button>
                ) : (
                  <div className="flex gap-1.5 items-center flex-wrap">
                    <button
                      onClick={handleJoin}
                      disabled={joinStatus === "loading"}
                      className="text-sm px-3.5 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80 disabled:opacity-50"
                      style={{ borderColor: displayColor, color: displayColor }}
                    >
                      {joinStatus === "loading" ? "Joining…" : "Join this Party"}
                    </button>
                    {joinStatus === "error" && <span className="text-xs text-destructive">{joinError}</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Fraktion */}
      {fraktion && (
        <div className="mb-8">
          <h2>Fraktion</h2>
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
      {seats.length > 0 && (() => {
        const isMyParty = user?.partyId === id;
        const humanSeats = seats.filter(s => s.controller === "human");
        const aiSeats = seats.filter(s => s.controller === "ai");
        const partyAvail = availableSeats[id!];
        const openCount = partyAvail?.open ?? 0;

        return (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h2 className="m-0">
                Bundestag Members
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  {humanSeats.filter(s => s.userId).length} MdB / {humanSeats.length} human seats / {seats.length} total
                  {openCount > 0 && <span className="text-emerald-600 ml-1">({openCount} open)</span>}
                </span>
              </h2>
              {isMyParty && !showApplyForm && openCount > 0 && !seats.some(s => s.userId === user?.id) && (
                <button
                  onClick={() => setShowApplyForm(true)}
                  className="px-3.5 py-1 rounded border bg-card font-semibold text-sm cursor-pointer hover:opacity-80"
                  style={{ borderColor: displayColor, color: displayColor }}
                >
                  Apply for a Seat
                </button>
              )}
            </div>

            {showApplyForm && (
              <Card className="mb-4" style={{ borderLeft: `3px solid ${displayColor}` }}>
                <CardContent className="p-5">
                  <div className="font-semibold mb-2">Apply for a Bundestag Seat</div>
                  <textarea
                    value={applyMotivation}
                    onChange={e => setApplyMotivation(e.target.value)}
                    placeholder="Why do you want to represent this party? (20–500 chars)"
                    maxLength={500}
                    rows={3}
                    className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
                  />
                  <input
                    type="text"
                    value={applyFocus}
                    onChange={e => setApplyFocus(e.target.value)}
                    placeholder="Policy focus (optional, e.g. economy, environment)"
                    maxLength={100}
                    className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2"
                  />
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
                          setApplyMsg("Application submitted! You'll be notified of the result.");
                          refresh();
                        } catch (e) {
                          setApplyMsg(e instanceof Error ? e.message : "Failed to submit");
                        } finally {
                          setApplySubmitting(false);
                          setTimeout(() => setApplyMsg(null), 5000);
                        }
                      }}
                      disabled={applySubmitting || applyMotivation.trim().length < 20}
                      className="px-3.5 py-1.5 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                      style={{ background: displayColor }}
                    >
                      {applySubmitting ? "Submitting…" : "Apply"}
                    </button>
                    <button
                      onClick={() => { setShowApplyForm(false); setApplyMotivation(""); setApplyFocus(""); }}
                      className="px-2.5 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
                    >
                      Cancel
                    </button>
                    {applyMsg && <span className={`text-xs ${applyMsg.includes("Failed") ? "text-destructive" : "text-emerald-500"}`}>{applyMsg}</span>}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 border-b-2 border-border">Seat</th>
                      <th className="text-left px-3 py-2 border-b-2 border-border">Member</th>
                      <th className="text-center px-3 py-2 border-b-2 border-border">Type</th>
                      <th className="text-center px-3 py-2 border-b-2 border-border">Discipline</th>
                      <th className="text-center px-3 py-2 border-b-2 border-border">Proxy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {humanSeats.map(seat => (
                      <tr key={seat.id}>
                        <td className="px-3 py-2 border-b border-border font-mono text-xs">#{seat.seatNumber}</td>
                        <td className="px-3 py-2 border-b border-border">
                          {seat.displayName ? (
                            <span className="font-semibold">{seat.displayName}</span>
                          ) : (
                            <span className="text-muted-foreground italic">Open</span>
                          )}
                          {seat.userId === user?.id && <span className="text-xs ml-1.5 text-emerald-600">(You)</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center">
                          <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>MdB</Badge>
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center">
                          {seat.userId && (
                            <Badge variant="outline" className={cn("text-xs", DISCIPLINE_BADGE[seat.disciplineLevel] ?? DISCIPLINE_BADGE[0])}>
                              {DISCIPLINE_LABEL[seat.disciplineLevel] ?? "?"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 border-b border-border text-center text-xs text-muted-foreground">
                          {seat.userId ? (seat.proxyDefault === "party_line" ? "Party Line" : "Abstain") : "—"}
                        </td>
                      </tr>
                    ))}
                    {aiSeats.length > 0 && (
                      <tr>
                        <td className="px-3 py-2 border-b border-border text-muted-foreground" colSpan={5}>
                          + {aiSeats.length} AI-controlled seat{aiSeats.length !== 1 ? "s" : ""}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Approval chart */}
      {history.length >= 2 && (
        <div className="mb-8">
          <h2>Approval Rating History</h2>
          <Card>
            <CardContent className="p-5">
              <ApprovalChart history={history} color={party.color} partyId={party.id} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bills proposed */}
      <div className="mb-8">
        <h2>Bills Proposed ({bills.length})</h2>
        {bills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills proposed yet.</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 border-b-2 border-border">Title</th>
                    <th className="text-left px-3 py-2 border-b-2 border-border">Category</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">Day</th>
                    <th className="text-center px-3 py-2 border-b-2 border-border">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.slice(0, visibleBills).map(b => (
                    <tr key={b.id}>
                      <td className="px-3 py-2 border-b border-border">
                        <Link to={`/bills/${b.id}`} className="text-inherit no-underline hover:text-primary">{b.title}</Link>
                      </td>
                      <td className="px-3 py-2 border-b border-border text-muted-foreground">{b.category}</td>
                      <td className="px-3 py-2 border-b border-border text-center">{b.proposedOnDay}</td>
                      <td className="px-3 py-2 border-b border-border text-center">
                        <Badge variant="outline" className={STATUS_BADGE[b.status] || ""}>{b.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ShowMoreButton
                total={bills.length}
                visible={Math.min(visibleBills, bills.length)}
                increment={5}
                onShowMore={() => setVisibleBills(v => v + 5)}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Voting record */}
      <div className="mb-8">
        <h2>Voting Record ({votes.length})</h2>
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
            <h2>Voting Alignment</h2>
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
            <h2>Policy Focus Areas</h2>
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
        <h2>Statements ({statements.length})</h2>
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
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h2 className="m-0">Member Proposals ({proposals.length})</h2>
          {user?.partyId === id && !showProposalForm && (
            <button
              onClick={() => setShowProposalForm(true)}
              className="px-3.5 py-1 rounded border bg-card font-semibold text-sm cursor-pointer hover:opacity-80"
              style={{ borderColor: displayColor, color: displayColor }}
            >
              + Propose a Bill
            </button>
          )}
        </div>

        {showProposalForm && (
          <Card className="mb-4" style={{ borderLeft: `3px solid ${displayColor}` }}>
            <CardContent className="p-5">
              <div className="font-semibold mb-2">New Member Proposal</div>
              <input
                type="text"
                value={propTitle}
                onChange={e => setPropTitle(e.target.value)}
                placeholder="Bill title (10–120 chars)"
                maxLength={120}
                className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2"
              />
              <textarea
                value={propDesc}
                onChange={e => setPropDesc(e.target.value)}
                placeholder="Brief description (20–300 chars)"
                maxLength={300}
                rows={3}
                className="w-full px-2.5 py-2 rounded border border-input text-sm mb-2 resize-y"
              />
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={propCategory}
                  onChange={e => setPropCategory(e.target.value)}
                  className={SELECT_CLS}
                >
                  {["economy","social","environment","immigration","defense","education","healthcare","infrastructure"].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (propTitle.trim().length < 10 || propDesc.trim().length < 20) return;
                    setPropSubmitting(true);
                    setPropMsg(null);
                    try {
                      await api.createProposal(id!, { title: propTitle.trim(), description: propDesc.trim(), category: propCategory });
                      setPropTitle(""); setPropDesc(""); setPropCategory("economy");
                      setShowProposalForm(false);
                      setPropMsg("Proposal submitted!");
                      api.getPartyProposals(id!).then(setProposals).catch(console.error);
                    } catch (e) {
                      setPropMsg(e instanceof Error ? e.message : "Failed to submit");
                    } finally {
                      setPropSubmitting(false);
                      setTimeout(() => setPropMsg(null), 4000);
                    }
                  }}
                  disabled={propSubmitting || propTitle.trim().length < 10 || propDesc.trim().length < 20}
                  className="px-3.5 py-1.5 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50"
                  style={{ background: displayColor }}
                >
                  {propSubmitting ? "Submitting…" : "Submit"}
                </button>
                <button
                  onClick={() => { setShowProposalForm(false); setPropTitle(""); setPropDesc(""); }}
                  className="px-2.5 py-1.5 rounded border border-input bg-card text-sm cursor-pointer hover:bg-accent"
                >
                  Cancel
                </button>
                {propMsg && <span className={`text-xs ${propMsg.includes("Failed") ? "text-destructive" : "text-emerald-500"}`}>{propMsg}</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {proposals.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            <span>No proposals yet.{user?.partyId === id ? " Be the first to propose a bill!" : " Join this party to propose bills."}</span>
            {user?.partyId !== id && (
              <button
                onClick={() => {
                  if (!user) joinNavigate(`/login?redirect=/parties/${id}`);
                  else document.querySelector(".card")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="text-sm px-3 py-1 rounded border bg-card font-semibold cursor-pointer hover:opacity-80"
                style={{ borderColor: displayColor, color: displayColor }}
              >
                Join {party.name}
              </button>
            )}
          </div>
        ) : (
          <div>
            {proposals.slice(0, 20).map(p => {
              const isOpen = p.status === "open";
              const daysLeft = p.reviewByDay - (simStatus?.currentDay ?? p.createdOnDay);
              return (
                <Card key={p.id} className="mb-2" style={{ opacity: isOpen ? 1 : 0.75 }}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex gap-1.5 flex-wrap items-center mb-1">
                          <span className="font-semibold text-sm">{p.title}</span>
                          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50">{p.category}</Badge>
                          <Badge variant="outline" className={p.proposedBy === "ai"
                            ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          }>
                            {p.proposedBy === "ai" ? "AI" : "Member"}
                          </Badge>
                          <Badge variant="outline" className={PROPOSAL_STATUS[p.status] || ""}>{p.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">{p.description}</div>
                        {p.bundestagBillId && (
                          <div className="text-xs text-emerald-500 mt-1">✓ Submitted to Bundestag</div>
                        )}
                        {p.declineReason && (
                          <div className="text-xs text-muted-foreground mt-1 italic">Party: "{p.declineReason}"</div>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {isOpen && user?.partyId === id ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={async () => {
                                const updated = p.userVote === 1
                                  ? await api.retractProposalVote(p.id)
                                  : await api.voteOnProposal(p.id, 1);
                                setProposals(prev => prev.map(x => x.id === p.id ? updated : x));
                              }}
                              title={p.userVote === 1 ? "Retract upvote" : "Upvote"}
                              className="border-none bg-transparent cursor-pointer text-lg p-0"
                              style={{ color: p.userVote === 1 ? SEMANTIC_HEX.positive : "#aaa" }}
                            >▲</button>
                            <span className="font-bold text-base min-w-7 text-center" style={{ color: p.voteScore >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                              {p.voteScore >= 0 ? "+" : ""}{p.voteScore}
                            </span>
                            <button
                              onClick={async () => {
                                const updated = p.userVote === -1
                                  ? await api.retractProposalVote(p.id)
                                  : await api.voteOnProposal(p.id, -1);
                                setProposals(prev => prev.map(x => x.id === p.id ? updated : x));
                              }}
                              title={p.userVote === -1 ? "Retract downvote" : "Downvote"}
                              className="border-none bg-transparent cursor-pointer text-lg p-0"
                              style={{ color: p.userVote === -1 ? SEMANTIC_HEX.negative : "#aaa" }}
                            >▼</button>
                          </div>
                        ) : (
                          <div className="font-bold text-base" style={{ color: p.voteScore >= 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                            {p.voteScore >= 0 ? "+" : ""}{p.voteScore}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">{p.totalVotes} vote{p.totalVotes !== 1 ? "s" : ""}</div>
                        {isOpen && daysLeft >= 0 && (
                          <div className="text-xs text-muted-foreground">
                            {daysLeft === 0 ? "Reviewed today" : `${daysLeft}d left`}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Ask a Question */}
      <div className="mb-8">
        <h2>Ask {party.name} a Question</h2>
        <Card>
          <CardContent className="p-5">
            <div className="flex gap-2">
              <input
                type="text"
                value={questionText}
                onChange={e => setQuestionText(e.target.value)}
                placeholder="Type your question..."
                maxLength={500}
                className="flex-1 px-3 py-2 rounded border border-input text-sm"
                onKeyDown={e => { if (e.key === "Enter") handleSubmitQuestion(); }}
              />
              <button
                onClick={handleSubmitQuestion}
                disabled={submitting || questionText.trim().length < 5}
                className="px-4 py-2 rounded border-none text-white font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: displayColor }}
              >
                {submitting ? "..." : "Submit"}
              </button>
            </div>
            {submitMsg && (
              <div className={`text-sm mt-1.5 ${submitMsg.includes("Failed") ? "text-destructive" : "text-emerald-500"}`}>
                {submitMsg}
              </div>
            )}
          </CardContent>
        </Card>

        {questions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-base mb-3">Recent Questions ({questions.length})</h3>
            {questions.slice(0, 10).map(q => (
              <Card key={q.id} className="mb-2" style={{ borderLeft: `4px solid ${displayColor}` }}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className={q.status === "pending" ? STATUS_BADGE.pending : STATUS_BADGE.answered}>
                      {q.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">Day {q.createdOnDay}</span>
                  </div>
                  <p className="text-sm italic mb-1.5">{q.question}</p>
                  {q.response && (
                    <div className="bg-muted rounded p-2 px-3 text-sm leading-relaxed">
                      <strong>{party.name}:</strong> {q.response}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
