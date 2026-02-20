import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type Party, type Fraktion, type AlignmentData } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 64, h = 22;
  const pts = values.map((v, i) =>
    `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 2) - 1}`
  ).join(" ");
  const trend = values[values.length - 1] - values[0];
  const lineColor = trend > 0.5 ? "#28a745" : trend < -0.5 ? "#dc3545" : color;
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const ROLE_BADGE: Record<string, string> = {
  leader: "badge-leader",
  junior: "badge-junior",
  opposition: "badge-opposition",
};

function JoinModal({ party, onClose, onJoined }: {
  party: Party;
  onClose: () => void;
  onJoined: () => void;
}) {
  const { user, login } = useUser();
  const [name, setName] = useState(user?.displayName ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handle = async () => {
    if (name.trim().length < 2) return;
    setStatus("loading");
    try {
      let result;
      if (user) {
        // Already registered — just switch party
        result = await api.joinParty(party.id);
      } else {
        result = await api.registerUser(name.trim(), party.id);
      }
      login(result.id, result);
      onJoined();
      onClose();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : "Failed to join");
      setStatus("error");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "white", borderRadius: 8, padding: "1.75rem", width: 340,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>
          Join {party.name}
        </h3>
        {!user && (
          <>
            <label style={{ fontSize: "0.85rem", color: "#555", display: "block", marginBottom: 4 }}>
              Display name (public within the party)
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={30}
              placeholder="Your name"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 4, border: "1px solid #ccc", fontSize: "0.9rem", boxSizing: "border-box" }}
              onKeyDown={e => e.key === "Enter" && handle()}
            />
          </>
        )}
        {user && (
          <p style={{ fontSize: "0.88rem", color: "#555", margin: "0 0 1rem" }}>
            You'll join as <strong>{user.displayName}</strong>.
            {user.partyId && <span style={{ color: "#888" }}> A 7-day switching cooldown will apply.</span>}
          </p>
        )}
        {status === "error" && (
          <div style={{ fontSize: "0.82rem", color: "#dc3545", margin: "8px 0" }}>{errMsg}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: "1rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 4, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={handle}
            disabled={status === "loading" || (!user && name.trim().length < 2)}
            style={{
              padding: "7px 16px", borderRadius: 4, border: "none",
              background: party.color === "#FFED00" ? "#c4a900" : party.color,
              color: "white", fontWeight: 700, cursor: "pointer",
              opacity: (status === "loading" || (!user && name.trim().length < 2)) ? 0.6 : 1,
            }}
          >
            {status === "loading" ? "Joining…" : `Join ${party.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Parties() {
  const { user } = useUser();
  const [parties, setParties] = useState<Party[]>([]);
  const [fraktionen, setFraktionen] = useState<Fraktion[]>([]);
  const [alignment, setAlignment] = useState<AlignmentData | null>(null);
  const [joiningParty, setJoiningParty] = useState<Party | null>(null);

  const refresh = useCallback(() => {
    api.getParties().then(setParties).catch(console.error);
    api.getFraktionen("active").then(setFraktionen).catch(console.error);
    api.getAlignment().then(setAlignment).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="loading">Loading...</div>;

  return (
    <div>
      <h1>Parties</h1>
      <div className="grid grid-3">
        {parties.map(p => {
          const fraktion = fraktionen.find(f => f.partyId === p.id);
          const isMyParty = user?.partyId === p.id;
          const displayColor = p.color === "#FFED00" ? "#c4a900" : p.color;
          return (
          <div key={p.id} style={{ position: "relative" }}>
          <Link to={`/parties/${p.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card party-card" style={{ borderColor: p.color }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="party-name">{p.name}</div>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {isMyParty && (
                  <span style={{ fontSize: "0.7rem", fontWeight: 700, color: displayColor }}>Your Party ✓</span>
                )}
                <span
                  className="badge"
                  style={{
                    background: fraktion ? "#28a745" : "#6c757d",
                    color: "white",
                    fontSize: "0.7rem",
                    padding: "2px 6px",
                  }}
                >
                  {fraktion ? "Fraktion" : "No Fraktion"}
                </span>
                <span className={`badge ${ROLE_BADGE[p.coalitionRole] || ""}`}>
                  {p.coalitionRole}
                </span>
              </div>
            </div>
            {fraktion && (
              <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 2 }}>
                Fraktion Leader: {fraktion.leaderName}
              </div>
            )}
            <div className="party-meta">{p.ideology}</div>
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "1.5rem", alignItems: "flex-end" }}>
              <div>
                <div className="stat-value" style={{ fontSize: "1.4rem" }}>{p.seatCount}</div>
                <div className="stat-label">Seats</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1 }}>
                <div>
                  <div className="stat-value" style={{ fontSize: "1.4rem" }}>{p.approvalRating.toFixed(1)}%</div>
                  <div className="stat-label">Approval</div>
                </div>
                {p.recentApprovals && p.recentApprovals.length >= 2 && (
                  <Sparkline
                    values={p.recentApprovals}
                    color={p.color === "#FFED00" ? "#c4a900" : p.color}
                  />
                )}
              </div>
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <div className="stat-label">Policy Priorities</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
                {Object.entries(p.policyPriorities).map(([key, val]) => (
                  <span
                    key={key}
                    style={{
                      fontSize: "0.7rem",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "4px",
                      background: val > 0 ? "#d4edda" : val < 0 ? "#f8d7da" : "#e2e3e5",
                    }}
                  >
                    {key}: {val > 0 ? "+" : ""}{val}
                  </span>
                ))}
              </div>
            </div>
            {/* Member count + Join button */}
            <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.78rem", color: "#888" }}>
                👥 {p.memberCount} member{p.memberCount !== 1 ? "s" : ""}
                {p.memberCount > 0 && (() => {
                  const bonus = Math.min(5, Math.log10(p.memberCount + 1) * 2.5) * 0.01;
                  return <span style={{ marginLeft: 4, color: "#28a745" }}>+{(bonus).toFixed(3)}/day</span>;
                })()}
              </span>
              {!isMyParty && (
                <button
                  onClick={e => { e.preventDefault(); setJoiningParty(p); }}
                  style={{
                    fontSize: "0.75rem", padding: "3px 10px", borderRadius: 4,
                    border: `1px solid ${displayColor}`, background: "white",
                    color: displayColor, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Join
                </button>
              )}
            </div>
          </div>
          </Link>
          </div>
          );
        })}
      </div>

      {/* Vote Alignment Matrix */}
      {alignment && (
        <div className="section" style={{ marginTop: "2rem" }}>
          <h2>Vote Alignment</h2>
          <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 12 }}>
            Percentage of votes where each pair of parties voted the same way. Requires at least 3 shared votes to show a value.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 400 }}>
              <thead>
                <tr>
                  <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #ccc", background: "#f8f8f8" }}>
                    Party
                  </th>
                  {alignment.parties.map(p => {
                    const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                    return (
                      <th key={p.id} style={{ padding: "6px 8px", textAlign: "center", borderBottom: "2px solid #ccc", background: "#f8f8f8", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: color, marginRight: 4 }} />
                        {p.name}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {alignment.parties.map(rowParty => {
                  const rowColor = rowParty.color === "#FFED00" ? "#c4a900" : rowParty.color;
                  return (
                    <tr key={rowParty.id}>
                      <td style={{ padding: "6px 10px", fontWeight: 600, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", backgroundColor: rowColor, marginRight: 6 }} />
                        {rowParty.name}
                      </td>
                      {alignment.parties.map(colParty => {
                        const val = alignment.matrix[rowParty.id]?.[colParty.id];
                        const isSelf = rowParty.id === colParty.id;
                        let bg = "#f0f0f0";
                        let textColor = "#888";
                        if (!isSelf && val != null) {
                          bg = `hsl(${val * 1.2}, 65%, 88%)`;
                          textColor = val >= 60 ? "#1a5c2a" : val >= 40 ? "#5c3a00" : "#5c1a1a";
                        }
                        return (
                          <td key={colParty.id} style={{
                            padding: "6px 8px",
                            textAlign: "center",
                            borderBottom: "1px solid #eee",
                            background: bg,
                            color: textColor,
                            fontWeight: val != null && !isSelf ? 600 : 400,
                            minWidth: 56,
                          }}>
                            {isSelf ? "—" : val != null ? `${val}%` : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {joiningParty && (
        <JoinModal
          party={joiningParty}
          onClose={() => setJoiningParty(null)}
          onJoined={() => { refresh(); setJoiningParty(null); }}
        />
      )}
    </div>
  );
}
