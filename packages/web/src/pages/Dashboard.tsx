import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Crisis, type Election, type Government, type NationalState, type Party, type SimulationEvent, type SimulationStatus } from "../api";
import { usePolling } from "../usePolling";

const MOOD_COLORS: Record<string, string> = {
  "Stable Majority": "#28a745",
  "Coalition Friction": "#fd7e14",
  "Political Pressure": "#dc3545",
  "Crisis Response": "#dc3545",
  "Electoral Campaign": "#007bff",
  "Budget Dispute": "#ffc107",
  "Government Transition": "#6f42c1",
};

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
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Ask a Party</span>
        <Link to="/questions" style={{ fontSize: "0.8rem", color: "#004b91" }}>→ Questions</Link>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={selectedPartyId}
          onChange={e => setSelectedPartyId(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.85rem", background: "white" }}
        >
          {seatedParties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Your question (5–140 chars)"
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          maxLength={140}
          style={{
            flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: 4,
            border: "1px solid #ccc", fontSize: "0.85rem",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitStatus === "submitting" || questionText.length < 5}
          style={{
            padding: "6px 14px", borderRadius: 4, border: "none", cursor: "pointer",
            background: "#004b91", color: "white", fontSize: "0.85rem", fontWeight: 600,
            opacity: (submitStatus === "submitting" || questionText.length < 5) ? 0.6 : 1,
          }}
        >
          {submitStatus === "submitting" ? "Sending…" : "Ask"}
        </button>
      </div>
      {submitStatus === "success" && (
        <div style={{ marginTop: 8, fontSize: "0.82rem", color: "#28a745" }}>
          Question submitted! Check the Questions page for the response.
        </div>
      )}
      {submitStatus === "error" && (
        <div style={{ marginTop: 8, fontSize: "0.82rem", color: "#dc3545" }}>{errorMsg}</div>
      )}
    </div>
  );
}

function avatarUrl(name: string, color: string, size = 40): string {
  const bg = (color === "#FFED00" ? "#c4a900" : color).replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size * 2}&bold=true&background=${bg}&color=fff&rounded=true`;
}

export function Dashboard() {
  const [state, setState] = useState<NationalState | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [election, setElection] = useState<Election | null>(null);
  const [lastElection, setLastElection] = useState<Election | null>(null);
  const [government, setGovernment] = useState<Government | null>(null);

  // Core sim data — changes every simulation day
  const refreshCore = useCallback(() => {
    api.getState().then(setState).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getEvents(5).then(r => setEvents(r.events)).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
  }, []);

  // Slowly-changing data — elections, government, crises
  const refreshSlow = useCallback(() => {
    api.getCrises(true).then(setCrises).catch(console.error);
    api.getActiveElection().then(setElection).catch(console.error);
    api.getGovernment().then(setGovernment).catch(console.error);
    api.getElections("completed").then(completed => {
      if (completed.length > 0) {
        const sorted = completed.sort((a, b) => b.electionDay - a.electionDay);
        setLastElection(sorted[0]);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => { refreshCore(); refreshSlow(); }, [refreshCore, refreshSlow]);
  usePolling(refreshCore);           // every 5s
  usePolling(refreshSlow, 60000);    // every 60s

  if (!state || !simStatus) return <div className="loading">Loading...</div>;

  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);

  const sentimentColor = state.publicSentiment > 60 ? "#28a745" : state.publicSentiment > 40 ? "#ffc107" : "#dc3545";

  return (
    <div>
      <h1>🏛️ Dashboard — Day #{simStatus.currentDay}</h1>

      {simStatus.dailySummary && (() => {
        let narrative = simStatus.dailySummary;
        let mood: string | null = null;
        try {
          const parsed = JSON.parse(simStatus.dailySummary) as { narrative?: string; mood?: string };
          if (typeof parsed.narrative === "string") narrative = parsed.narrative;
          if (typeof parsed.mood === "string") mood = parsed.mood;
        } catch {
          // old plain-text summary — use as-is
        }
        const moodColor = mood ? (MOOD_COLORS[mood] ?? "#666") : null;
        return (
          <div className="card" style={{ marginBottom: "1.25rem", borderLeft: "4px solid #004b91", background: "#f0f4ff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "#004b91", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Today in the Bundestag — Day {simStatus.currentDay}
              </span>
              {mood && moodColor && (
                <span style={{
                  fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                  background: moodColor, color: "white", letterSpacing: "0.03em",
                }}>
                  {mood}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: 1.6, color: "#222" }}>
              {narrative}
            </p>
          </div>
        );
      })()}

      {state.provisionalBudget && (
        <div style={{
          background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 6,
          padding: "10px 16px", marginBottom: "1rem", fontSize: "0.88rem", color: "#856404",
        }}>
          ⚠️ <strong>Provisional Budget Active</strong> — Bundesrepublik operating under
          vorläufige Haushaltsführung (Art. 111 GG).
          {simStatus.budgetRetryDay != null && (
            <span style={{ marginLeft: 6 }}>
              Revised budget vote scheduled for Day {simStatus.budgetRetryDay}.
            </span>
          )}
        </div>
      )}

      {/* Bundestag composition */}
      {(() => {
        const MAJORITY = 368;
        const coalitionParties = parties.filter(p => state.coalitionParties.includes(p.id) && p.seatCount > 0);
        const oppositionParties = parties.filter(p => state.oppositionParties.includes(p.id) && p.seatCount > 0);
        const coalitionSeats = coalitionParties.reduce((s, p) => s + p.seatCount, 0);
        const oppositionSeats = oppositionParties.reduce((s, p) => s + p.seatCount, 0);
        const hasMajority = coalitionSeats >= MAJORITY;
        const majorityPct = (MAJORITY / totalSeats) * 100;

        return (
          <div className="section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
              <h2 style={{ margin: 0 }}>Current Bundestag</h2>
              <span style={{ fontSize: "0.78rem", color: "#888" }}>{totalSeats} seats total · majority at {MAJORITY}</span>
            </div>

            {/* Seat bar */}
            <div style={{ position: "relative", marginBottom: "0.25rem" }}>
              {/* Majority marker line */}
              <div style={{
                position: "absolute", top: 0, bottom: 0,
                left: `${majorityPct}%`,
                width: 2,
                background: "#333",
                zIndex: 2,
              }} />
              <div style={{ display: "flex", height: 32, borderRadius: 4, overflow: "hidden", gap: 3 }}>
                {/* Coalition */}
                <div style={{ display: "flex", flex: `0 0 ${(coalitionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {coalitionParties.map(p => (
                    <div
                      key={p.id}
                      style={{
                        flex: p.seatCount,
                        backgroundColor: p.color === "#FFED00" ? "#c4a900" : p.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.7rem", color: "white", fontWeight: 600,
                        overflow: "hidden", whiteSpace: "nowrap",
                      }}
                    >
                      {p.seatCount > 50 ? `${p.name} (${p.seatCount})` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
                {/* Gap between coalition and opposition */}
                <div style={{ flex: "0 0 3px", background: "#fff" }} />
                {/* Opposition */}
                <div style={{ display: "flex", flex: `0 0 ${(oppositionSeats / totalSeats) * 100}%`, gap: 1 }}>
                  {oppositionParties.map(p => (
                    <div
                      key={p.id}
                      style={{
                        flex: p.seatCount,
                        backgroundColor: `${p.color === "#FFED00" ? "#c4a900" : p.color}99`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.7rem", color: "#333", fontWeight: 600,
                        overflow: "hidden", whiteSpace: "nowrap",
                      }}
                    >
                      {p.seatCount > 50 ? `${p.name} (${p.seatCount})` : p.seatCount > 25 ? p.seatCount : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Majority label */}
            <div style={{ position: "relative", height: 16, marginBottom: "0.75rem" }}>
              <div style={{
                position: "absolute",
                left: `${majorityPct}%`,
                transform: "translateX(-50%)",
                fontSize: "0.68rem",
                color: "#555",
                whiteSpace: "nowrap",
              }}>
                ▲ {MAJORITY}
              </div>
            </div>

            {/* Coalition / Opposition chips */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {/* Coalition */}
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#28a745", marginBottom: 6 }}>
                  Government coalition
                  <span style={{
                    marginLeft: 6, fontWeight: 700, fontSize: "0.78rem",
                    color: hasMajority ? "#28a745" : "#dc3545",
                  }}>
                    {coalitionSeats} {hasMajority ? "✓" : "✗"}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {coalitionParties.map(p => {
                    const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                    return (
                      <span key={p.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 8px", borderRadius: 4,
                        border: `2px solid ${color}`, background: `${color}18`,
                        fontSize: "0.82rem", fontWeight: 600,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
                        {p.name}
                        <span style={{ fontWeight: 400, color: "#555", fontSize: "0.75rem" }}>{p.seatCount}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              {/* Opposition */}
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#888", marginBottom: 6 }}>
                  Opposition
                  <span style={{ marginLeft: 6, fontWeight: 600, fontSize: "0.78rem", color: "#555" }}>
                    {oppositionSeats}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {oppositionParties.map(p => {
                    const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                    return (
                      <span key={p.id} style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 8px", borderRadius: 4,
                        border: `1px solid #ccc`, background: "#f8f8f8",
                        fontSize: "0.82rem", color: "#444",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: color }} />
                        {p.name}
                        <span style={{ color: "#888", fontSize: "0.75rem" }}>{p.seatCount}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cohesion */}
            {state.coalitionCohesion != null && (
              <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid #eee", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ color: "#888" }}>Coalition cohesion:</span>
                <div style={{ flex: 1, background: "#eee", borderRadius: 4, height: 6, maxWidth: 120 }}>
                  <div style={{
                    width: `${state.coalitionCohesion}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: state.coalitionCohesion >= 90 ? "#28a745"
                      : state.coalitionCohesion >= 70 ? "#fd7e14"
                      : "#dc3545",
                  }} />
                </div>
                <span style={{
                  fontWeight: 600,
                  color: state.coalitionCohesion >= 90 ? "#28a745"
                    : state.coalitionCohesion >= 70 ? "#fd7e14"
                    : "#dc3545",
                }}>
                  {state.coalitionCohesion}%
                </span>
                <span style={{ color: "#aaa", fontSize: "0.78rem" }}>
                  {state.coalitionCohesion >= 90 ? "Stable" : state.coalitionCohesion >= 70 ? "Friction" : "Stressed"}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Federal Government */}
      {government && (
        <div className="section">
          <h2>Federal Government</h2>
          {(() => {
            const chancellorParty = parties.find(p => p.id === government.chancellorPartyId);
            return (
              <div className="card" style={{ marginBottom: "1rem", borderLeft: `4px solid ${chancellorParty?.color || "#333"}` }}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {chancellorParty && (
                    <img
                      src={avatarUrl(government.chancellorName, chancellorParty.color, 48)}
                      alt={government.chancellorName}
                      style={{ width: 48, height: 48, borderRadius: "50%", marginRight: 12, flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#888", textTransform: "uppercase", marginBottom: "0.25rem" }}>
                      Bundeskanzler/in
                    </div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 700 }}>{government.chancellorName}</div>
                    <div style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.15rem" }}>
                      {chancellorParty?.name ?? government.chancellorPartyId}
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#888" }}>
                        since Day {government.formedOnDay}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="grid grid-4">
            {government.ministers.map(m => {
              const mParty = parties.find(p => p.id === m.partyId);
              const portfolioLabels: Record<string, string> = {
                finance: "Finanzen",
                labour: "Arbeit & Soziales",
                environment: "Umwelt",
                interior: "Inneres",
                defence: "Verteidigung",
                education: "Bildung",
                health: "Gesundheit",
                infrastructure: "Verkehr & Digitales",
              };
              return (
                <div
                  key={m.portfolio}
                  className="card"
                  style={{ borderLeft: `3px solid ${mParty?.color === "#FFED00" ? "#c4a900" : (mParty?.color || "#888")}` }}
                >
                  {mParty && (
                    <img
                      src={avatarUrl(m.name, mParty.color, 36)}
                      alt={m.name}
                      style={{ width: 36, height: 36, borderRadius: "50%", marginBottom: 6, display: "block" }}
                    />
                  )}
                  <div style={{ fontSize: "0.7rem", color: "#888", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    {portfolioLabels[m.portfolio] ?? m.portfolio}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{m.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "#555" }}>
                    {mParty?.name ?? m.partyId}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active crises */}
      {crises.length > 0 && (
        <div className="section">
          <h2>Active Crises</h2>
          <div className="grid grid-2">
            {crises.map(c => (
              <div key={c.id} className={`card crisis-card crisis-${c.severity}`}>
                <div className="crisis-header">
                  <span className="crisis-name">{c.name}</span>
                  <span className={`badge badge-crisis-${c.severity}`}>{c.severity}</span>
                </div>
                <div className="crisis-desc">{c.description}</div>
                <div className="crisis-meta">
                  {c.category} &middot; Day {c.startDay}–{c.endDay}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active election */}
      {election && (
        <div className="section">
          <h2>Election</h2>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className={`badge badge-crisis-${election.status === "campaign" ? "high" : "medium"}`}>
                {election.status}
              </span>
              <span>Election Day: Day {election.electionDay}</span>
            </div>
            <div>{election.triggerReason}</div>
            {simStatus && (
              <div style={{ marginTop: 8, fontWeight: "bold" }}>
                {election.electionDay - simStatus.currentDay > 0
                  ? `${election.electionDay - simStatus.currentDay} days until election`
                  : "Election day!"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last election results */}
      {!election && lastElection?.results && (
        <div className="section">
          <h2>Last Election Results (Day {lastElection.electionDay})</h2>
          <div className="card">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #444" }}>
                  <th style={{ textAlign: "left", padding: "4px 8px" }}>Party</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Votes %</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>Seats</th>
                  <th style={{ textAlign: "right", padding: "4px 8px" }}>+/-</th>
                </tr>
              </thead>
              <tbody>
                {lastElection.results.sort((a, b) => b.seatsWon - a.seatsWon).map(r => {
                  const party = parties.find(p => p.id === r.partyId);
                  return (
                    <tr key={r.partyId} style={{ borderBottom: "1px solid #333" }}>
                      <td style={{ padding: "4px 8px" }}>
                        <span style={{
                          display: "inline-block", width: 10, height: 10, borderRadius: "50%",
                          backgroundColor: party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#666"),
                          marginRight: 6
                        }} />
                        {party?.name || r.partyId}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>{r.votesPercent}%</td>
                      <td style={{ textAlign: "right", padding: "4px 8px" }}>{r.seatsWon}</td>
                      <td style={{
                        textAlign: "right", padding: "4px 8px",
                        color: r.seatDelta > 0 ? "#28a745" : r.seatDelta < 0 ? "#dc3545" : "#888"
                      }}>
                        {r.seatDelta > 0 ? `+${r.seatDelta}` : r.seatDelta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {lastElection.newCoalition && (
              <div style={{ marginTop: 8 }}>
                <strong>Coalition:</strong> {lastElection.newCoalition.map(id => parties.find(p => p.id === id)?.name || id).join(", ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Economy indicators */}
      <div className="section">
        <h2>Economy</h2>
        <div className="grid grid-4">
          <div className="card">
            <div className="stat-value">{state.economy.budget}B</div>
            <div className="stat-label">Budget (EUR)</div>
          </div>
          <div className="card">
            <div className="stat-value">{state.economy.unemployment}%</div>
            <div className="stat-label">Unemployment</div>
          </div>
          <div className="card">
            <div className="stat-value">{state.economy.inflation}%</div>
            <div className="stat-label">Inflation</div>
          </div>
          <div className="card">
            <div className="stat-value">{state.economy.gdpGrowth}%</div>
            <div className="stat-label">GDP Growth</div>
          </div>
        </div>
      </div>

      {/* Sentiment gauge */}
      <div className="section">
        <h2>Public Sentiment</h2>
        <div className="card">
          <div className="stat-value" style={{ color: sentimentColor }}>{state.publicSentiment}/100</div>
          <div className="sentiment-gauge">
            <div
              className="sentiment-fill"
              style={{ width: `${state.publicSentiment}%`, backgroundColor: sentimentColor }}
            />
          </div>
        </div>
      </div>

      {/* Latest events */}
      <div className="section">
        <h2>Latest Events</h2>
        <div className="card">
          {events.length === 0 ? (
            <div className="loading">No events yet. Run the simulation first.</div>
          ) : (
            events.map(ev => (
              <div key={ev.id} className="event-item">
                <div className="event-type">#{ev.dayNumber} · {ev.type.replace(/_/g, " ")}</div>
                <div className="event-title">{ev.title}</div>
                <div className="event-desc">{ev.description}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Ask a Party widget */}
      {parties.length > 0 && (
        <div className="section">
          <AskPartyWidget parties={parties} coalitionParties={state.coalitionParties} />
        </div>
      )}
    </div>
  );
}
