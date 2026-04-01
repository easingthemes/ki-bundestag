import { useState } from "react";
import { Link } from "react-router-dom";
import type { CalendarDay, CalendarData, SimulationEvent } from "../api";
import { api } from "../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_LABEL } from "@/lib/colors";

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const DAY_HEADERS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Color dot for event importance tier */
const EVENT_DOT: Record<string, string> = {
  // Tier 1 — critical
  election_result: "bg-red-500", government_formed: "bg-red-500",
  government_dissolved: "bg-red-500", crisis_start: "bg-red-500",
  constitutional_court_ruled: "bg-red-500", vertrauensfrage: "bg-red-500",
  misstrauensvotum: "bg-red-500",
  // Tier 2 — high
  bill_proposed: "bg-blue-500", bill_third_reading: "bg-blue-500",
  presidential_veto: "bg-amber-500", budget_proposed: "bg-blue-500",
  interpellation_filed: "bg-blue-500", election_announced: "bg-red-400",
  // Tier 3 — medium
  motion_submitted: "bg-slate-400", statement: "bg-slate-400",
  amendment_proposed: "bg-slate-400", fraktion_formed: "bg-slate-400",
  fraktion_dissolved: "bg-slate-400", member_proposal_accepted: "bg-emerald-500",
  crisis_end: "bg-slate-400", negotiation_complete: "bg-slate-400",
  government_cabinet_formed: "bg-slate-400",
};

// EVENT_TYPE_LABEL imported from @/lib/colors

/** Link target for event types */
function eventLink(evt: { type: string; id: string }): string | null {
  if (evt.type.startsWith("bill_")) return `/bills`;
  if (evt.type.startsWith("election")) return `/elections`;
  if (evt.type === "government_formed" || evt.type === "government_dissolved" || evt.type === "government_cabinet_formed") return `/elections`;
  if (evt.type === "crisis_start" || evt.type === "crisis_end") return `/news`;
  if (evt.type === "budget_proposed") return `/budget`;
  if (evt.type === "motion_submitted") return `/motions`;
  if (evt.type.startsWith("interpellation")) return `/interpellations`;
  if (evt.type === "constitutional_court_ruled") return `/constitutional-court`;
  if (evt.type === "vertrauensfrage" || evt.type === "misstrauensvotum") return `/confidence-votes`;
  return null;
}

interface Props {
  data: CalendarData;
  onMonthChange: (month: string) => void;
}

