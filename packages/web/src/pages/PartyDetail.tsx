import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, Party, PartyHistory, Bill, PartyVoteRecord, SimulationEvent, CitizenQuestion, Fraktion, SimulationStatus } from "../api";
import { usePolling } from "../usePolling";

const ROLE_BADGE: Record<string, string> = {
  leader: "badge-leader",
  junior: "badge-junior",
  opposition: "badge-opposition",
};

const STATUS_BADGE: Record<string, string> = {
  passed: "badge-passed",
  rejected: "badge-rejected",
  debate: "badge-debate",
  proposed: "badge-proposed",
};

const VOTE_COLOR: Record<string, string> = {
  yes: "#28a745",
  no: "#dc3545",
  abstain: "#ffc107",
};

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

  const refresh = useCallback(() => {
    if (!id) return;
    api.getParty(id).then(setParty).catch(console.error);
    api.getPartyHistory(id).then(setHistory).catch(console.error);
    api.getPartyBills(id).then(setBills).catch(console.error);
    api.getPartyVotes(id).then(setVotes).catch(console.error);
    api.getPartyStatements(id).then(setStatements).catch(console.error);
    api.getQuestions(id).then(setQuestions).catch(console.error);
    api.getParties().then(setAllParties).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
    api.getFraktionen().then(all => {
      // Find fraktion for this party (prefer active, fall back to most recent dissolved)
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

  if (!party) return <div className="loading">Loading...</div>;

  const displayColor = party.color === "#FFED00" ? "#c4a900" : party.color;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to="/parties" style={{ fontSize: "0.85rem", color: "#666", textDecoration: "none" }}>&larr; All parties</Link>
      </div>
      <div className="card" style={{ borderLeft: `4px solid ${displayColor}`, marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>{party.name}</h1>
            <div style={{ color: "#666", marginTop: 4 }}>{party.ideology}</div>
          </div>
          <span className={`badge ${ROLE_BADGE[party.coalitionRole] || ""}`} style={{ fontSize: "0.9rem", padding: "4px 12px" }}>
            {party.coalitionRole}
          </span>
        </div>
        <div style={{ display: "flex", gap: "2rem", marginTop: "1rem" }}>
          <div>
            <div className="stat-value" style={{ fontSize: "1.6rem" }}>{party.seatCount}</div>
            <div className="stat-label">Seats</div>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: "1.6rem" }}>{party.approvalRating}%</div>
            <div className="stat-label">Approval</div>
          </div>
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          <div className="stat-label">Policy Priorities</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
            {Object.entries(party.policyPriorities).map(([key, val]) => (
              <span
                key={key}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "4px",
                  background: val > 0 ? "#d4edda" : val < 0 ? "#f8d7da" : "#e2e3e5",
                }}
              >
                {key}: {val > 0 ? "+" : ""}{val}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Fraktion */}
      {fraktion && (
        <div className="section">
          <h2>Fraktion</h2>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Fraktion Leader: {fraktion.leaderName}</div>
                <div style={{ fontSize: "0.85rem", color: "#666", marginTop: 4 }}>Formed on Day {fraktion.formedOnDay}</div>
                {fraktion.status === "dissolved" && fraktion.dissolvedOnDay != null && (
                  <div style={{ fontSize: "0.85rem", color: "#dc3545", marginTop: 2 }}>Dissolved on Day {fraktion.dissolvedOnDay}</div>
                )}
              </div>
              <span
                className="badge"
                style={{
                  background: fraktion.status === "active" ? "#28a745" : "#6c757d",
                  color: "white",
                  fontSize: "0.85rem",
                  padding: "4px 10px",
                }}
              >
                {fraktion.status === "active" ? "Active" : "Dissolved"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Approval chart */}
      {history.length >= 2 && (
        <div className="section">
          <h2>Approval Rating History</h2>
          <div className="card">
            <ApprovalChart history={history} color={party.color} partyId={party.id} />
          </div>
        </div>
      )}

      {/* Bills proposed */}
      <div className="section">
        <h2>Bills Proposed ({bills.length})</h2>
        {bills.length === 0 ? (
          <div style={{ color: "#888", fontSize: "0.9rem" }}>No bills proposed yet.</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Category</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Day</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.id}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                      <Link to={`/bills/${b.id}`} style={{ color: "inherit", textDecoration: "none" }}>{b.title}</Link>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", color: "#666" }}>{b.category}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>{b.proposedOnDay}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span className={`badge ${STATUS_BADGE[b.status] || ""}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Voting record */}
      <div className="section">
        <h2>Voting Record ({votes.length})</h2>
        {votes.length === 0 ? (
          <div style={{ color: "#888", fontSize: "0.9rem" }}>No votes yet.</div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Bill</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Day</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Vote</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", borderBottom: "2px solid #ddd" }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {votes.slice(0, 50).map(({ bill, vote }) => (
                  <tr key={bill.id}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                      <Link to={`/bills/${bill.id}`} style={{ color: "inherit", textDecoration: "none" }}>{bill.title}</Link>
                      <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>{vote.reason}</div>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>{bill.proposedOnDay}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span style={{
                        fontWeight: 600,
                        color: VOTE_COLOR[vote.vote] || "#888",
                      }}>
                        {vote.vote.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      <span className={`badge ${STATUS_BADGE[bill.status] || ""}`}>{bill.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="section">
            <h2>Voting Alignment</h2>
            <div className="card">
              <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.75rem" }}>
                Based on last 30 days ({sample === recentVotes ? recentVotes.length : votes.length} shared votes)
              </div>
              {alignment.map(({ party: other, pct, count }) => {
                const otherColor = other.color === "#FFED00" ? "#c4a900" : other.color;
                const barColor = (pct ?? 0) > 70 ? "#28a745" : (pct ?? 0) >= 40 ? "#6c757d" : "#dc3545";
                return (
                  <div key={other.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                    <div style={{ width: 140, flexShrink: 0, fontSize: "0.85rem" }}>
                      <Link to={`/parties/${other.id}`} style={{ color: otherColor, fontWeight: 600, textDecoration: "none" }}>
                        {other.name}
                      </Link>
                    </div>
                    <div style={{ flex: 1, background: "#e9ecef", borderRadius: 4, height: 12, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 80, flexShrink: 0, fontSize: "0.82rem", color: "#555" }}>
                      <strong>{pct}%</strong>
                      <span style={{ color: "#aaa", marginLeft: 4 }}>({count})</span>
                    </div>
                  </div>
                );
              })}
            </div>
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
          <div className="section">
            <h2>Policy Focus Areas</h2>
            <div className="card">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {topCategories.map(([cat, count]) => (
                  <span key={cat} style={{
                    display: "inline-block",
                    padding: "0.25rem 0.75rem",
                    borderRadius: 16,
                    background: "#e8f0fe",
                    color: "#1a1a2e",
                    fontSize: "0.85rem",
                    fontWeight: 500,
                  }}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)} <span style={{ color: "#666" }}>({count})</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Statements */}
      <div className="section">
        <h2>Statements ({statements.length})</h2>
        {statements.length === 0 ? (
          <div style={{ color: "#888", fontSize: "0.9rem" }}>No statements yet.</div>
        ) : (
          <div>
            {statements.slice(0, 30).map(s => (
              <div key={s.id} className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${displayColor}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{s.title}</div>
                  <div style={{ fontSize: "0.75rem", color: "#888" }}>Day {s.dayNumber}</div>
                </div>
                <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 4 }}>{s.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ask a Question */}
      <div className="section">
        <h2>Ask {party.name} a Question</h2>
        <div className="card">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              placeholder="Type your question..."
              maxLength={500}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #ddd",
                fontSize: "0.9rem",
              }}
              onKeyDown={e => { if (e.key === "Enter") handleSubmitQuestion(); }}
            />
            <button
              onClick={handleSubmitQuestion}
              disabled={submitting || questionText.trim().length < 5}
              style={{
                padding: "8px 16px",
                borderRadius: 4,
                border: "none",
                background: displayColor,
                color: "white",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: submitting || questionText.trim().length < 5 ? "not-allowed" : "pointer",
                opacity: submitting || questionText.trim().length < 5 ? 0.5 : 1,
              }}
            >
              {submitting ? "..." : "Submit"}
            </button>
          </div>
          {submitMsg && (
            <div style={{ fontSize: "0.85rem", marginTop: 6, color: submitMsg.includes("Failed") ? "#dc3545" : "#28a745" }}>
              {submitMsg}
            </div>
          )}
        </div>

        {questions.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Recent Questions ({questions.length})</h3>
            {questions.slice(0, 10).map(q => (
              <div
                key={q.id}
                className="question-card"
                style={{ borderLeftColor: displayColor }}
              >
                <div className="question-header">
                  <span className={`badge ${q.status === "pending" ? "question-badge-pending" : "question-badge-answered"}`}>
                    {q.status}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "auto" }}>
                    Day {q.createdOnDay}
                  </span>
                </div>
                <div className="question-text">{q.question}</div>
                {q.response && (
                  <div className="question-response">
                    <strong>{party.name}:</strong> {q.response}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
