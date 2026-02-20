import { useState, useCallback, useEffect } from "react";
import { api, Budget as BudgetRecord, BudgetAllocations, Party, SimulationStatus } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/ui";

const MINISTRY_LABELS: Record<keyof BudgetAllocations, string> = {
  finance: "Finance",
  labour: "Labour & Social",
  environment: "Environment",
  interior: "Interior",
  defence: "Defence",
  education: "Education",
  health: "Health",
  infrastructure: "Infrastructure",
};

const MINISTRY_COLORS: Record<keyof BudgetAllocations, string> = {
  finance: "#4a6fa5",
  labour: "#e3000f",
  environment: "#64a12d",
  interior: "#5c5c5c",
  defence: "#8b6914",
  education: "#0070bb",
  health: "#c0392b",
  infrastructure: "#7f8c8d",
};

const TOTAL_SEATS = 735;

export function Budget() {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [filter, setFilter] = useState<"all" | "passed" | "rejected">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(3);

  const refresh = useCallback(() => {
    api.getBudgets().then(setBudgets).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = filter === "all" ? budgets : budgets.filter(b => b.status === filter);

  useEffect(() => { setVisibleCount(3); }, [filter]);

  const passedCount = budgets.filter(b => b.status === "passed").length;
  const rejectedCount = budgets.filter(b => b.status === "rejected").length;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h1>Bundeshaushalt</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Annual budget cycles — every 60 simulation days, the coalition proposes a 300B EUR budget across 8 ministries.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {(["all", "passed", "rejected"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-btn${filter === f ? " active" : ""}`}
          >
            {f === "all" ? `All (${budgets.length})` : f === "passed" ? `Passed (${passedCount})` : `Rejected (${rejectedCount})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="loading">
          {budgets.length === 0
            ? "No budget cycles yet. Budget votes occur every 60 simulation days."
            : "No budgets match the current filter."}
        </div>
      )}

      {filtered.slice(0, visibleCount).map(budget => {
        const isOpen = expanded.has(budget.id);
        return (
          <div
            key={budget.id}
            className={`budget-card ${budget.status === "passed" ? "budget-passed" : "budget-rejected"}`}
            style={{ marginBottom: "1rem" }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              onClick={() => toggleExpand(budget.id)}
            >
              <div>
                <strong>Budget Cycle {budget.cycleNumber}</strong>
                <span style={{ marginLeft: "0.75rem", fontSize: "0.85rem", color: "#666" }}>
                  Day {budget.proposedOnDay}
                </span>
                {budget.revisionAttempt > 0 && (
                  <span className="badge badge-revision" style={{ marginLeft: 6 }}>Revised</span>
                )}
                {budget.status === "rejected" && budget.revisionAttempt === 0 && simStatus?.budgetRetryDay != null && (
                  <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#856404" }}>
                    Retry Day {simStatus.budgetRetryDay}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <span className={`badge ${budget.status === "passed" ? "badge-budget-passed" : "badge-budget-rejected"}`}>
                  {budget.status === "passed" ? "Passed" : "Rejected"}
                </span>
                <span style={{ color: "#888", fontSize: "0.8rem" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Seat vote bar */}
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
                Parliament vote — Yes: {budget.yesSeats ?? 0} / No: {budget.noSeats ?? 0} seats
              </div>
              <div className="vote-bar">
                <div
                  className="vote-bar-yes"
                  style={{ width: `${((budget.yesSeats ?? 0) / TOTAL_SEATS) * 100}%` }}
                />
                <div
                  className="vote-bar-no"
                  style={{ width: `${((budget.noSeats ?? 0) / TOTAL_SEATS) * 100}%` }}
                />
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: "1rem", borderTop: "1px solid #eee", paddingTop: "1rem" }}>
                {/* Ministry allocations */}
                <div style={{ marginBottom: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    Ministry Allocations (Total: {budget.totalAmount}B EUR)
                  </div>
                  {(Object.keys(budget.allocations) as (keyof BudgetAllocations)[]).map(k => {
                    const amount = budget.allocations[k];
                    const share = (amount / budget.totalAmount) * 100;
                    const color = MINISTRY_COLORS[k] || "#999";
                    return (
                      <div key={k} className="budget-allocation-row">
                        <div style={{ minWidth: "140px", fontSize: "0.8rem" }}>
                          {MINISTRY_LABELS[k]}
                        </div>
                        <div style={{ minWidth: "70px", fontSize: "0.8rem", textAlign: "right", color: "#444" }}>
                          {amount.toFixed(1)}B
                        </div>
                        <div style={{ minWidth: "44px", fontSize: "0.75rem", color: "#888", textAlign: "right" }}>
                          {share.toFixed(1)}%
                        </div>
                        <div className="budget-allocation-bar" style={{ flex: 1 }}>
                          <div
                            className="budget-allocation-fill"
                            style={{ width: `${share}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Economic effect */}
                {budget.economicEffect && Object.keys(budget.economicEffect).length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Economic Effects
                    </div>
                    {Object.entries(budget.economicEffect).map(([key, delta]) => {
                      const d = delta as number;
                      return (
                        <div key={key} style={{ fontSize: "0.8rem", color: d > 0 ? "#155724" : "#721c24" }}>
                          {key}: {d > 0 ? "+" : ""}{d}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Party vote breakdown */}
                {budget.votes.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Party Votes
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {budget.votes.map(v => {
                        const party = partyMap.get(v.partyId);
                        return (
                          <span
                            key={v.partyId}
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: "10px",
                              background: v.vote === "yes" ? "#d4edda" : "#f8d7da",
                              color: v.vote === "yes" ? "#155724" : "#721c24",
                              border: `1px solid ${party?.color || "#ccc"}`,
                            }}
                          >
                            {party?.name ?? v.partyId}: {v.vote} ({v.seats})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={3}
        onShowMore={() => setVisibleCount(c => c + 3)}
      />
    </div>
  );
}
