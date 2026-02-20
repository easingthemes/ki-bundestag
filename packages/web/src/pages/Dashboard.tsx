import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Bill, type Crisis, type Election, type Government, type MediaArticle, type NationalState, type Party, type Poll, type SimulationEvent, type SimulationStatus } from "../api";
import { usePolling } from "../usePolling";
import { Button, SkeletonCard, SkeletonTitle } from "../components/ui";
import { useUser } from "../userContext";

const MOOD_COLORS: Record<string, string> = {
  "Stable Majority": "#28a745",
  "Coalition Friction": "#fd7e14",
  "Political Pressure": "#dc3545",
  "Crisis Response": "#dc3545",
  "Electoral Campaign": "#007bff",
  "Budget Dispute": "#ffc107",
  "Government Transition": "#6f42c1",
};

const OUTLET_STYLE: Record<string, { color: string; label: string }> = {
  "Berliner Tagesspiegel": { color: "#004b91", label: "Tagesspiegel" },
  "Volksstimme": { color: "#c0392b", label: "Volksstimme" },
  "Wirtschaftswoche": { color: "#2c3e50", label: "WiWo" },
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

  const refreshCore = useCallback(() => {
    api.getState().then(setState).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getEvents(3).then(r => setEvents(r.events)).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
    api.getPolls(true).then(setPolls).catch(console.error);
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
        <div className="grid grid-2" style={{ marginBottom: "2rem" }}>
          <SkeletonCard /><SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
  const sentimentColor = state.publicSentiment > 60 ? "#28a745" : state.publicSentiment > 40 ? "#ffc107" : "#dc3545";
  const MAJORITY = 368;
  const coalitionPartyList = parties.filter(p => state.coalitionParties.includes(p.id) && p.seatCount > 0);
  const oppositionPartyList = parties.filter(p => state.oppositionParties.includes(p.id) && p.seatCount > 0);
  const coalitionSeats = coalitionPartyList.reduce((s, p) => s + p.seatCount, 0);
  const oppositionSeats = oppositionPartyList.reduce((s, p) => s + p.seatCount, 0);
  const hasMajority = coalitionSeats >= MAJORITY;
  const majorityPct = totalSeats > 0 ? (MAJORITY / totalSeats) * 100 : 50;

  // Featured: Decision of the Month — bill with most total votes (seats) in last 30 days
  const recentBills = bills.filter(b =>
    b.votes.length > 0 && b.proposedOnDay >= simStatus.currentDay - 30
  );
  const decisionOfMonth = recentBills.length > 0
    ? recentBills.reduce((best, b) => {
        const total = b.votes.reduce((s, v) => {
          const p = parties.find(pp => pp.id === v.partyId);
          return s + (p?.seatCount ?? 0);
        }, 0);
        const bestTotal = best.votes.reduce((s, v) => {
          const p = parties.find(pp => pp.id === v.partyId);
          return s + (p?.seatCount ?? 0);
        }, 0);
        return total > bestTotal ? b : best;
      })
    : null;

  // Featured: Politician of the Month — party with biggest approval gain (from recentApprovals)
  const politicianOfMonth = parties
    .filter(p => p.seatCount > 0 && p.recentApprovals && p.recentApprovals.length >= 2)
    .map(p => ({
      party: p,
      delta: p.recentApprovals[p.recentApprovals.length - 1] - p.recentApprovals[0],
    }))
    .sort((a, b) => b.delta - a.delta)[0] ?? null;

  // Media highlights — latest 2
  const latestMedia = [...media].sort((a, b) => b.dayNumber - a.dayNumber).slice(0, 2);

  // Parse daily summary
  let narrative = simStatus.dailySummary ?? "";
  let mood: string | null = null;
  if (simStatus.dailySummary) {
    try {
      const parsed = JSON.parse(simStatus.dailySummary) as { narrative?: string; mood?: string };
      if (typeof parsed.narrative === "string") narrative = parsed.narrative;
      if (typeof parsed.mood === "string") mood = parsed.mood;
    } catch { /* old plain-text */ }
  }
  const moodColor = mood ? (MOOD_COLORS[mood] ?? "#666") : null;

  return (
    <div>
      <h1>Dashboard — Day {simStatus.currentDay}</h1>

      {/* Hero summary */}
      {narrative && (
        <div className="dash-hero">
          <div className="dash-hero-label">
            Today in the Bundestag
            {mood && moodColor && (
              <span className="dash-mood-pill" style={{ background: moodColor }}>{mood}</span>
            )}
          </div>
          <p className="dash-hero-text">{narrative}</p>
        </div>
      )}

      {/* Provisional budget banner */}
      {state.provisionalBudget && (
        <div className="dash-alert">
          <strong>Provisional Budget Active</strong> — operating under Art. 111 GG.
          {simStatus.budgetRetryDay != null && (
            <span style={{ marginLeft: 6 }}>Revised vote on Day {simStatus.budgetRetryDay}.</span>
          )}
        </div>
      )}

      {/* === 2-column grid === */}
      <div className="dash-grid">

        {/* ── Main column ── */}
        <div className="dash-main">

          {/* Bundestag composition */}
          <div className="section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0 }}>Bundestag</h2>
              <span style={{ fontSize: "0.78rem", color: "#888" }}>{totalSeats} seats · majority {MAJORITY}</span>
            </div>

            {/* Seat bar */}
            <div style={{ position: "relative", marginBottom: "0.25rem" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${majorityPct}%`, width: 2, background: "#333", zIndex: 2 }} />
              <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", gap: 2 }}>
                <div style={{ display: "flex", flex: `0 0 ${(coalitionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {coalitionPartyList.map(p => (
                    <div key={p.id} style={{
                      flex: p.seatCount, backgroundColor: fixColor(p.color),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.68rem", color: "white", fontWeight: 600,
                      overflow: "hidden", whiteSpace: "nowrap",
                    }}>
                      {p.seatCount > 50 ? `${p.name} ${p.seatCount}` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
                <div style={{ flex: "0 0 2px", background: "#fff" }} />
                <div style={{ display: "flex", flex: `0 0 ${(oppositionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {oppositionPartyList.map(p => (
                    <div key={p.id} style={{
                      flex: p.seatCount, backgroundColor: `${fixColor(p.color)}99`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.68rem", color: "#333", fontWeight: 600,
                      overflow: "hidden", whiteSpace: "nowrap",
                    }}>
                      {p.seatCount > 50 ? `${p.name} ${p.seatCount}` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ position: "relative", height: 14, marginBottom: "0.5rem" }}>
              <div style={{ position: "absolute", left: `${majorityPct}%`, transform: "translateX(-50%)", fontSize: "0.65rem", color: "#555", whiteSpace: "nowrap" }}>
                ▲ {MAJORITY}
              </div>
            </div>

            {/* Coalition / Opposition chips */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <div>
                <div className="dash-chip-label" style={{ color: "#28a745" }}>
                  Coalition
                  <span style={{ marginLeft: 4, fontWeight: 700, fontSize: "0.78rem", color: hasMajority ? "#28a745" : "#dc3545" }}>
                    {coalitionSeats} {hasMajority ? "✓" : "✗"}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {coalitionPartyList.map(p => (
                    <span key={p.id} className="dash-party-chip" style={{ borderColor: fixColor(p.color), background: `${fixColor(p.color)}18` }}>
                      <span className="dash-party-dot" style={{ backgroundColor: fixColor(p.color) }} />
                      {p.name} <span className="dash-party-seats">{p.seatCount}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className="dash-chip-label" style={{ color: "#888" }}>
                  Opposition <span style={{ marginLeft: 4, fontWeight: 600, fontSize: "0.78rem", color: "#555" }}>{oppositionSeats}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {oppositionPartyList.map(p => (
                    <span key={p.id} className="dash-party-chip" style={{ borderColor: "#ccc", background: "#f8f8f8", color: "#444" }}>
                      <span className="dash-party-dot" style={{ backgroundColor: fixColor(p.color) }} />
                      {p.name} <span className="dash-party-seats">{p.seatCount}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {state.coalitionCohesion != null && (
              <div style={{ marginTop: "0.6rem", paddingTop: "0.5rem", borderTop: "1px solid #eee", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "#888" }}>Cohesion:</span>
                <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 5, maxWidth: 100 }}>
                  <div style={{
                    width: `${state.coalitionCohesion}%`, height: "100%", borderRadius: 4,
                    background: state.coalitionCohesion >= 90 ? "#28a745" : state.coalitionCohesion >= 70 ? "#fd7e14" : "#dc3545",
                  }} />
                </div>
                <span style={{ fontWeight: 600, color: state.coalitionCohesion >= 90 ? "#28a745" : state.coalitionCohesion >= 70 ? "#fd7e14" : "#dc3545" }}>
                  {state.coalitionCohesion}%
                </span>
              </div>
            )}
          </div>

          {/* Economy */}
          <div className="section">
            <h2>Economy</h2>
            <div className="grid grid-4">
              {[
                { v: `${state.economy.gdpGrowth}%`, l: "GDP Growth", c: state.economy.gdpGrowth >= 0 ? "#28a745" : "#dc3545" },
                { v: `${state.economy.unemployment}%`, l: "Unemployment", c: state.economy.unemployment > 8 ? "#dc3545" : "#555" },
                { v: `${state.economy.inflation}%`, l: "Inflation", c: state.economy.inflation > 3 ? "#dc3545" : "#555" },
                { v: `${state.economy.budget}B`, l: "Budget (EUR)", c: "#555" },
              ].map(s => (
                <div key={s.l} className="card">
                  <div className="stat-value" style={{ color: s.c }}>{s.v}</div>
                  <div className="stat-label">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Latest Events */}
          <div className="section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>Latest Events</h2>
              <Link to="/news" style={{ fontSize: "0.8rem", color: "var(--color-primary)" }}>View all →</Link>
            </div>
            <div className="card" style={{ marginTop: "0.5rem" }}>
              {events.length === 0 ? (
                <div className="loading">No events yet.</div>
              ) : events.map(ev => (
                <div key={ev.id} className="event-item">
                  <div className="event-type">#{ev.dayNumber} · {ev.type.replace(/_/g, " ")}</div>
                  <div className="event-title">{ev.title}</div>
                  <div className="event-desc">{ev.description}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Media Highlights */}
          {latestMedia.length > 0 && (
            <div className="section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <h2 style={{ margin: 0 }}>Media Highlights</h2>
                <Link to="/media" style={{ fontSize: "0.8rem", color: "var(--color-primary)" }}>All articles →</Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                {latestMedia.map(a => {
                  const outlet = OUTLET_STYLE[a.outlet] ?? { color: "#555", label: a.outlet };
                  return (
                    <div key={a.id} className="card" style={{ borderLeft: `3px solid ${outlet.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: outlet.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {outlet.label}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#888" }}>Day {a.dayNumber}</span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "0.92rem", lineHeight: 1.4 }}>{a.headline}</div>
                      <div style={{ fontSize: "0.82rem", color: "#555", marginTop: 4, lineHeight: 1.5 }}>
                        {a.summary.length > 140 ? a.summary.slice(0, 140) + "..." : a.summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="dash-sidebar">

          {/* Chancellor card */}
          {government && (() => {
            const cp = parties.find(p => p.id === government.chancellorPartyId);
            return (
              <div className="card" style={{ borderLeft: `3px solid ${fixColor(cp?.color || "#333")}` }}>
                <div style={{ fontSize: "0.65rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Bundeskanzler/in</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{government.chancellorName}</div>
                <div style={{ fontSize: "0.82rem", color: "#555" }}>
                  {cp?.name ?? government.chancellorPartyId}
                  <span style={{ fontSize: "0.72rem", color: "#888", marginLeft: 6 }}>since Day {government.formedOnDay}</span>
                </div>
              </div>
            );
          })()}

          {/* Engagement CTAs */}
          <div className="dash-cta-stack">
            {!user ? (
              <Link to="/parties" className="dash-cta-card">
                <span className="dash-cta-title">Join a Party</span>
                <span className="dash-cta-desc">Register and become a member</span>
              </Link>
            ) : user.partyId ? (
              <Link to={`/parties/${user.partyId}`} className="dash-cta-card">
                <span className="dash-cta-title">Your Party</span>
                <span className="dash-cta-desc">{parties.find(p => p.id === user.partyId)?.name ?? user.partyId}</span>
              </Link>
            ) : (
              <Link to="/parties" className="dash-cta-card">
                <span className="dash-cta-title">Join a Party</span>
                <span className="dash-cta-desc">Pick a party to participate</span>
              </Link>
            )}
            {polls.length > 0 && (
              <Link to="/polls" className="dash-cta-card">
                <span className="dash-cta-title">Vote on Polls</span>
                <span className="dash-cta-desc">{polls.length} active poll{polls.length !== 1 ? "s" : ""}</span>
              </Link>
            )}
            <Link to="/referendums" className="dash-cta-card">
              <span className="dash-cta-title">Referendums</span>
              <span className="dash-cta-desc">Vote on national questions</span>
            </Link>
          </div>

          {/* Public Sentiment */}
          <div className="card">
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 6 }}>
              Public Sentiment
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", color: sentimentColor }}>{state.publicSentiment}</div>
              <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 6 }}>
                <div style={{ width: `${state.publicSentiment}%`, height: "100%", borderRadius: 4, backgroundColor: sentimentColor }} />
              </div>
              <span style={{ fontSize: "0.72rem", color: "#888" }}>/100</span>
            </div>
          </div>

          {/* Active Crises */}
          {crises.length > 0 && (
            <div className="card">
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#dc3545", marginBottom: 6 }}>
                Active Crises
              </div>
              {crises.map(c => (
                <div key={c.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.name}</span>
                    <span className={`badge badge-crisis-${c.severity}`}>{c.severity}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#888" }}>{c.category} · Day {c.startDay}–{c.endDay}</div>
                </div>
              ))}
            </div>
          )}

          {/* Active Election */}
          {election && (
            <div className="card" style={{ borderLeft: "3px solid #007bff" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#007bff", marginBottom: 4 }}>
                Election
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span className={`badge badge-crisis-${election.status === "campaign" ? "high" : "medium"}`}>{election.status}</span>
                <span style={{ fontSize: "0.8rem" }}>Day {election.electionDay}</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "#555" }}>{election.triggerReason}</div>
              {election.electionDay - simStatus.currentDay > 0 && (
                <div style={{ marginTop: 4, fontWeight: 600, fontSize: "0.85rem" }}>
                  {election.electionDay - simStatus.currentDay} days until vote
                </div>
              )}
              <Link to="/elections" style={{ fontSize: "0.78rem", color: "var(--color-primary)", marginTop: 4, display: "inline-block" }}>Details →</Link>
            </div>
          )}

          {/* Ask a Party widget (compact) */}
          {parties.length > 0 && (
            <AskPartyWidget parties={parties} coalitionParties={state.coalitionParties} />
          )}
        </div>
      </div>

      {/* === Featured section (full width) === */}
      {(decisionOfMonth || politicianOfMonth) && (
        <div className="dash-featured">
          {decisionOfMonth && (() => {
            const proposer = parties.find(p => p.id === decisionOfMonth.proposedBy);
            const yesSeats = decisionOfMonth.votes.filter(v => v.vote === "yes").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const noSeats = decisionOfMonth.votes.filter(v => v.vote === "no").reduce((s, v) => s + (parties.find(p => p.id === v.partyId)?.seatCount ?? 0), 0);
            const total = yesSeats + noSeats;
            return (
              <div className="card dash-featured-card">
                <div className="dash-featured-label">Decision of the Month</div>
                <Link to={`/bills/${decisionOfMonth.id}`} style={{ fontWeight: 700, fontSize: "1rem", color: "inherit", textDecoration: "none" }}>
                  {decisionOfMonth.title}
                </Link>
                <div style={{ fontSize: "0.82rem", color: "#555", marginTop: 4 }}>
                  {decisionOfMonth.category} · by {proposer?.name ?? decisionOfMonth.proposedBy}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: 8 }}>
                  <span className={`badge ${decisionOfMonth.status === "passed" ? "badge-passed" : decisionOfMonth.status === "rejected" ? "badge-rejected" : "badge-debate"}`}>
                    {decisionOfMonth.status}
                  </span>
                  {total > 0 && (
                    <span style={{ fontSize: "0.78rem", color: "#555" }}>
                      Yes {yesSeats} · No {noSeats}
                    </span>
                  )}
                </div>
                {total > 0 && (
                  <div className="vote-bar" style={{ marginTop: 6, height: 6 }}>
                    <div className="vote-bar-yes" style={{ width: `${(yesSeats / total) * 100}%` }} />
                    <div className="vote-bar-no" style={{ width: `${(noSeats / total) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })()}
          {politicianOfMonth && (
            <div className="card dash-featured-card">
              <div className="dash-featured-label">Party of the Month</div>
              <Link to={`/parties/${politicianOfMonth.party.id}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: fixColor(politicianOfMonth.party.color), flexShrink: 0 }} />
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>{politicianOfMonth.party.name}</span>
              </Link>
              <div style={{ fontSize: "0.82rem", color: "#555", marginTop: 4 }}>
                Current approval: {politicianOfMonth.party.approvalRating.toFixed(1)}%
              </div>
              <div style={{
                marginTop: 6, fontWeight: 700, fontSize: "1.1rem",
                color: politicianOfMonth.delta > 0 ? "#28a745" : politicianOfMonth.delta < 0 ? "#dc3545" : "#888",
              }}>
                {politicianOfMonth.delta > 0 ? "+" : ""}{politicianOfMonth.delta.toFixed(1)}
                <span style={{ fontWeight: 400, fontSize: "0.78rem", color: "#888", marginLeft: 4 }}>
                  approval change (recent)
                </span>
              </div>
            </div>
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
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Ask a Party</span>
        <Link to="/questions" style={{ fontSize: "0.75rem", color: "var(--color-primary)" }}>Questions →</Link>
      </div>
      <select
        value={selectedPartyId}
        onChange={e => setSelectedPartyId(e.target.value)}
        className="form-control"
        style={{ width: "100%", marginBottom: 6 }}
        aria-label="Select party"
      >
        {seatedParties.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          placeholder="5–140 chars"
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          maxLength={140}
          className="form-control"
          style={{ flex: 1 }}
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
        <div className="toast-success" style={{ marginTop: 6, padding: "6px 10px", borderRadius: "var(--radius-sm)", position: "relative", fontSize: "0.82rem" }}>
          Submitted! Check Questions page.
        </div>
      )}
      {submitStatus === "error" && (
        <div className="toast-error" style={{ marginTop: 6, padding: "6px 10px", borderRadius: "var(--radius-sm)", position: "relative", fontSize: "0.82rem" }}>{errorMsg}</div>
      )}
    </div>
  );
}
