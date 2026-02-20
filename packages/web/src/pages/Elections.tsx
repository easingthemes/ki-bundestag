import { useEffect, useState, useCallback } from "react";
import { api, type Election, type ElectionResult, type NationalState, type Party, type SimulationStatus, type Fraktion } from "../api";
import { usePolling } from "../usePolling";

const MAJORITY_THRESHOLD = 368;

function ideologicalSpread(selected: Party[]): number | null {
  if (selected.length < 2) return null;
  let total = 0, pairs = 0;
  const keys = ["economy", "social", "environment", "immigration", "spending"] as const;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const dist = keys.reduce((s, k) =>
        s + Math.abs(((selected[i].policyPriorities as Record<string, number>)[k] ?? 0) - ((selected[j].policyPriorities as Record<string, number>)[k] ?? 0)), 0);
      total += dist; pairs++;
    }
  }
  return Math.round((total / pairs) * 10) / 10;
}

function CoalitionCalculator({ parties, currentCoalitionIds }: { parties: Party[]; currentCoalitionIds: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentCoalitionIds));

  const seatedParties = [...parties].filter(p => p.seatCount > 0).sort((a, b) => b.seatCount - a.seatCount);
  const totalSeats = seatedParties.reduce((s, p) => s + p.seatCount, 0) || 735;
  const selectedParties = seatedParties.filter(p => selected.has(p.id));
  const selectedSeats = selectedParties.reduce((s, p) => s + p.seatCount, 0);
  const hasMajority = selectedSeats >= MAJORITY_THRESHOLD;
  const spread = ideologicalSpread(selectedParties);
  const spreadLabel = spread == null ? null : spread <= 1.0 ? "Compatible" : spread <= 2.0 ? "Manageable" : "Fragmented";
  const spreadColor = spread == null ? "#888" : spread <= 1.0 ? "#28a745" : spread <= 2.0 ? "#fd7e14" : "#dc3545";

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="section">
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12 }}>
        Coalition Calculator
      </h2>
      <div className="card">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {seatedParties.map(p => {
            const color = p.color === "#FFED00" ? "#c4a900" : p.color;
            const isSelected = selected.has(p.id);
            const barWidth = (p.seatCount / totalSeats) * 100;
            return (
              <div
                key={p.id}
                onClick={() => toggle(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  padding: "6px 8px", borderRadius: 4,
                  background: isSelected ? `${color}18` : "transparent",
                  border: `1px solid ${isSelected ? color : "#eee"}`,
                  opacity: isSelected ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(p.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ cursor: "pointer", width: 14, height: 14 }}
                />
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: "0.88rem", minWidth: 60 }}>{p.name}</span>
                <span style={{ fontSize: "0.82rem", color: "#666", minWidth: 64 }}>{p.seatCount} seats</span>
                <div style={{ flex: 1, background: "#e8e8e8", borderRadius: 3, height: 8, maxWidth: 180 }}>
                  <div style={{ width: `${barWidth}%`, height: "100%", borderRadius: 3, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>
            <span style={{ color: hasMajority ? "#28a745" : "#dc3545" }}>
              {selectedSeats} / {totalSeats} seats
            </span>
            <span style={{ marginLeft: 10, fontSize: "0.85rem", fontWeight: 800, color: hasMajority ? "#28a745" : "#dc3545" }}>
              {hasMajority ? "MAJORITY ✓" : "MINORITY ✗"}
            </span>
          </div>
          {spread != null && (
            <div style={{ fontSize: "0.85rem" }}>
              <span style={{ color: "#888" }}>Ideology spread: </span>
              <span style={{ fontWeight: 700, color: spreadColor }}>{spread} — {spreadLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BundesadlerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,215,0,0.9)">
      <path d="M12 2 C10 3 6 4 4 7 L7 8 C5 10 4 12 5 14 L8 13 C9 16 10 18 12 20 C14 18 15 16 16 13 L19 14 C20 12 19 10 17 8 L20 7 C18 4 14 3 12 2Z" />
    </svg>
  );
}

function avatarUrl(name: string, color: string, size = 32): string {
  const bg = (color === "#FFED00" ? "#c4a900" : color).replace("#", "");
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=${size * 2}&bold=true&background=${bg}&color=fff&rounded=true`;
}

/** Draw a hemicycle (half-donut) seat distribution as SVG */
function Hemicycle({ results, parties }: { results: ElectionResult[]; parties: Party[] }) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => {
    // Order left to right politically: Linke, Grüne, SPD, FDP, CDU, AfD
    const order = ["linke", "gruene", "spd", "fdp", "cdu", "afd"];
    return order.indexOf(a.partyId) - order.indexOf(b.partyId);
  });

  const totalSeats = sorted.reduce((s, r) => s + r.seatsWon, 0);

  // Build arcs for a semicircle from left (π) to right (0)
  const cx = 200;
  const cy = 190;
  const outerR = 170;
  const innerR = 95;
  const gap = 0.01; // small gap between segments

  let currentAngle = Math.PI; // start at left

  const arcs = sorted.map(r => {
    const party = parties.find(p => p.id === r.partyId);
    const sweep = (r.seatsWon / totalSeats) * Math.PI - gap;
    const startAngle = currentAngle;
    const endAngle = currentAngle - sweep;
    currentAngle = endAngle - gap;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy - outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy - outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy - innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy - innerR * Math.sin(startAngle);

    const largeArc = sweep > Math.PI ? 1 : 0;

    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      `Z`,
    ].join(" ");

    return {
      d,
      color: party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999"),
      partyId: r.partyId,
    };
  });

  return (
    <svg viewBox="0 0 400 210" style={{ width: "100%", maxWidth: 360 }}>
      {arcs.map(arc => (
        <path key={arc.partyId} d={arc.d} fill={arc.color} />
      ))}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="22" fontWeight="700" fill="#333">
        {totalSeats} seats
      </text>
    </svg>
  );
}

/** Horizontal bar chart for vote percentages, styled like the reference page */
function VoteBarChart({
  results,
  parties,
  previousResults,
}: {
  results: ElectionResult[];
  parties: Party[];
  previousResults: ElectionResult[] | null;
}) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => b.votesPercent - a.votesPercent);
  const maxPct = Math.ceil(Math.max(...sorted.map(r => r.votesPercent)) / 5) * 5 + 5;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
      {/* Y-axis labels */}
      <div style={{ display: "flex", alignItems: "flex-end", height: 200, gap: 0, paddingLeft: 0 }}>
        {sorted.map(r => {
          const party = parties.find(p => p.id === r.partyId);
          const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
          const prevResult = previousResults?.find(pr => pr.partyId === r.partyId);
          const barHeight = (r.votesPercent / maxPct) * 180;
          const prevBarHeight = prevResult ? (prevResult.votesPercent / maxPct) * 180 : 0;

          return (
            <div key={r.partyId} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 2 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#333" }}>{r.votesPercent}%</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 180 }}>
                <div style={{
                  width: 24,
                  height: barHeight,
                  backgroundColor: color,
                  borderRadius: "2px 2px 0 0",
                }} />
                {previousResults && (
                  <div style={{
                    width: 16,
                    height: prevBarHeight,
                    backgroundColor: "#ccc",
                    borderRadius: "2px 2px 0 0",
                  }} />
                )}
              </div>
              <span style={{ fontSize: "0.7rem", color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 64, textAlign: "center" }}>
                {party?.name || r.partyId}
              </span>
            </div>
          );
        })}
      </div>
      {previousResults && (
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, fontSize: "0.75rem", color: "#666" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, backgroundColor: "#555", display: "inline-block" }} /> Current
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 12, height: 12, backgroundColor: "#ccc", display: "inline-block" }} /> Previous
          </span>
        </div>
      )}
    </div>
  );
}

function formatDelta(n: number): string {
  if (n > 0) return `+${n}`;
  if (n === 0) return "\u00B10";
  return `${n}`;
}

function formatPctDelta(current: number, previous: number | undefined): string {
  if (previous === undefined) return "-";
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff > 0) return `+${diff}`;
  if (diff === 0) return "\u00B10.0";
  return `${diff}`;
}

export function Elections() {
  const [elections, setElections] = useState<Election[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [fraktionen, setFraktionen] = useState<Fraktion[]>([]);
  const [state, setState] = useState<NationalState | null>(null);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getElections().then(el => {
      const sorted = [...el].sort((a, b) => b.electionDay - a.electionDay);
      setElections(sorted);
      if (!selectedId && sorted.length > 0) {
        setSelectedId(sorted[0].id);
      }
    }).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getFraktionen().then(setFraktionen).catch(console.error);
    api.getState().then(setState).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
  }, [selectedId]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const selected = elections.find(e => e.id === selectedId) || null;
  const selectedIndex = elections.findIndex(e => e.id === selectedId);
  const previousElection = selectedIndex >= 0 && selectedIndex < elections.length - 1
    ? elections[selectedIndex + 1]
    : null;

  // Build map: partyId → active fraktion leader name
  const fraktionLeaderMap = new Map<string, string>();
  for (const f of fraktionen) {
    if (f.status === "active" || !fraktionLeaderMap.has(f.partyId)) {
      fraktionLeaderMap.set(f.partyId, f.leaderName);
    }
  }

  // No elections yet — show current Bundestag composition from seeded/live party data
  if (elections.length === 0 && parties.length > 0 && state) {
    const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
    const currentResults: ElectionResult[] = parties.map(p => ({
      partyId: p.id,
      seatsWon: p.seatCount,
      votesPercent: Math.round((p.seatCount / totalSeats) * 1000) / 10,
      seatDelta: 0,
    }));
    const coalitionIds = state.coalitionParties;
    const oppositionIds = state.oppositionParties;
    const coalitionSeats = parties
      .filter(p => coalitionIds.includes(p.id))
      .reduce((s, p) => s + p.seatCount, 0);

    return (
      <div>
        <div className="election-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BundesadlerIcon size={28} />
            <h1 style={{ margin: 0, color: "white", fontSize: "1.4rem" }}>Bundestag — Current Composition</h1>
          </div>
          {simStatus && (
            <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.8)", marginTop: 6 }}>
              Next scheduled election: <strong>Day {simStatus.nextElectionDay}</strong>
              {simStatus.nextElectionDay > simStatus.currentDay && (
                <span style={{ color: "rgba(255,255,255,0.65)" }}> — {simStatus.nextElectionDay - simStatus.currentDay} days from now</span>
              )}
            </div>
          )}
        </div>
        <div className="section" style={{ marginTop: "1.5rem" }}>
          <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: 12 }}>
            Initial seating — no election has been simulated yet. Trigger one via Admin or wait until Day 120.
          </div>

          <div className="election-seats-grid">
            <div>
              <Hemicycle results={currentResults} parties={parties} />
              <div style={{ textAlign: "center", fontSize: "0.8rem", color: "#666", marginTop: 4 }}>
                Coalition majority: {coalitionSeats} / {totalSeats} seats
              </div>
            </div>
            <div>
              <table className="election-seats-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Political party</th>
                    <th style={{ textAlign: "right" }}>Seats</th>
                    <th style={{ textAlign: "right" }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {[...parties]
                    .sort((a, b) => b.seatCount - a.seatCount)
                    .map(p => {
                      const color = p.color === "#FFED00" ? "#c4a900" : p.color;
                      const role = p.coalitionRole;
                      return (
                        <tr key={p.id}>
                          <td>
                            <span style={{
                              display: "inline-block", width: 12, height: 12,
                              borderRadius: "50%", backgroundColor: color,
                              marginRight: 8, verticalAlign: "middle",
                            }} />
                            <strong>{p.name}</strong>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{p.seatCount}</td>
                          <td style={{ textAlign: "right" }}>
                            <span className={`badge badge-${role}`} style={{ fontSize: "0.7rem" }}>
                              {role}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="section">
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12 }}>
            Government
          </h2>
          <div className="card">
            <div style={{ marginBottom: 12 }}>
              <strong>Coalition</strong>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {coalitionIds.map(id => {
                  const p = parties.find(x => x.id === id);
                  const color = p?.color === "#FFED00" ? "#c4a900" : (p?.color || "#999");
                  return (
                    <div key={id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 12px", borderRadius: 4,
                      border: `2px solid ${color}`, background: `${color}18`,
                      fontSize: "0.9rem", fontWeight: 600,
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
                      {p?.name || id}
                      <span style={{ fontWeight: 400, color: "#666" }}>({p?.seatCount})</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <strong>Opposition</strong>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {oppositionIds.map(id => {
                  const p = parties.find(x => x.id === id);
                  return (
                    <div key={id} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "4px 12px", borderRadius: 4,
                      border: "1px solid #ddd", fontSize: "0.85rem", color: "#555",
                    }}>
                      {p?.name || id}
                      <span style={{ color: "#888" }}>({p?.seatCount})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <CoalitionCalculator parties={parties} currentCoalitionIds={coalitionIds} />
      </div>
    );
  }

  // Still loading
  if (elections.length === 0) {
    return <div><h1>Elections</h1><div className="loading">Loading…</div></div>;
  }

  return (
    <div>
      {/* Header bar styled like bundeswahlleiterin */}
      <div className="election-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BundesadlerIcon size={28} />
          <h1 style={{ margin: 0, color: "white", fontSize: "1.4rem" }}>Bundestag Election</h1>
        </div>
        {simStatus && !selected && (
          <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
            Next election: Day {simStatus.nextElectionDay}
            {simStatus.nextElectionDay > simStatus.currentDay && ` (in ${simStatus.nextElectionDay - simStatus.currentDay} days)`}
          </div>
        )}
      </div>

      {/* Election selector */}
      <div className="section" style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <label htmlFor="election-select" style={{ fontWeight: 600 }}>Select election:</label>
          <select
            id="election-select"
            value={selectedId || ""}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: 4,
              border: "1px solid #ccc",
              fontSize: "0.9rem",
              background: "white",
            }}
          >
            {elections.map(el => (
              <option key={el.id} value={el.id}>
                Day {el.electionDay} — {el.triggerReason} ({el.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selected && selected.status === "completed" && selected.results && (
        <>
          {/* Anchor links */}
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
            <a href="#seats" className="election-anchor">Distribution of seats</a>
            <a href="#votes" className="election-anchor">Votes</a>
            <a href="#results" className="election-anchor">Result table</a>
          </div>

          {/* Distribution of seats */}
          <div id="seats" className="section">
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 16 }}>
              Distribution of seats
            </h2>
            <div className="election-seats-grid">
              <div>
                <Hemicycle results={selected.results} parties={parties} />
              </div>
              <div>
                <table className="election-seats-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Political party</th>
                      <th style={{ textAlign: "right" }}>Seats</th>
                      <th style={{ textAlign: "right" }}>Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected.results]
                      .sort((a, b) => b.seatsWon - a.seatsWon)
                      .map(r => {
                        const party = parties.find(p => p.id === r.partyId);
                        const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                        const isCoalition = selected.newCoalition?.includes(r.partyId);
                        return (
                          <tr key={r.partyId}>
                            <td>
                              <span style={{
                                display: "inline-block",
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                backgroundColor: color,
                                marginRight: 8,
                                verticalAlign: "middle",
                              }} />
                              <strong>{party?.name || r.partyId}</strong>
                              {isCoalition && (
                                <span style={{ fontSize: "0.7rem", color: "#0066cc", marginLeft: 6 }}>
                                  {selected.newCoalition?.[0] === r.partyId ? "Leader" : "Coalition"}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{r.seatsWon}</td>
                            <td style={{
                              textAlign: "right",
                              color: r.seatDelta > 0 ? "#28a745" : r.seatDelta < 0 ? "#dc3545" : "#888",
                              fontWeight: 600,
                            }}>
                              {formatDelta(r.seatDelta)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Votes bar chart */}
          <div id="votes" className="section">
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 4 }}>
              Votes
            </h2>
            <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: 8 }}>
              Election Day {selected.electionDay}
            </div>
            <div className="card">
              <VoteBarChart
                results={selected.results}
                parties={parties}
                previousResults={previousElection?.results || null}
              />
            </div>
          </div>

          {/* Result table */}
          <div id="results" className="section">
            <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 4 }}>
              Result table
            </h2>
            <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: 12 }}>
              Final result
            </div>
            <div className="card" style={{ overflowX: "auto", padding: 0 }}>
              <table className="election-result-table">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ textAlign: "left", borderBottom: "2px solid #004b91" }}>Specification</th>
                    <th colSpan={3} style={{ textAlign: "center", borderBottom: "2px solid #004b91", color: "#004b91" }}>Votes</th>
                  </tr>
                  <tr>
                    <th style={{ textAlign: "right" }}>%</th>
                    <th style={{ textAlign: "right" }}>Seats</th>
                    <th style={{ textAlign: "right" }}>Diff. on prev.<br />in p.p.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="election-result-meta-row">
                    <td>Total seats</td>
                    <td style={{ textAlign: "right" }}>-</td>
                    <td style={{ textAlign: "right" }}>
                      {selected.results.reduce((s, r) => s + r.seatsWon, 0)}
                    </td>
                    <td style={{ textAlign: "right" }}>-</td>
                  </tr>
                  {[...selected.results]
                    .sort((a, b) => b.votesPercent - a.votesPercent)
                    .map(r => {
                      const party = parties.find(p => p.id === r.partyId);
                      const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                      const prevResult = previousElection?.results?.find(pr => pr.partyId === r.partyId);
                      return (
                        <tr key={r.partyId} className="election-result-party-row">
                          <td>
                            <span style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              backgroundColor: color,
                              marginRight: 8,
                              verticalAlign: "middle",
                            }} />
                            {party?.name || r.partyId}
                          </td>
                          <td style={{ textAlign: "right" }}>{r.votesPercent}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{r.seatsWon}</td>
                          <td style={{
                            textAlign: "right",
                            color: prevResult
                              ? (r.votesPercent - prevResult.votesPercent > 0 ? "#28a745" : r.votesPercent - prevResult.votesPercent < 0 ? "#dc3545" : "#888")
                              : "#888",
                          }}>
                            {formatPctDelta(r.votesPercent, prevResult?.votesPercent)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coalition info */}
          {selected.newCoalition && (
            <div className="section">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12 }}>
                Government
              </h2>
              <div className="card">
                <div style={{ marginBottom: 12 }}>
                  <strong>Coalition</strong>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {selected.newCoalition.map(id => {
                      const party = parties.find(p => p.id === id);
                      const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                      const result = selected.results!.find(r => r.partyId === id);
                      return (
                        <div key={id} style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 12px",
                          borderRadius: 4,
                          border: `2px solid ${color}`,
                          background: `${color}18`,
                          fontSize: "0.9rem",
                          fontWeight: 600,
                        }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
                          {party?.name || id}
                          {result && <span style={{ fontWeight: 400, color: "#666" }}>({result.seatsWon})</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {selected.newOpposition && selected.newOpposition.length > 0 && (
                  <div>
                    <strong>Opposition</strong>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {selected.newOpposition.map(id => {
                        const party = parties.find(p => p.id === id);
                        const result = selected.results!.find(r => r.partyId === id);
                        return (
                          <div key={id} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 12px",
                            borderRadius: 4,
                            border: "1px solid #ddd",
                            fontSize: "0.85rem",
                            color: "#555",
                          }}>
                            {party?.name || id}
                            {result && <span style={{ color: "#888" }}>({result.seatsWon})</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coalition Agreement (from negotiations) */}
          {selected.coalitionAgreement && (
            <div className="section">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12 }}>
                Coalition Agreement
              </h2>
              <div className="card">
                <p style={{ marginBottom: 12, lineHeight: 1.5 }}>{selected.coalitionAgreement.summary}</p>
                {selected.coalitionAgreement.keyPolicies.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <strong>Key Policies</strong>
                    <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                      {selected.coalitionAgreement.keyPolicies.map((p, i) => (
                        <li key={i} style={{ fontSize: "0.9rem", marginBottom: 4 }}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Object.keys(selected.coalitionAgreement.concessions).length > 0 && (
                  <div>
                    <strong>Concessions</strong>
                    <div style={{ marginTop: 4 }}>
                      {Object.entries(selected.coalitionAgreement.concessions).map(([partyId, concession]) => {
                        const party = parties.find(p => p.id === partyId);
                        return (
                          <div key={partyId} style={{ fontSize: "0.85rem", marginBottom: 4, color: "#555" }}>
                            <strong>{party?.name || partyId}:</strong> {concession}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Negotiation Rounds */}
          {selected.negotiationRounds && selected.negotiationRounds.length > 0 && (
            <div className="section">
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12 }}>
                Negotiation Rounds
              </h2>
              {selected.negotiationRounds.map((round, roundIdx) => (
                <div key={roundIdx} className="card" style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 8, color: "#004b91" }}>
                    Round {roundIdx + 1}
                  </h3>
                  {round.map(r => {
                    const party = parties.find(p => p.id === r.partyId);
                    const color = party?.color === "#FFED00" ? "#c4a900" : (party?.color || "#999");
                    const leaderName = fraktionLeaderMap.get(r.partyId);
                    return (
                      <div key={r.partyId} style={{ marginBottom: 10, paddingLeft: 12, borderLeft: `3px solid ${color}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: "0.9rem" }}>
                          {leaderName && party && (
                            <img
                              src={avatarUrl(leaderName, party.color, 32)}
                              alt={leaderName}
                              style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
                            />
                          )}
                          <span>{party?.name || r.partyId}{leaderName ? ` — ${leaderName}` : ""}</span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#333", marginTop: 2 }}>{r.position}</div>
                        <div style={{ fontSize: "0.8rem", color: "#666", marginTop: 2 }}>
                          Concession: {r.concession}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2 }}>
                          Acceptable partners: {r.acceptablePartners.map(id => parties.find(p => p.id === id)?.name || id).join(", ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Active (non-completed) election — includes negotiation status */}
      {selected && selected.status !== "completed" && (
        <div className="section" style={{ marginTop: "1rem" }}>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span className={`badge badge-crisis-${selected.status === "campaign" ? "high" : selected.status === "negotiation" ? "low" : "medium"}`} style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
                {selected.status.toUpperCase()}
              </span>
              <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>{selected.triggerReason}</span>
            </div>
            <div style={{ fontSize: "0.9rem", color: "#555" }}>
              <div>Announced on Day {selected.announcedOnDay}</div>
              <div>Campaign starts Day {selected.campaignStartDay}</div>
              <div>Election Day {selected.electionDay}</div>
              {simStatus && selected.status !== "negotiation" && selected.electionDay > simStatus.currentDay && (
                <div style={{ marginTop: 8, fontWeight: 700, fontSize: "1.1rem" }}>
                  {selected.electionDay - simStatus.currentDay} days until election
                </div>
              )}
              {selected.status === "negotiation" && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#004b91" }}>
                    Coalition Negotiations in Progress
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#666", marginTop: 4 }}>
                    Round {(selected.negotiationRounds?.length || 0)} of 3 completed
                  </div>
                  {selected.results && (
                    <div style={{ marginTop: 8 }}>
                      <Hemicycle results={selected.results} parties={parties} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {state && parties.length > 0 && (
        <CoalitionCalculator parties={parties} currentCoalitionIds={state.coalitionParties} />
      )}
    </div>
  );
}
