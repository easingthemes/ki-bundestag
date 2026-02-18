import { useEffect, useState, useCallback } from "react";
import { api, Poll } from "../api";
import { usePolling } from "../usePolling";

const VOTED_KEY = "ki-bundestag-voted-polls";

function getVotedPolls(): Set<string> {
  try {
    const stored = localStorage.getItem(VOTED_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markVoted(pollId: string) {
  const voted = getVotedPolls();
  voted.add(pollId);
  localStorage.setItem(VOTED_KEY, JSON.stringify(Array.from(voted)));
}

const BAR_COLORS = ["#004b91", "#28a745", "#dc3545", "#ffc107", "#6f42c1", "#17a2b8"];

export function Polls() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votedPolls, setVotedPolls] = useState<Set<string>>(getVotedPolls);
  const [showClosed, setShowClosed] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getPolls().then(setPolls).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const handleVote = async (pollId: string, option: string) => {
    if (voting || votedPolls.has(pollId)) return;
    setVoting(pollId);
    try {
      const updated = await api.votePoll(pollId, option);
      setPolls(prev => prev.map(p => p.id === pollId ? updated : p));
      markVoted(pollId);
      setVotedPolls(prev => new Set(prev).add(pollId));
    } catch (err) {
      console.error("Vote error:", err);
    } finally {
      setVoting(null);
    }
  };

  const activePolls = polls.filter(p => p.active);
  const closedPolls = polls.filter(p => !p.active);

  return (
    <div>
      <h1>Public Opinion Polls</h1>

      {activePolls.length === 0 && closedPolls.length === 0 && (
        <div className="loading">No polls yet. Run the simulation until day 7 for the first polls.</div>
      )}

      {/* Active polls */}
      {activePolls.length > 0 && (
        <div className="section">
          <h2>Active Polls ({activePolls.length})</h2>
          {activePolls.map(poll => (
            <PollCard
              key={poll.id}
              poll={poll}
              hasVoted={votedPolls.has(poll.id)}
              isVoting={voting === poll.id}
              onVote={(option) => handleVote(poll.id, option)}
            />
          ))}
        </div>
      )}

      {/* Closed polls */}
      {closedPolls.length > 0 && (
        <div className="section">
          <button
            onClick={() => setShowClosed(!showClosed)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#555",
              padding: 0,
            }}
          >
            {showClosed ? "▾" : "▸"} Past Polls ({closedPolls.length})
          </button>
          {showClosed && (
            <div style={{ marginTop: 12 }}>
              {closedPolls.map(poll => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  hasVoted={true}
                  isVoting={false}
                  onVote={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PollCard({
  poll,
  hasVoted,
  isVoting,
  onVote,
}: {
  poll: Poll;
  hasVoted: boolean;
  isVoting: boolean;
  onVote: (option: string) => void;
}) {
  const totalVotes = Object.values(poll.votes).reduce((s, v) => s + v, 0);
  const showResults = hasVoted || !poll.active;

  return (
    <div className="poll-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{poll.question}</div>
          <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>
            Created Day {poll.createdOnDay}
            {poll.expiresOnDay && ` · Expires Day ${poll.expiresOnDay}`}
            {totalVotes > 0 && ` · ${totalVotes} vote${totalVotes !== 1 ? "s" : ""}`}
          </div>
        </div>
        <span className={`badge ${poll.active ? "poll-badge-active" : "poll-badge-closed"}`}>
          {poll.active ? "Active" : "Closed"}
        </span>
      </div>

      {showResults ? (
        // Results view
        <div>
          {poll.options.map((option, i) => {
            const count = poll.votes[option] || 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const color = BAR_COLORS[i % BAR_COLORS.length];
            const isTop = totalVotes > 0 && count === Math.max(...Object.values(poll.votes));

            return (
              <div key={option} className="poll-result-bar" style={{ background: "#f5f5f5" }}>
                <div
                  className="poll-result-bar-fill"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
                <span style={{ position: "relative", zIndex: 1, fontWeight: isTop ? 700 : 400 }}>
                  {option}
                </span>
                <span style={{ position: "relative", zIndex: 1, marginLeft: "auto", fontSize: "0.8rem", color: "#666" }}>
                  {pct}% ({count})
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        // Voting view
        <div>
          {poll.options.map(option => (
            <button
              key={option}
              className="poll-option-btn"
              onClick={() => onVote(option)}
              disabled={isVoting}
              style={isVoting ? { opacity: 0.6, cursor: "wait" } : {}}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
