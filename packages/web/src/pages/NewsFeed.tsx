import { useEffect, useState, useCallback } from "react";
import { api, SimulationEvent, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SEMANTIC_HEX } from "@/lib/colors";

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
  bill_proposed: "#0891b2",
  bill_debate: "#f59e0b",
  bill_passed: "#10b981",
  bill_rejected: "#ef4444",
  crisis_start: "#ef4444",
  crisis_end: "#10b981",
  election_announced: "#1d4ed8",
  election_campaign: "#7c3aed",
  election_result: "#1d4ed8",
  government_formed: "#1d4ed8",
  negotiation_round: "#7c3aed",
  negotiation_complete: "#1d4ed8",
  statement: "#71717a",
  vote_cast: "#a1a1aa",
  economy_update: "#71717a",
  weekly_report: "#71717a",
  monthly_report: "#71717a",
  day_start: "#d4d4d8",
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
      <Card className="mb-6">
        <CardContent className="p-4 flex flex-wrap gap-2">
          {Object.entries(EVENT_CATEGORIES).map(([catKey, cat]) => (
            <div key={catKey} className="flex items-center gap-1 flex-wrap">
              <button
                className={cn(
                  "px-3 py-1 border rounded-full text-xs font-semibold cursor-pointer transition-colors",
                  cat.types.every(t => activeFilters.has(t))
                    ? "bg-primary border-primary text-white"
                    : "bg-card border-input text-muted-foreground hover:bg-accent hover:border-border"
                )}
                onClick={() => toggleCategory(cat.types)}
              >
                {cat.label}
              </button>
              {cat.types.map(type => (
                <button
                  key={type}
                  className={cn(
                    "px-3 py-1 border rounded-full text-xs font-medium cursor-pointer transition-colors",
                    activeFilters.has(type)
                      ? "bg-primary border-primary text-white"
                      : "bg-card border-input text-muted-foreground hover:bg-accent hover:border-border"
                  )}
                  onClick={() => toggleFilter(type)}
                  style={{ borderLeftColor: EVENT_BORDER_COLOR[type] || "#888" }}
                >
                  {type.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          ))}
          {activeFilters.size > 0 && (
            <button
              className="px-3 py-1 border border-input rounded-full text-xs font-medium cursor-pointer text-destructive bg-card hover:bg-accent"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </CardContent>
      </Card>

      {/* Event stream */}
      {dayGroups.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No events yet. Run the simulation first.</p>
      ) : (
        <div>
          {dayGroups.map(group => {
            const dayEvents = group.events.filter(e => e.type !== "day_start");
            const limit = dayLimits[group.dayNumber] ?? DAY_INITIAL;
            const visibleEvents = dayEvents.slice(0, limit);
            return (
              <div key={group.dayNumber}>
                <div className="font-bold text-sm text-foreground py-2 mt-4 mb-1 border-b border-border">
                  Day {group.dayNumber} ({dayEvents.length})
                </div>
                {visibleEvents.map(ev => {
                  const isBreaking = BREAKING_TYPES.has(ev.type);
                  const isHighBreaking = HIGH_BREAKING_TYPES.has(ev.type);
                  const isCrisisHigh = ev.type === "crisis_start" && ev.data?.severity === "high";
                  const showBreaking = isBreaking || isCrisisHigh;

                  return (
                    <Card
                      key={ev.id}
                      className={cn("mb-1.5", showBreaking && "border-l-[5px]")}
                      style={{
                        borderLeftColor: showBreaking ? SEMANTIC_HEX.negative : (EVENT_BORDER_COLOR[ev.type] || "#888"),
                        borderLeftWidth: 4,
                        ...(isHighBreaking ? { background: "var(--color-muted)" } : {}),
                      }}
                    >
                      <CardContent className="p-3 px-4">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            {showBreaking && (
                              <div className="text-xs font-bold text-destructive uppercase mb-0.5">Breaking</div>
                            )}
                            <div className={cn("font-semibold", showBreaking ? "text-base" : "text-sm")}>
                              {ev.title}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{ev.description}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant="outline" className="text-muted-foreground text-xs">
                              {ev.type.replace(/_/g, " ")}
                            </Badge>
                            {ev.actor !== "system" && (
                              <span className="text-xs font-semibold" style={{ color: getPartyColor(ev.actor) }}>
                                {getPartyName(ev.actor)}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <ShowMoreButton
                  total={dayEvents.length}
                  visible={visibleEvents.length}
                  increment={5}
                  onShowMore={() => setDayLimits(prev => ({ ...prev, [group.dayNumber]: limit + 5 }))}
                />
              </div>
            );
          })}

          {/* Load more */}
          {events.length < total && (
            <div className="text-center py-6">
              <button
                onClick={() => setOffset(events.length)}
                className="py-2 px-8 rounded border border-input bg-card cursor-pointer text-sm hover:bg-accent"
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
