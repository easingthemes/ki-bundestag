import { useEffect, useState, useCallback } from "react";
import { api, ConstitutionalChallenge, Party } from "../api";
import { usePolling } from "../usePolling";

const STATUS_OPTIONS = ["all", "pending", "ruled"] as const;
const DECISION_OPTIONS = ["all", "struck_down", "upheld"] as const;

export function ConstitutionalCourt() {
  const [challenges, setChallenges] = useState<ConstitutionalChallenge[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getConstitutionalChallenges().then(setChallenges).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(10); }, [statusFilter, decisionFilter]);

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = challenges.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (decisionFilter !== "all" && c.decision !== decisionFilter) return false;
    return true;
  });
  const visibleFiltered = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  return (
    <div className="page">
      <h1>Bundesverfassungsgericht</h1>
      <p className="page-subtitle">Constitutional challenges to passed legislation</p>

      <div className="filters">
        <label>
          Status:{" "}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </label>
        <label>
          Decision:{" "}
          <select value={decisionFilter} onChange={e => setDecisionFilter(e.target.value)}>
            {DECISION_OPTIONS.map(d => (
              <option key={d} value={d}>
                {d === "all" ? "All" : d === "struck_down" ? "Struck Down" : "Upheld"}
              </option>
            ))}
          </select>
        </label>
        <span className="filter-count">{filtered.length} challenge{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No constitutional challenges match the current filters.</div>
      ) : (
        <div className="challenge-list">
          {visibleFiltered.map(c => {
            const filedBy = partyMap.get(c.filedByPartyId);
            const isExpanded = expandedId === c.id;
            const isStruckDown = c.decision === "struck_down";
            const isUpheld = c.decision === "upheld";

            return (
              <div
                key={c.id}
                className={`challenge-card ${isStruckDown ? "challenge-struck-down" : isUpheld ? "challenge-upheld" : "challenge-pending"}`}
              >
                <div
                  className="challenge-header"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="challenge-title-row">
                    <span className={`decision-badge ${isStruckDown ? "badge-struck-down" : isUpheld ? "badge-upheld" : "badge-pending"}`}>
                      {isStruckDown ? "⚖️ Struck Down" : isUpheld ? "✓ Upheld" : "⏳ Pending"}
                    </span>
                    <span className="challenge-bill-title">"{c.billTitle}"</span>
                  </div>
                  <div className="challenge-meta">
                    <span
                      className="challenge-party"
                      style={{ color: filedBy?.color ?? "#888" }}
                    >
                      Filed by {filedBy?.name ?? c.filedByPartyId}
                    </span>
                    <span className="challenge-day">Day {c.dayNumber}</span>
                    {c.ruledOnDay != null && c.ruledOnDay !== c.dayNumber && (
                      <span className="challenge-ruled">Ruled Day {c.ruledOnDay}</span>
                    )}
                    <span className="expand-toggle">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="challenge-body">
                    <div className="challenge-section">
                      <strong>Constitutional Arguments:</strong>
                      <p>{c.arguments}</p>
                    </div>
                    {c.reasoning && (
                      <div className="challenge-section">
                        <strong>Court Reasoning:</strong>
                        <p className="court-reasoning">{c.reasoning}</p>
                      </div>
                    )}
                    {isStruckDown && (
                      <div className="challenge-section challenge-impact-note">
                        <strong>Effect:</strong> The law has been nullified. Its economic and sentiment effects have been reversed.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {remaining > 0 && (
            <div style={{ textAlign: "center", margin: "1rem 0" }}>
              <button
                onClick={() => setVisibleCount(c => c + 10)}
                style={{
                  padding: "0.5rem 1.5rem",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  background: "white",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Show {Math.min(10, remaining)} more ({remaining} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
