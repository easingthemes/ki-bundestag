import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type Bill, type Party, type ConstitutionalChallenge, type MdbVoteSummary, type MdbSpeech, type BundestagSeat } from "../api";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, VOTE_COLORS, SEMANTIC_HEX, GOVT_BILL_BADGE, MEMBER_INITIATIVE_BADGE, PRESIDENTIAL_VETO_BADGE, ALERT_STYLES } from "@/lib/colors";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { usePolling } from "../usePolling";
import { VoteBar } from "@/components/VoteBar";
import { BillImpactDisplay } from "@/components/bills/BillImpactDisplay";
import { MdbVoteButtons } from "@/components/bills/MdbVoteButtons";
import { SpeechDisplay } from "@/components/bills/SpeechDisplay";
import { SpeechSubmitForm } from "@/components/bills/SpeechSubmitForm";

const STATUS_LABELS: Record<string, string> = {
  third_reading: "Third Reading",
  second_reading: "Second Reading",
  committee: "Committee",
  first_reading: "First Reading",
  proposed: "Proposed",
  passed: "Passed",
  rejected: "Rejected",
  debate: "Debate",
  struck_down: "Struck Down",
};

const PIPELINE_STAGES = [
  { key: "proposed", label: "Proposed", idx: 0 },
  { key: "first_reading", label: "1st Reading", idx: 1 },
  { key: "committee", label: "Committee", idx: 2 },
  { key: "second_reading", label: "2nd Reading", idx: 3 },
  { key: "third_reading", label: "3rd Reading", idx: 4 },
  { key: "final", label: "Final", idx: 5 },
];

const STAGE_ORDER: Record<string, number> = {
  proposed: 0,
  first_reading: 1,
  committee: 2,
  second_reading: 3,
  third_reading: 4,
  passed: 5,
  rejected: 5,
  struck_down: 5,
};

