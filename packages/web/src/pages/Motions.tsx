import { useEffect, useState, useCallback } from "react";
import { api, Motion, Party } from "../api";
import { usePolling } from "../usePolling";

const STATUS_ORDER = ["passed", "rejected"];

export function Motions() {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getMotions().then(setMotions).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="loading">Loading...</div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const visibleMotions = motions.slice(0, visibleCount);
  const remaining = motions.length - visibleCount;

  const grouped = STATUS_ORDER.map(status => ({
    status,
    motions: visibleMotions.filter(m => m.status === status),
  })).filter(g => g.motions.length > 0);

  return (
    <div>
      <h1>Motions & Resolutions</h1>
      {motions.length === 0 && (
        <div className="loading">No motions yet. Run the simulation to see motions appear.</div>
      )}
      {grouped.map(group => (
        <div key={group.status} className="section">
          <h2>
            {group.status === "passed" ? "Passed" : "Rejected"} ({motions.filter(m => m.status === group.status).length})
          </h2>
          {group.motions.map(motion => (
            <MotionCard key={motion.id} motion={motion} partyMap={partyMap} />
          ))}
        </div>
      ))}
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
  );
}

function MotionCard({ motion, partyMap }: { motion: Motion; partyMap: Map<string, Party> }) {
  const proposer = partyMap.get(motion.proposedBy);
  const typeLabel = motion.type === "motion" ? "Antrag" : "Entschließung";
  const typeBadge = motion.type === "motion" ? "badge-motion" : "badge-resolution";
  const statusBadge = motion.status === "passed" ? "badge-motion-passed" : "badge-motion-rejected";

  const totalSeats = motion.votes.reduce((sum, v) => {
    const p = partyMap.get(v.partyId);
    return sum + (p?.seatCount ?? 0);
  }, 0);

  const yesSeats = motion.votes
    .filter(v => v.vote === "yes")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const noSeats = motion.votes
    .filter(v => v.vote === "no")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);

  return (
    <div className="card" style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{motion.title}</strong>
          <span className={`badge ${typeBadge}`} style={{ marginLeft: "0.5rem" }}>
            {typeLabel}
          </span>
        </div>
        <span className={`badge ${statusBadge}`}>
          {motion.status}
        </span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#555", margin: "0.25rem 0" }}>
        {motion.description}
      </div>
      <div style={{ fontSize: "0.8rem", color: "#888" }}>
        Proposed by {proposer?.name ?? motion.proposedBy} on day {motion.dayNumber}
      </div>

      {motion.votes.length > 0 && totalSeats > 0 && (
        <>
          <div className="vote-bar">
            {yesSeats > 0 && (
              <div className="vote-bar-yes" style={{ width: `${(yesSeats / totalSeats) * 100}%` }} />
            )}
            {noSeats > 0 && (
              <div className="vote-bar-no" style={{ width: `${(noSeats / totalSeats) * 100}%` }} />
            )}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#888" }}>
            Yes: {yesSeats} · No: {noSeats}
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            {motion.votes.map(v => {
              const p = partyMap.get(v.partyId);
              return (
                <div key={v.partyId} className="vote-detail">
                  <span className={`vote-dot vote-dot-${v.vote}`} />
                  <strong>{p?.name ?? v.partyId}</strong>
                  <span style={{ color: "#666" }}>— {v.reason}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
