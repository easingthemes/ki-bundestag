import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import type { UpcomingCalendarData, UpcomingEvent } from "../api";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CATEGORY_DOT: Record<string, string> = {
  election_voting: "bg-red-500",
  election_announcement: "bg-red-400",
  election_campaign: "bg-red-300",
  budget_cycle: "bg-blue-500",
  budget_retry: "bg-amber-500",
  poll_day: "bg-cyan-400",
  economy_report: "bg-emerald-400",
  session_day: "bg-slate-300",
  poll_expiry: "bg-cyan-200",
  referendum_expiry: "bg-violet-200",
  interpellation_deadline: "bg-orange-300",
  public_holiday: "bg-rose-400",
};

type FilterKey = "elections" | "budget" | "session" | "polls" | "deadlines" | "holidays";

const FILTERS: { key: FilterKey; label: string; categories: string[] }[] = [
  { key: "elections", label: "Wahlen", categories: ["election_voting", "election_announcement", "election_campaign"] },
  { key: "budget", label: "Haushalt", categories: ["budget_cycle", "budget_retry"] },
  { key: "session", label: "Plenar", categories: ["session_day"] },
  { key: "polls", label: "Umfragen", categories: ["poll_day", "poll_expiry"] },
  { key: "holidays", label: "Feiertage", categories: ["public_holiday"] },
  { key: "deadlines", label: "Fristen", categories: ["economy_report", "referendum_expiry", "interpellation_deadline"] },
];

const GERMAN_MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const week = getISOWeek(d);
  const year = d.getFullYear();
  return `${year}-W${week}`;
}

function weekLabel(events: UpcomingEvent[]): string {
  const dates = events.map(e => new Date(e.date)).sort((a, b) => a.getTime() - b.getTime());
  const first = dates[0];
  const week = getISOWeek(first);
  // Find Monday of this ISO week
  const day = first.getDay() || 7; // Mon=1..Sun=7
  const monday = new Date(first);
  monday.setDate(first.getDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmtDay = (d: Date) => `${d.getDate()}. ${GERMAN_MONTHS[d.getMonth()]}`;
  if (monday.getMonth() === sunday.getMonth()) {
    return `KW ${week} — ${monday.getDate()}.–${fmtDay(sunday)} ${sunday.getFullYear()}`;
  }
  return `KW ${week} — ${fmtDay(monday)} – ${fmtDay(sunday)} ${sunday.getFullYear()}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${weekdays[d.getDay()]}, ${d.getDate()}. ${GERMAN_MONTHS[d.getMonth()]}`;
}

export function UpcomingCalendar({ data }: { data: UpcomingCalendarData }) {
  // session_day off by default (noisy — every 5 days)
  const [active, setActive] = useState<Set<FilterKey>>(new Set(["elections", "budget", "polls", "holidays", "deadlines"]));

  const toggle = (key: FilterKey) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const activeCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const f of FILTERS) {
      if (active.has(f.key)) for (const c of f.categories) cats.add(c);
    }
    return cats;
  }, [active]);

  const filtered = useMemo(
    () => data.events.filter(e => activeCategories.has(e.category)),
    [data.events, activeCategories],
  );

  // Group by ISO week
  const weeks = useMemo(() => {
    const map = new Map<string, UpcomingEvent[]>();
    for (const evt of filtered) {
      const wk = weekKey(evt.date);
      if (!map.has(wk)) map.set(wk, []);
      map.get(wk)!.push(evt);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Card>
      <CardContent className="p-4">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-full border cursor-pointer transition-colors",
                active.has(f.key) ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/30",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Event list */}
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Keine anstehenden Termine</p>
        ) : (
          <div className="space-y-4">
            {weeks.map(([wk, evts]) => (
              <div key={wk}>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">{weekLabel(evts)}</div>
                <div className="space-y-1">
                  {evts.map((evt, i) => {
                    const row = (
                      <div key={`${evt.dayNumber}-${evt.category}-${i}`} className={cn("flex items-center gap-2 py-1 px-2 rounded text-sm", evt.link && "hover:bg-muted/50")}>
                        <span className={cn("size-2.5 rounded-full shrink-0", CATEGORY_DOT[evt.category] ?? "bg-slate-400")} />
                        <span className="font-medium">{evt.label}</span>
                        {evt.detail && <span className="text-muted-foreground truncate text-xs hidden sm:inline">— {evt.detail}</span>}
                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{formatDate(evt.date)}</span>
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">Tag {evt.dayNumber}</span>
                      </div>
                    );
                    return evt.link ? <Link key={`${evt.dayNumber}-${evt.category}-${i}`} to={evt.link} className="block">{row}</Link> : row;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