export function CalendarWidget({ data, onMonthChange }: Props) {
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [dayEvents, setDayEvents] = useState<SimulationEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Build a lookup of date → CalendarDay
  const dayMap = new Map<string, CalendarDay>();
  for (const d of data.days) {
    dayMap.set(d.date, d);
  }

  // Determine current viewed month
  const startDate = new Date(data.startDate);
  const currentSimDate = new Date(startDate.getTime() + data.currentDay * 86400000);

  // Track viewed month independently so empty months render correctly
  const [viewYear, setViewYear] = useState(currentSimDate.getFullYear());
  const [viewMonthState, setViewMonthState] = useState(currentSimDate.getMonth());
  const viewMonth = viewMonthState; // 0-based

  // Build the calendar grid
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-start: getDay() returns 0=Sun, we want 0=Mon
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Mon

  const currentDateStr = currentSimDate.toISOString().split("T")[0];

  const handlePrev = () => {
    const prev = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(prev.getFullYear());
    setViewMonthState(prev.getMonth());
    onMonthChange(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleNext = () => {
    const next = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(next.getFullYear());
    setViewMonthState(next.getMonth());
    onMonthChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  const handleDayClick = async (day: CalendarDay) => {
    setSelectedDay(day);
    setLoadingEvents(true);
    try {
      const events = await api.getDayEvents(day.dayNumber);
      setDayEvents(events);
    } catch {
      setDayEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Can navigate next? Don't go past current sim month
  const canNext = viewYear < currentSimDate.getFullYear() ||
    (viewYear === currentSimDate.getFullYear() && viewMonth < currentSimDate.getMonth());

  // Can navigate prev? Don't go before start date month
  const canPrev = viewYear > startDate.getFullYear() ||
    (viewYear === startDate.getFullYear() && viewMonth > startDate.getMonth());

  return (
    <>
      <Card className="py-3">
        <CardContent className="px-4">
          {/* Month nav header */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={handlePrev}
              disabled={!canPrev}
              className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            <span className="font-semibold text-sm">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              onClick={handleNext}
              disabled={!canNext}
              className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ›
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAY_HEADERS.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px">
            {/* Empty cells before first day */}
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const calDay = dayMap.get(dateStr);
              const isToday = dateStr === currentDateStr;
              const isFuture = dateStr > currentDateStr;

              return (
                <div
                  key={dayNum}
                  onClick={() => calDay && handleDayClick(calDay)}
                  className={cn(
                    "h-16 p-1 rounded-md text-xs transition-colors relative",
                    calDay ? "cursor-pointer hover:bg-muted/80" : "",
                    isToday && "ring-2 ring-primary ring-inset",
                    isFuture && "opacity-30",
                  )}
                >
                  <div className={cn(
                    "font-medium mb-0.5",
                    isToday ? "text-primary font-bold" : "text-muted-foreground",
                  )}>
                    {dayNum}
                  </div>
                  {calDay && (
                    <div className="flex flex-col gap-px overflow-hidden">
                      {calDay.topEvents.slice(0, 2).map((evt, idx) => (
                        <div key={idx} className="flex items-center gap-1 truncate">
                          <span className={cn("size-1.5 rounded-full shrink-0", EVENT_DOT[evt.type] ?? "bg-slate-300")} />
                          <span className="truncate text-[10px] leading-tight text-muted-foreground">
                            {EVENT_TYPE_LABEL[evt.type] ?? evt.type.replace(/_/g, " ")}
                          </span>
                        </div>
                      ))}
                      {calDay.totalCount > 2 && (
                        <span className="text-[10px] text-muted-foreground/70">
                          +{calDay.totalCount - 2} weitere
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day detail dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => { if (!open) setSelectedDay(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDay && (() => {
                const d = new Date(selectedDay.date);
                return `${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} — Tag ${selectedDay.dayNumber}`;
              })()}
            </DialogTitle>
            <DialogDescription className="sr-only">Ereignisse für diesen Simulationstag</DialogDescription>
          </DialogHeader>

          {/* Day narrative summary */}
          {selectedDay?.narrative && (
            <div className="bg-muted/50 rounded-lg p-3 mb-2">
              <p className="text-sm text-foreground leading-relaxed">{selectedDay.narrative}</p>
              {selectedDay.mood && (
                <span className="inline-block mt-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {selectedDay.mood}
                </span>
              )}
            </div>
          )}
          {selectedDay?.preview && !selectedDay?.narrative && (
            <div className="bg-muted/50 rounded-lg p-3 mb-2">
              <p className="text-xs text-muted-foreground italic">{selectedDay.preview}</p>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {loadingEvents ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Laden…</div>
            ) : dayEvents.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Keine Ereignisse</div>
            ) : (
              <div className="divide-y divide-border">
                {dayEvents
                  .filter(e => e.type !== "day_start" && e.type !== "vote_cast")
                  .map(evt => {
                    const link = eventLink(evt);
                    return (
                      <div key={evt.id} className="py-2.5">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={cn("size-2 rounded-full shrink-0", EVENT_DOT[evt.type] ?? "bg-slate-300")} />
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {EVENT_TYPE_LABEL[evt.type] ?? evt.type.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{evt.actor}</span>
                        </div>
                        <div className="text-sm font-medium pl-4">
                          {link ? (
                            <Link to={link} className="text-foreground hover:text-primary no-underline hover:underline">
                              {evt.title}
                            </Link>
                          ) : evt.title}
                        </div>
                        {evt.description && evt.description !== evt.title && (
                          <div className="text-xs text-muted-foreground pl-4 mt-0.5 line-clamp-2">
                            {evt.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
