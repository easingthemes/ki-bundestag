import { useEffect, useState, useCallback } from "react";
import { api, SimulationEvent, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/ui";

const EVENT_CATEGORIES: Record<string, { label: string; types: string[] }> = {
  legislative: {
    label: "Legislative",
    types: ["bill_proposed", "bill_debate", "bill_passed", "bill_rejected"],
  },
  crises: {
    label: "Crises",
    types: ["crisis_start", "crisis_end"],
  },
  elections: {
    label: "Elections",
    types: ["election_announced", "election_campaign", "election_result", "government_formed", "negotiation_round", "negotiation_complete"],
  },
  statements: {
    label: "Statements",
    types: ["statement", "vote_cast"],
  },
  system: {
    label: "System",
    types: ["economy_update", "weekly_report", "monthly_report", "day_start"],
  },
};

const BREAKING_TYPES = new Set([
  "election_result",
  "government_formed",
  "election_announced",
  "negotiation_complete",
]);

const HIGH_BREAKING_TYPES = new Set([
  "election_result",
  "government_formed",
]);

const EVENT_BORDER_COLOR: Record<string, string> = {
  bill_proposed: "#17a2b8",
  bill_debate: "#ffc107",
  bill_passed: "#28a745",
  bill_rejected: "#dc3545",
  crisis_start: "#dc3545",
  crisis_end: "#28a745",
  election_announced: "#004b91",
  election_campaign: "#6f42c1",
  election_result: "#004b91",
  government_formed: "#004b91",
  negotiation_round: "#6f42c1",
  negotiation_complete: "#004b91",
  statement: "#555",
  vote_cast: "#888",
  economy_update: "#6c757d",
  weekly_report: "#6c757d",
  monthly_report: "#6c757d",
  day_start: "#adb5bd",
};

const PAGE_SIZE = 50;
const DAY_INITIAL = 5;

export function NewsFeed() {
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [parties, setParties] = useState<Party[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [dayLimits, setDayLimits] = useState<Record<number, number>>({});

  const activeTypeString = activeFilters.size > 0
    ? Array.from(activeFilters).join(",")
    : undefined;

  const refresh = useCallback(() => {
    api.getEvents(PAGE_SIZE, offset, activeTypeString)
      .then(({ events: ev, total: t }) => {
        if (offset === 0) {
          setEvents(ev);
        } else {
          setEvents(prev => [...prev, ...ev]);
        }
        setTotal(t);
      })
      .catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [offset, activeTypeString]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const toggleFilter = (type: string) => {
    setOffset(0);
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleCategory = (types: string[]) => {
    setOffset(0);
    setActiveFilters(prev => {
      const next = new Set(prev);
      const allActive = types.every(t => next.has(t));
      if (allActive) {
        types.forEach(t => next.delete(t));
      } else {
        types.forEach(t => next.add(t));
      }
      return next;
    });
  };

  const clearFilters = () => {
    setOffset(0);
    setDayLimits({});
    setActiveFilters(new Set());
  };

  const getPartyName = (id: string) => parties.find(p => p.id === id)?.name || id;
  const getPartyColor = (id: string) => {
    const p = parties.find(pp => pp.id === id);
    if (!p) return "#888";
    return p.color === "#FFED00" ? "#c4a900" : p.color;
  };

  // Group events by day
  const dayGroups: { dayNumber: number; events: SimulationEvent[] }[] = [];
  let currentDayGroup: { dayNumber: number; events: SimulationEvent[] } | null = null;

  for (const ev of events) {
    if (!currentDayGroup || currentDayGroup.dayNumber !== ev.dayNumber) {
      currentDayGroup = { dayNumber: ev.dayNumber, events: [] };
      dayGroups.push(currentDayGroup);
    }
    currentDayGroup.events.push(ev);
  }

  return (
    <div>
      <h1>News Feed</h1>

      {/* Filter bar */}
      <div className="news-filter-bar">
        {Object.entries(EVENT_CATEGORIES).map(([catKey, cat]) => (
          <div key={catKey} style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <button
              className={`news-filter-btn ${cat.types.every(t => activeFilters.has(t)) ? "active" : ""}`}
              onClick={() => toggleCategory(cat.types)}
              style={{ fontWeight: 600, fontSize: "0.8rem" }}
            >
              {cat.label}
            </button>
            {cat.types.map(type => (
              <button
                key={type}
                className={`news-filter-btn ${activeFilters.has(type) ? "active" : ""}`}
                onClick={() => toggleFilter(type)}
                style={{ borderLeftColor: EVENT_BORDER_COLOR[type] || "#888" }}
              >
                {type.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        ))}
        {activeFilters.size > 0 && (
          <button className="news-filter-btn" onClick={clearFilters} style={{ color: "#dc3545" }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Event stream */}
      {dayGroups.length === 0 ? (
        <div className="loading">No events yet. Run the simulation first.</div>
      ) : (
        <div>
          {dayGroups.map(group => {
            const dayEvents = group.events.filter(e => e.type !== "day_start");
            const limit = dayLimits[group.dayNumber] ?? DAY_INITIAL;
            const visible = dayEvents.slice(0, limit);
            return (
              <div key={group.dayNumber}>
                <div className="news-day-separator">Day {group.dayNumber} ({dayEvents.length})</div>
                {visible.map(ev => {
                  const isBreaking = BREAKING_TYPES.has(ev.type);
                  const isHighBreaking = HIGH_BREAKING_TYPES.has(ev.type);
                  const isCrisisHigh = ev.type === "crisis_start" && ev.data?.severity === "high";
                  const showBreaking = isBreaking || isCrisisHigh;

                  return (
                    <div
                      key={ev.id}
                      className={`news-card ${showBreaking ? "news-card-breaking" : ""}`}
                      style={{
                        borderLeftColor: EVENT_BORDER_COLOR[ev.type] || "#888",
                        ...(isHighBreaking ? { background: "#f8f9ff" } : {}),
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          {showBreaking && (
                            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#dc3545", textTransform: "uppercase", marginBottom: 2 }}>
                              Breaking
                            </div>
                          )}
                          <div style={{ fontWeight: 600, fontSize: showBreaking ? "1rem" : "0.9rem" }}>
                            {ev.title}
                          </div>
                          <div style={{ fontSize: "0.85rem", color: "#555", marginTop: 4 }}>
                            {ev.description}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <span style={{
                            fontSize: "0.65rem",
                            padding: "1px 6px",
                            borderRadius: 3,
                            background: "#f0f0f0",
                            color: "#666",
                            whiteSpace: "nowrap",
                          }}>
                            {ev.type.replace(/_/g, " ")}
                          </span>
                          {ev.actor !== "system" && (
                            <span style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: getPartyColor(ev.actor),
                            }}>
                              {getPartyName(ev.actor)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <ShowMoreButton
                  total={dayEvents.length}
                  visible={visible.length}
                  increment={5}
                  onShowMore={() => setDayLimits(prev => ({ ...prev, [group.dayNumber]: limit + 5 }))}
                />
              </div>
            );
          })}

          {/* Load more */}
          {events.length < total && (
            <div style={{ textAlign: "center", padding: "1.5rem" }}>
              <button
                onClick={() => setOffset(events.length)}
                style={{
                  padding: "0.5rem 2rem",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Load more ({total - events.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
