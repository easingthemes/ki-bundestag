import { useEffect, useState, useCallback } from "react";
import { api, ConfidenceVote, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/ui";

const STATUS_OPTIONS = ["all", "passed", "failed"] as const;
const TYPE_OPTIONS = ["all", "vertrauensfrage", "misstrauensvotum"] as const;

export function ConfidenceVotes() {
  const [votes, setVotes] = useState<ConfidenceVote[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const refresh = useCallback(() => {
    api.getConfidenceVotes().then(setVotes).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="loading">Loading...</div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  useEffect(() => { setVisibleCount(5); }, [statusFilter, typeFilter]);

  const filtered = votes.filter(v => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (typeFilter !== "all" && v.type !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <h1>Vertrauensvoten</h1>
      <p style={{ color: "#666", marginBottom: "1rem" }}>
        Parliamentary confidence mechanisms. <strong>Vertrauensfrage</strong>: the Chancellor requests
        confidence — failure triggers a snap election. <strong>Konstruktives Misstrauensvotum</strong>:
        opposition names a replacement Chancellor — success transfers power immediately.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: "0.8rem", color: "#888" }}>Status: </label>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              style={{
                padding: "0.25rem 0.5rem",
                marginRight: "0.25rem",
                border: statusFilter === opt ? "1px solid #333" : "1px solid #ccc",
                borderRadius: "4px",
                background: statusFilter === opt ? "#333" : "#fff",
                color: statusFilter === opt ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              {opt === "all" ? "All" : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
        <div>
          <label style={{ fontSize: "0.8rem", color: "#888" }}>Type: </label>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setTypeFilter(opt)}
              style={{
                padding: "0.25rem 0.5rem",
                marginRight: "0.25rem",
                border: typeFilter === opt ? "1px solid #333" : "1px solid #ccc",
                borderRadius: "4px",
                background: typeFilter === opt ? "#333" : "#fff",
                color: typeFilter === opt ? "#fff" : "#333",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              {opt === "all" ? "All" : opt === "vertrauensfrage" ? "Vertrauensfrage" : "Misstrauensvotum"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="loading">
          No confidence votes yet. The coalition leader can call a Vertrauensfrage; opposition parties can file a Misstrauensvotum.
        </div>
      )}

      {filtered.slice(0, visibleCount).map(vote => (
        <ConfidenceVoteCard
          key={vote.id}
          vote={vote}
          partyMap={partyMap}
          expanded={expandedId === vote.id}
          onToggle={() => setExpandedId(expandedId === vote.id ? null : vote.id)}
        />
      ))}
      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={5}
        onShowMore={() => setVisibleCount(c => c + 5)}
      />
    </div>
  );
}

function ConfidenceVoteCard({
  vote,
  partyMap,
  expanded,
  onToggle,
}: {
  vote: ConfidenceVote;
  partyMap: Map<string, Party>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const initiator = partyMap.get(vote.initiatedByPartyId);
  const proposedParty = vote.proposedChancellorPartyId
    ? partyMap.get(vote.proposedChancellorPartyId)
    : null;

  const isVertrauensfrage = vote.type === "vertrauensfrage";
  const typeLabel = isVertrauensfrage ? "Vertrauensfrage" : "Misstrauensvotum";
  const typeColor = isVertrauensfrage
    ? { bg: "#cff4fc", color: "#055160" }
    : { bg: "#ffd6a5", color: "#8a4b08" };

  const statusColor = vote.status === "passed"
    ? { bg: "#d4edda", color: "#155724" }
    : { bg: "#f8d7da", color: "#721c24" };

  // Outcome description
  let outcomeText = "";
  if (isVertrauensfrage) {
    outcomeText = vote.status === "passed"
      ? `Chancellor ${vote.chancellorName}'s government survived.`
      : `Government fell — snap election triggered.`;
  } else {
    outcomeText = vote.status === "passed"
      ? `New Chancellor: ${vote.proposedChancellor ?? "Unknown"} — government transferred without election.`
      : `Motion failed — ${vote.chancellorName}'s government survived.`;
  }

  // Seat tally from votes
  const totalYes = vote.votes
    .filter(v => v.vote === "yes")
    .reduce((sum, v) => {
      const party = partyMap.get(v.partyId);
      return sum + (party?.seatCount ?? 0);
    }, 0);
  const totalNo = vote.votes
    .filter(v => v.vote === "no")
    .reduce((sum, v) => {
      const party = partyMap.get(v.partyId);
      return sum + (party?.seatCount ?? 0);
    }, 0);
  const totalSeats = totalYes + totalNo;

  return (
    <div
      className="card"
      style={{ marginBottom: "0.75rem", cursor: "pointer" }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <strong>{vote.title}</strong>
          <span style={{
            padding: "0.15rem 0.4rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            background: typeColor.bg,
            color: typeColor.color,
          }}>
            {typeLabel}
          </span>
        </div>
        <span style={{
          padding: "0.15rem 0.4rem",
          borderRadius: "4px",
          fontSize: "0.75rem",
          background: statusColor.bg,
          color: statusColor.color,
          fontWeight: 600,
        }}>
          {vote.status === "passed" ? "Passed" : "Failed"}
        </span>
      </div>

      <div style={{ fontSize: "0.85rem", color: "#555", margin: "0.25rem 0" }}>
        {isVertrauensfrage ? (
          <>
            Called by{" "}
            <span style={{ color: initiator?.color ?? "#333", fontWeight: 600 }}>
              {initiator?.name ?? vote.initiatedByPartyId}
            </span>
            {" "}· Chancellor: <strong>{vote.chancellorName}</strong>
          </>
        ) : (
          <>
            Filed by{" "}
            <span style={{ color: initiator?.color ?? "#333", fontWeight: 600 }}>
              {initiator?.name ?? vote.initiatedByPartyId}
            </span>
            {" "}· Proposed: <strong>{vote.proposedChancellor}</strong>
            {proposedParty && (
              <span style={{ color: proposedParty.color }}> ({proposedParty.name})</span>
            )}
          </>
        )}
      </div>

      {/* Seat vote bar */}
      {totalSeats > 0 && (
        <div style={{ margin: "0.5rem 0" }}>
          <div style={{
            display: "flex",
            height: "8px",
            borderRadius: "4px",
            overflow: "hidden",
            background: "#eee",
          }}>
            <div style={{
              width: `${(totalYes / totalSeats) * 100}%`,
              background: "#28a745",
            }} />
            <div style={{
              width: `${(totalNo / totalSeats) * 100}%`,
              background: "#dc3545",
            }} />
          </div>
          <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.15rem" }}>
            <span style={{ color: "#28a745" }}>Yes: {totalYes}</span>
            {" · "}
            <span style={{ color: "#dc3545" }}>No: {totalNo}</span>
            {" · "}Threshold: 368
            {totalYes >= 368 && <span style={{ color: "#28a745" }}> ✓</span>}
          </div>
        </div>
      )}

      <div style={{ fontSize: "0.8rem", color: "#666", fontStyle: "italic" }}>
        {outcomeText}
      </div>

      <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.15rem" }}>
        Day {vote.dayNumber}
        {vote.sentimentImpact != null && vote.sentimentImpact !== 0 && (
          <span style={{ color: vote.sentimentImpact > 0 ? "#28a745" : "#dc3545" }}>
            {" "}· Sentiment: {vote.sentimentImpact > 0 ? "+" : ""}{vote.sentimentImpact}
          </span>
        )}
      </div>

      {expanded && vote.votes.length > 0 && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
          <strong style={{ fontSize: "0.85rem" }}>Description:</strong>
          <div style={{ fontSize: "0.9rem", color: "#333", marginBottom: "0.5rem" }}>{vote.description}</div>

          <strong style={{ fontSize: "0.85rem" }}>Vote Breakdown:</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.25rem" }}>
            {vote.votes.map(v => {
              const p = partyMap.get(v.partyId);
              return (
                <span
                  key={v.partyId}
                  style={{
                    padding: "0.15rem 0.4rem",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    background: v.vote === "yes" ? "#d4edda" : "#f8d7da",
                    color: v.vote === "yes" ? "#155724" : "#721c24",
                    border: `1px solid ${p?.color ?? "#ccc"}`,
                  }}
                  title={v.reason}
                >
                  {p?.name ?? v.partyId}: {v.vote}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