export function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const [bill, setBill] = useState<Bill | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [challenge, setChallenge] = useState<ConstitutionalChallenge | null>(null);
  const [signals, setSignals] = useState<{ yes: number; no: number; userSignal: "yes" | "no" | null } | null>(null);
  const [mdbVotes, setMdbVotes] = useState<MdbVoteSummary | null>(null);
  const [speeches, setSpeeches] = useState<MdbSpeech[]>([]);
  const [mdbError, setMdbError] = useState<string | null>(null);
  const [mySeat, setMySeat] = useState<BundestagSeat | null>(null);

  useEffect(() => {
    if (user) api.getMySeat().then(r => setMySeat(r.seat)).catch(() => {});
  }, [user]);

  const refresh = useCallback(() => {
    if (!id) return;
    api.getBill(id).then(b => {
      setBill(b);
      if (["second_reading", "third_reading", "passed", "rejected", "struck_down"].includes(b.status)) {
        api.getBillSignals(id).then(setSignals).catch(console.error);
      }
      if (["third_reading", "passed", "rejected", "struck_down"].includes(b.status)) {
        api.getMdbVotes(id).then(setMdbVotes).catch(() => {});
      }
      if (["first_reading", "second_reading", "third_reading"].includes(b.status)) {
        api.getSpeeches(id).then(r => setSpeeches(r.speeches)).catch(() => {});
      }
    }).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getConstitutionalChallenges(undefined, id).then(list => {
      setChallenge(list[0] ?? null);
    }).catch(console.error);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (!bill || parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));
  const proposer = partyMap.get(bill.proposedBy);
  const displayColor = proposer?.color === "#FFED00" ? "#c4a900" : (proposer?.color ?? "#888");

  const currentStageIdx = STAGE_ORDER[bill.status] ?? 0;
  const isFinalStatus = bill.status === "passed" || bill.status === "rejected" || bill.status === "struck_down";

  const totalSeats = bill.votes.reduce((sum, v) => sum + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const yesSeats = bill.votes.filter(v => v.vote === "yes").reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const noSeats = bill.votes.filter(v => v.vote === "no").reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const abstainSeats = bill.votes.filter(v => v.vote === "abstain").reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);

  const amendments = bill.amendments ?? [];

  return (
    <div>
      {/* Back link */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to="/bills" style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}>
          &larr; Alle Gesetze
        </Link>
      </div>

      {/* Header */}
      <Card className="mb-6" style={{ borderLeft: `4px solid ${displayColor}` }}><CardContent className="p-5">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", flex: 1, minWidth: 0 }}>{bill.title}</h1>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
            {bill.isGovernmentBill && <Badge variant="outline" className={GOVT_BILL_BADGE}>Govt. Bill</Badge>}
            {bill.memberInitiative && <Badge className={MEMBER_INITIATIVE_BADGE}>Member Initiative</Badge>}
            {bill.vetoedByPresident && <Badge variant="outline" className={PRESIDENTIAL_VETO_BADGE}>Vetoed by President</Badge>}
            <Badge variant="outline" className={STATUS_BADGE[bill.status] || ""}>
              {STATUS_LABELS[bill.status] ?? bill.status}
            </Badge>
          </div>
        </div>
        <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#666" }}>
          <span style={{ textTransform: "capitalize" }}>{bill.category}</span>
          {" · Proposed by "}
          <Link to={`/parties/${bill.proposedBy}`} style={{ color: displayColor, fontWeight: 600, textDecoration: "none" }}>
            {proposer?.name ?? bill.proposedBy}
          </Link>
          {" on Day "}{bill.proposedOnDay}
          {bill.memberInitiative && bill.proposerDisplayName && (
            <span style={{ marginLeft: 8, color: "#6f42c1", fontWeight: 500 }}>
              · Originally proposed by {bill.proposerDisplayName}
            </span>
          )}
        </div>
      </CardContent></Card>

      {/* Outcome banner — user signal */}
      {user && bill && (bill.status === "passed" || bill.status === "rejected") && signals?.userSignal && (
        <div className={cn(
          "rounded-md border px-4 py-3 text-sm mb-4",
          bill.status === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
        )}>
          You signaled <strong>{signals.userSignal.toUpperCase()}</strong> on this bill. It was <strong>{bill.status.toUpperCase()}</strong>
          {bill.votes.length > 0 && ` with ${bill.votes.reduce((s: number, v: { vote: string; partyId: string }) => s + (v.vote === "yes" ? (partyMap.get(v.partyId)?.seatCount ?? 0) : 0), 0)} yes votes`}.
        </div>
      )}

      {/* Outcome banner — MdB vote */}
      {user && bill && (bill.status === "passed" || bill.status === "rejected") && mdbVotes?.userVote && (
        <div className={cn(
          "rounded-md border px-4 py-3 text-sm mb-4",
          bill.status === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
        )}>
          You voted <strong>{mdbVotes.userVote.toUpperCase()}</strong> as an MdB on this bill. It was <strong>{bill.status.toUpperCase()}</strong>.
        </div>
      )}

      {/* Description */}
      <div className="mb-6">
        <h2 className="section-title">Beschreibung</h2>
        <Card><CardContent className="p-5">
          <p style={{ fontSize: "0.95rem", color: "#333", lineHeight: 1.6, margin: 0 }}>{bill.description}</p>
        </CardContent></Card>
      </div>

      {/* Member Signals */}
      {(bill.status === "second_reading" || bill.status === "third_reading") && (
        <div id="member-signals" className="mb-6">
          <h2 className="section-title">Mitglieder-Signale</h2>
          {user && user.partyId && signals && signals.userSignal === null && (
            <div className={ALERT_STYLES.info}>
              This bill is in {STATUS_LABELS[bill.status] ?? bill.status} — signal your position to influence your party's vote.
            </div>
          )}
          <Card><CardContent className="p-5">
            {signals ? (() => {
              const total = signals.yes + signals.no;
              const yesPct = total > 0 ? Math.round(signals.yes / total * 100) : 0;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
                    <div style={{ flex: 1, background: "var(--color-muted)", borderRadius: 4, height: 14, overflow: "hidden" }}>
                      {total > 0 && (
                        <div style={{ width: `${yesPct}%`, height: "100%", background: SEMANTIC_HEX.positive, borderRadius: "4px 0 0 4px" }} />
                      )}
                    </div>
                    <div style={{ flexShrink: 0, fontSize: "0.85rem", color: "#555" }}>
                      <strong style={{ color: SEMANTIC_HEX.positive }}>{signals.yes} YES</strong>
                      {" / "}
                      <strong style={{ color: SEMANTIC_HEX.negative }}>{signals.no} NO</strong>
                      {total > 0 && <span style={{ color: SEMANTIC_HEX.neutral, marginLeft: 4 }}>({yesPct}% YES)</span>}
                    </div>
                  </div>
                  {user && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={async () => {
                          const s = await api.signalBill(bill.id, "yes");
                          setSignals(s);
                        }}
                        style={{ padding: "5px 14px", borderRadius: 4, border: `2px solid ${signals.userSignal === "yes" ? SEMANTIC_HEX.positive : "#ddd"}`, background: signals.userSignal === "yes" ? "var(--color-emerald-50, #ecfdf5)" : "white", color: SEMANTIC_HEX.positive, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
                      >YES</button>
                      <button
                        onClick={async () => {
                          const s = await api.signalBill(bill.id, "no");
                          setSignals(s);
                        }}
                        style={{ padding: "5px 14px", borderRadius: 4, border: `2px solid ${signals.userSignal === "no" ? SEMANTIC_HEX.negative : "#ddd"}`, background: signals.userSignal === "no" ? "#f8d7da" : "white", color: SEMANTIC_HEX.negative, fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
                      >NO</button>
                      <span style={{ fontSize: "0.78rem", color: SEMANTIC_HEX.neutral }}>Your signal is visible to the party AI when it votes.</span>
                    </div>
                  )}
                  {!user && total === 0 && (
                    <div style={{ fontSize: "0.85rem", color: SEMANTIC_HEX.neutral }}>
                      <Link to="/parties" style={{ color: displayColor }}>Join a party</Link> to signal your vote on this bill.
                    </div>
                  )}
                </div>
              );
            })() : (
              <div style={{ fontSize: "0.85rem", color: SEMANTIC_HEX.neutral }}>No signals yet.{" "}
                {user ? "" : <><Link to="/parties" style={{ color: displayColor }}>Join a party</Link> to signal your opinion.</>}
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

      {/* MdB Direct Votes */}
      {bill.status === "third_reading" && (
        <MdbVoteButtons
          billId={bill.id}
          userSeat={user ? mySeat : null}
          mdbVotes={mdbVotes}
          onVoted={setMdbVotes}
          onError={msg => { setMdbError(msg); setTimeout(() => setMdbError(null), 3000); }}
        />
      )}
      {mdbError && <div className="text-xs text-destructive mb-3">{mdbError}</div>}

      {/* MdB Speeches */}
      {["first_reading", "second_reading", "third_reading"].includes(bill.status) && (
        <div id="speeches" className="mb-6">
          <h2 className="section-title">MdB-Reden ({speeches.length})</h2>
          {user && mySeat && (
            <SpeechSubmitForm
              billId={bill.id}
              billStatus={bill.status}
              displayColor={displayColor}
              userSeat={mySeat}
              onSubmitted={refresh}
            />
          )}
          <SpeechDisplay speeches={speeches} />
        </div>
      )}

      {/* Legislative Pipeline */}
      <div className="mb-6">
        <h2 className="section-title">Gesetzgebungsverfahren</h2>
        <Card><CardContent className="p-5">
          {bill.isGovernmentBill && (
            <div className="text-sm text-amber-700 mb-3 bg-amber-50 px-2 py-1 rounded inline-block">
              Government bill — fast-tracked (1st reading skipped)
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.25rem" }}>
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCurrent = stage.key === "final"
                ? isFinalStatus
                : bill.status === stage.key;
              const stageIdx = stage.idx;
              const isPast = !isCurrent && stageIdx < currentStageIdx;
              const isFuture = !isCurrent && stageIdx > currentStageIdx;
              const isSkipped = stage.key === "first_reading" && bill.isGovernmentBill;
              const displayLabel = stage.key === "final" && isCurrent
                ? (STATUS_LABELS[bill.status] ?? "Final")
                : stage.label;

              return (
                <span key={stage.key} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  {idx > 0 && (
                    <span style={{ color: "#ccc", fontSize: "0.9rem" }}>›</span>
                  )}
                  <span style={{
                    fontWeight: isCurrent ? 700 : 400,
                    color: isCurrent ? "#1a1a2e"
                      : isPast ? "#666"
                      : isFuture ? "#bbb"
                      : "#bbb",
                    fontSize: "0.85rem",
                    textDecoration: isSkipped ? "line-through" : "none",
                    padding: isCurrent ? "2px 7px" : "2px 4px",
                    background: isCurrent ? "#e8f0fe" : "transparent",
                    borderRadius: 4,
                  }}>
                    {displayLabel}
                  </span>
                </span>
              );
            })}
          </div>
        </CardContent></Card>
      </div>

      {/* Committee */}
      {bill.committeeName && (
        <div className="mb-6">
          <h2 className="section-title">Ausschussprüfung</h2>
          <Card><CardContent className="p-5">
            <div style={{ fontWeight: 600 }}>{bill.committeeName}</div>
            {bill.committeeRecommendation && (
              <div style={{ marginTop: "0.25rem", fontSize: "0.9rem" }}>
                Recommendation:{" "}
                <span style={{
                  fontWeight: 600,
                  color: bill.committeeRecommendation === "pass" ? "#155724"
                    : bill.committeeRecommendation === "reject" ? "#721c24"
                    : "#856404",
                }}>
                  {bill.committeeRecommendation}
                </span>
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

      {/* Amendments */}
      {amendments.length > 0 && (
        <div className="mb-6">
          <h2 className="section-title">Änderungsanträge ({amendments.length})</h2>
          {amendments.map(a => {
            const amendProposer = partyMap.get(a.proposedBy);
            const amendColor = amendProposer?.color === "#FFED00" ? "#c4a900" : (amendProposer?.color ?? "#888");
            const aTotal = a.votes.reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
            const aYes = a.votes.filter(v => v.vote === "yes").reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
            const aNo = a.votes.filter(v => v.vote === "no").reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);

            return (
              <Card key={a.id} className="mb-3" style={{ borderLeft: `3px solid ${amendColor}` }}><CardContent className="p-5">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: "0.95rem" }}>{a.title}</strong>
                  <Badge variant="outline" className={a.accepted ? STATUS_BADGE.passed : STATUS_BADGE.rejected}>
                    {a.accepted ? "Accepted" : "Rejected"}
                  </Badge>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#888", marginTop: 2 }}>
                  Proposed by{" "}
                  <Link to={`/parties/${a.proposedBy}`} style={{ color: amendColor, fontWeight: 600, textDecoration: "none" }}>
                    {amendProposer?.name ?? a.proposedBy}
                  </Link>
                </div>
                <div style={{ fontSize: "0.9rem", color: "#555", marginTop: "0.5rem" }}>{a.description}</div>
                {a.votes.length > 0 && aTotal > 0 && (
                  <div className="mt-2">
                    <VoteBar yes={aYes} no={aNo} abstain={0} total={aTotal} showCounts />
                  </div>
                )}
              </CardContent></Card>
            );
          })}
        </div>
      )}

      {/* Economic Effects */}
      <BillImpactDisplay bill={bill} />

      {/* Final Vote */}
      {bill.votes.length > 0 && totalSeats > 0 && (
        <div className="mb-6">
          <h2 className="section-title">Schlussabstimmung</h2>
          <Card><CardContent className="p-5">
            <div className="my-2">
              <VoteBar yes={yesSeats} no={noSeats} abstain={abstainSeats} total={totalSeats} showCounts />
            </div>
            <div className="mb-3" />
            {bill.votes.map(v => {
              const p = partyMap.get(v.partyId);
              return (
                <div key={v.partyId} className="flex items-center gap-2 text-sm py-1">
                  <span className={cn("size-2.5 rounded-full shrink-0", VOTE_COLORS[v.vote as keyof typeof VOTE_COLORS])} />
                  <Link to={`/parties/${v.partyId}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>
                    {p?.name ?? v.partyId}
                  </Link>
                  <span style={{ color: "#666" }}>— {v.reason}</span>
                </div>
              );
            })}
          </CardContent></Card>
        </div>
      )}

      {/* Constitutional Challenge */}
      {challenge && (
        <div className="mb-6">
          <h2 className="section-title">Verfassungsbeschwerde</h2>
          <Card className={cn(
            challenge.decision === "struck_down" ? "border-red-300 bg-red-50/50"
            : challenge.decision === "upheld" ? "border-emerald-300 bg-emerald-50/50"
            : "border-amber-300 bg-amber-50/50"
          )}><CardContent className="p-5">
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600 }}>
                Filed by {partyMap.get(challenge.filedByPartyId)?.name ?? challenge.filedByPartyId}
              </span>
              {challenge.decision === "struck_down" && <Badge variant="outline" className={STATUS_BADGE.struck_down}>Struck Down</Badge>}
              {challenge.decision === "upheld" && <Badge variant="outline" className={STATUS_BADGE.upheld}>Upheld</Badge>}
              {!challenge.decision && <Badge variant="outline" className={STATUS_BADGE.pending}>Pending</Badge>}
              <span style={{ fontSize: "0.8rem", color: "#888" }}>Day {challenge.dayNumber}</span>
            </div>
            <div style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              <strong>Arguments:</strong>
              <p style={{ margin: "0.25rem 0 0", color: "#333", lineHeight: 1.5 }}>{challenge.arguments}</p>
            </div>
            {challenge.reasoning && (
              <div style={{ fontSize: "0.9rem" }}>
                <strong>Court Reasoning:</strong>
                <p style={{ margin: "0.25rem 0 0", color: "#444", fontStyle: "italic", lineHeight: 1.5 }}>{challenge.reasoning}</p>
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

      {/* Presidential Veto */}
      {bill.vetoedByPresident && (
        <div className="mb-6">
          <Card className="border-amber-300 bg-amber-50"><CardContent className="p-5">
            <strong>Vetoed by the Bundespräsident</strong>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }} className="text-amber-700">
              The Federal President has refused to sign this bill into law.
            </p>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
