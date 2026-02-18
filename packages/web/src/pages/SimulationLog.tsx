import { useEffect, useState, useCallback } from "react";
import { api, DaySummary, SimulationEvent } from "../api";
import { usePolling } from "../usePolling";

function formatRealDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Bundestag sits Wed–Fri in ~22 sitting weeks/year. Map sim day to a plenary date label. */
function bundestagDayLabel(dayNumber: number): string {
  // 3 sitting days per week (Wed, Thu, Fri), so week = ceil(day/3)
  const weekIndex = Math.ceil(dayNumber / 3);
  const dayInWeek = ((dayNumber - 1) % 3); // 0=Wed, 1=Thu, 2=Fri
  const weekdayNames = ["Mi", "Do", "Fr"];
  return `${weekdayNames[dayInWeek]}, SW ${weekIndex}`;
}

export function SimulationLog() {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [dayEvents, setDayEvents] = useState<SimulationEvent[]>([]);

  const refresh = useCallback(() => {
    api.getDays().then(setDays).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const toggleDay = async (dayNumber: number) => {
    if (expanded === dayNumber) {
      setExpanded(null);
      return;
    }
    setExpanded(dayNumber);
    const events = await api.getDayEvents(dayNumber);
    setDayEvents(events);
  };

  return (
    <div>
      <h1>Simulation Log</h1>
      {days.length === 0 && (
        <div className="loading">No simulation data yet. Run the simulation to see the log.</div>
      )}
      {[...days].reverse().map(day => (
        <div key={day.dayNumber} style={{ marginBottom: "0.5rem" }}>
          <div
            className="day-header"
            onClick={() => toggleDay(day.dayNumber)}
          >
            <span>
              <strong>#{day.dayNumber}</strong>
              <span style={{ color: "#888", marginLeft: "0.5rem", fontSize: "0.85em" }}>
                {bundestagDayLabel(day.dayNumber)}
              </span>
            </span>
            <span style={{ marginLeft: "1rem" }}>{day.eventCount} events</span>
            {day.summary && <span style={{ color: "#555", marginLeft: "1rem" }}>{day.summary}</span>}
            <span style={{ float: "right", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {day.simulatedAt && (
                <span style={{ color: "#666", fontSize: "0.8em", fontWeight: "normal" }}>
                  {formatRealDate(day.simulatedAt)}
                </span>
              )}
              {expanded === day.dayNumber ? "▼" : "▶"}
            </span>
          </div>
          {expanded === day.dayNumber && (
            <div className="card">
              {dayEvents.map(ev => (
                <div key={ev.id} className="event-item">
                  <div className="event-type">{ev.type.replace(/_/g, " ")}</div>
                  <div className="event-title">{ev.title}</div>
                  <div className="event-desc">{ev.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
