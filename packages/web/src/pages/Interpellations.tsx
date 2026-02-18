import { useEffect, useState, useCallback } from "react";
import { api, Interpellation, Party } from "../api";
import { usePolling } from "../usePolling";

const STATUS_OPTIONS = ["all", "pending", "answered", "expired"] as const;
const TYPE_OPTIONS = ["all", "kleine", "große"] as const;

export function Interpellations() {
  const [interpellations, setInterpellations] = useState<Interpellation[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getInterpellations().then(setInterpellations).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(10); }, [statusFilter, typeFilter]);

  if (parties.length === 0) return <div className="loading">Loading...</div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = interpellations.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    return true;
  });
  const visibleFiltered = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visibleCount;

  return (
    <div>
      <h1>Anfragen (Interpellations)</h1>
      <p style={{ color: "#666", marginBottom: "1rem" }}>
        Opposition parties formally question government ministers. Kleine Anfrage = written question.
        Große Anfrage = major inquiry with plenary debate.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: "0.8rem", color: "#888" }}>Status: </label>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`filter-btn${statusFilter === opt ? " active" : ""}`}
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
              {opt === "all" ? "All" : opt === "große" ? "Große Anfrage" : "Kleine Anfrage"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="loading">No interpellations yet. Run the simulation to see opposition parties question the government.</div>
      )}

      {visibleFiltered.map(interp => (
        <InterpellationCard
          key={interp.id}
          interp={interp}
          partyMap={partyMap}
          expanded={expandedId === interp.id}
          onToggle={() => setExpandedId(expandedId === interp.id ? null : interp.id)}
        />
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

function InterpellationCard({
  interp,
  partyMap,
  expanded,
  onToggle,
}: {
  interp: Interpellation;
  partyMap: Map<string, Party>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const filer = partyMap.get(interp.filedByPartyId);
  const targetParty = partyMap.get(interp.targetPartyId);
  const typeLabel = interp.type === "große" ? "Große Anfrage" : "Kleine Anfrage";

  const statusStyle: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#fff3cd", color: "#856404" },
    answered: { bg: "#d4edda", color: "#155724" },
    expired: { bg: "#f8d7da", color: "#721c24" },
  };
  const st = statusStyle[interp.status] ?? statusStyle.pending;

  return (
    <div
      className="card"
      style={{ marginBottom: "0.75rem", cursor: "pointer" }}
      onClick={onToggle}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>{interp.title}</strong>
          <span
            style={{
              marginLeft: "0.5rem",
              padding: "0.15rem 0.4rem",
              borderRadius: "4px",
              fontSize: "0.75rem",
              background: interp.type === "große" ? "#e0cffc" : "#cff4fc",
              color: interp.type === "große" ? "#5a2d82" : "#055160",
            }}
          >
            {typeLabel}
          </span>
        </div>
        <span
          style={{
            padding: "0.15rem 0.4rem",
            borderRadius: "4px",
            fontSize: "0.75rem",
            background: st.bg,
            color: st.color,
          }}
        >
          {interp.status}
        </span>
      </div>

      <div style={{ fontSize: "0.85rem", color: "#555", margin: "0.25rem 0" }}>
        Filed by{" "}
        <span style={{ color: filer?.color ?? "#333", fontWeight: 600 }}>
          {filer?.name ?? interp.filedByPartyId}
        </span>
        {" "}targeting{" "}
        <strong>{interp.targetMinisterName}</strong> ({interp.targetMinistry})
        {targetParty && (
          <span style={{ color: targetParty.color }}> — {targetParty.name}</span>
        )}
      </div>

      <div style={{ fontSize: "0.8rem", color: "#888" }}>
        Day {interp.dayNumber}
        {interp.respondedOnDay != null && ` · Answered on day ${interp.respondedOnDay}`}
        {interp.sentimentImpact != null && interp.sentimentImpact !== 0 && (
          <span style={{ color: interp.sentimentImpact > 0 ? "#28a745" : "#dc3545" }}>
            {" "}· Sentiment: {interp.sentimentImpact > 0 ? "+" : ""}{interp.sentimentImpact}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
          <div style={{ marginBottom: "0.5rem" }}>
            <strong>Question:</strong>
            <div style={{ fontSize: "0.9rem", color: "#333", marginTop: "0.25rem" }}>
              {interp.question}
            </div>
          </div>

          {interp.response && (
            <div style={{ marginTop: "0.5rem" }}>
              <strong>Minister's Response ({interp.targetMinisterName}):</strong>
              <div style={{
                fontSize: "0.9rem",
                color: "#333",
                marginTop: "0.25rem",
                background: "#f8f9fa",
                padding: "0.5rem",
                borderRadius: "4px",
                borderLeft: `3px solid ${targetParty?.color ?? "#666"}`,
              }}>
                {interp.response}
              </div>
            </div>
          )}

          {interp.status === "expired" && (
            <div style={{
              marginTop: "0.5rem",
              fontSize: "0.85rem",
              color: "#dc3545",
              fontStyle: "italic",
            }}>
              This interpellation went unanswered for 14 days — an embarrassment for the government.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
