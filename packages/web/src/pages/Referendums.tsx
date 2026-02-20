import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Referendum } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/ui";
import { useUser } from "../userContext";

const STATUS_BADGE: Record<string, string> = {
  active: "ref-badge-active",
  passed: "ref-badge-passed",
  rejected: "ref-badge-rejected",
  expired: "ref-badge-expired",
};

const CATEGORY_BORDER: Record<string, string> = {
  economy: "#2196F3",
  social: "#9C27B0",
  environment: "#4CAF50",
  immigration: "#FF9800",
  defense: "#607D8B",
  education: "#00BCD4",
  healthcare: "#E91E63",
  infrastructure: "#795548",
};

export function Referendums() {
  const { user } = useUser();
  const [referendums, setReferendums] = useState<Referendum[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [pastVisible, setPastVisible] = useState(5);

  const refresh = useCallback(() => {
    api.getReferendums(filterStatus || undefined)
      .then(setReferendums).catch(console.error);
  }, [filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);

  const handleVote = async (id: string, option: string) => {
    if (votedIds.has(id)) return;
    try {
      await api.voteReferendum(id, option);
      setVotedIds(prev => new Set(prev).add(id));
      refresh();
    } catch (err) {
      console.error("Vote failed:", err);
    }
  };

  useEffect(() => { setPastVisible(5); }, [filterStatus]);

  const active = referendums.filter(r => r.status === "active");
  const past = referendums.filter(r => r.status !== "active");

  const unvotedActive = active.filter(r => !votedIds.has(r.id));

  return (
    <div>
      <h1>Referendums</h1>

      {/* Registration prompt */}
      {!user && active.length > 0 && (
        <div className="nudge-banner">
          <Link to="/parties">Register and join a party</Link> to participate — vote on referendums and shape policy.
        </div>
      )}

      {/* Unvoted nudge */}
      {unvotedActive.length > 0 && (
        <div className="nudge-banner nudge-action">
          {unvotedActive.length} active referendum{unvotedActive.length !== 1 ? "s" : ""} awaiting your vote.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid #ddd", fontSize: "0.85rem" }}
        >
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="passed">Passed</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {active.length > 0 && (
        <div className="section">
          <h2>Active Referendums</h2>
          {active.map(ref => (
            <ReferendumCard
              key={ref.id}
              referendum={ref}
              hasVoted={votedIds.has(ref.id)}
              onVote={handleVote}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="section">
          <h2>Past Referendums</h2>
          {past.slice(0, pastVisible).map(ref => (
            <ReferendumCard
              key={ref.id}
              referendum={ref}
              hasVoted={true}
              onVote={handleVote}
            />
          ))}
          <ShowMoreButton
            total={past.length}
            visible={Math.min(pastVisible, past.length)}
            increment={5}
            onShowMore={() => setPastVisible(c => c + 5)}
          />
        </div>
      )}

      {referendums.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
          No referendums yet. They are generated automatically every 30 simulation days.
        </div>
      )}
    </div>
  );
}

function ReferendumCard({
  referendum,
  hasVoted,
  onVote,
}: {
  referendum: Referendum;
  hasVoted: boolean;
  onVote: (id: string, option: string) => void;
}) {
  const totalVotes = Object.values(referendum.votes).reduce((s, v) => s + v, 0);
  const borderColor = CATEGORY_BORDER[referendum.category] || "#888";
  const showResults = hasVoted || referendum.status !== "active";

  return (
    <div
      className="ref-card"
      style={{ borderLeftColor: borderColor }}
    >
      <div className="ref-header">
        <span className={`badge ${STATUS_BADGE[referendum.status] || ""}`}>
          {referendum.status}
        </span>
        <span style={{ fontSize: "0.75rem", color: "#888" }}>
          {referendum.category}
        </span>
        <span style={{ fontSize: "0.75rem", color: "#888", marginLeft: "auto" }}>
          Day {referendum.createdOnDay} — Closes Day {referendum.closesOnDay}
        </span>
      </div>

      <div className="ref-title">{referendum.title}</div>
      <div className="ref-desc">{referendum.description}</div>

      {referendum.status === "active" && !hasVoted ? (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {referendum.options.map(opt => (
            <button
              key={opt}
              className="ref-vote-btn"
              onClick={() => onVote(referendum.id, opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {referendum.options.map(opt => {
            const count = referendum.votes[opt] || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isWinner = referendum.result === opt;
            return (
              <div key={opt} className="poll-result-bar" style={{ background: "#f5f5f5" }}>
                <div
                  className="poll-result-bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: isWinner ? "#28a745" : "#6c757d",
                  }}
                />
                <span style={{ zIndex: 1, position: "relative" }}>
                  {opt}: {count} votes ({pct}%)
                  {isWinner && " ✓"}
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 4 }}>
            {totalVotes} total votes {totalVotes < 10 && referendum.status === "active" && `(need ${10 - totalVotes} more for quorum)`}
          </div>
        </div>
      )}

      {showResults && referendum.impact && referendum.status === "passed" && (
        <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#555" }}>
          Impact: {Object.entries(referendum.impact)
            .filter(([, v]) => v != null && v !== 0)
            .map(([k, v]) => `${k}: ${(v as number) > 0 ? "+" : ""}${v}`)
            .join(", ")}
        </div>
      )}
    </div>
  );
}
