import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, DaySummary, SimulationEvent } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { EVENT_TYPE_LABEL } from "@/lib/colors";

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
  const { t } = useTranslation("notifications");
  const [days, setDays] = useState<DaySummary[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [dayEvents, setDayEvents] = useState<SimulationEvent[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

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
      <h2 className="section-title">{t("simulationLog.title")}</h2>
      {days.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">{t("simulationLog.empty")}</p>
      )}
      {(() => {
        const reversed = [...days].reverse();
        return (
          <>
            {reversed.slice(0, visibleCount).map(day => (
              <div key={day.dayNumber} className="mb-2">
                <div
                  className="font-semibold py-3 px-3 bg-muted rounded cursor-pointer select-none mb-1 hover:bg-muted/80"
                  onClick={() => toggleDay(day.dayNumber)}
                >
                  <span>
                    <strong>#{day.dayNumber}</strong>
                    <span className="text-muted-foreground ml-2 text-[0.85em]">
                      {bundestagDayLabel(day.dayNumber)}
                    </span>
                  </span>
                  <span className="ml-4">{t("simulationLog.events", { count: day.eventCount })}</span>
                  {day.summary && <span className="text-muted-foreground ml-4">{day.summary}</span>}
                  <span className="float-right flex items-center gap-3">
                    {day.simulatedAt && (
                      <span className="text-muted-foreground text-[0.8em] font-normal">
                        {formatRealDate(day.simulatedAt)}
                      </span>
                    )}
                    {expanded === day.dayNumber ? "▼" : "▶"}
                  </span>
                </div>
                {expanded === day.dayNumber && (
                  <Card>
                    <CardContent className="p-5 divide-y divide-border">
                      {dayEvents.map(ev => (
                        <div key={ev.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="text-xs text-muted-foreground uppercase">{EVENT_TYPE_LABEL[ev.type] ?? ev.type.replace(/_/g, " ")}</div>
                          <div className="font-medium mt-0.5">{ev.title}</div>
                          <div className="text-sm text-muted-foreground mt-0.5">{ev.description}</div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}
            <ShowMoreButton
              total={reversed.length}
              visible={Math.min(visibleCount, reversed.length)}
              increment={10}
              onShowMore={() => setVisibleCount(c => c + 10)}
            />
          </>
        );
      })()}
    </div>
  );
}
