import { useEffect, useRef, useState } from "react";
import { api, type SimulationEvent, type SimulationStatus } from "../../api";

interface LiveEventTickerProps {
  simStatus: SimulationStatus;
}

export function LiveEventTicker({ simStatus }: LiveEventTickerProps) {
  const [toasts, setToasts] = useState<SimulationEvent[]>([]);
  const lastEventId = useRef<string | null>(null);
  const isRunning = simStatus.dayStartedAt && simStatus.lastRunAt &&
    new Date(simStatus.dayStartedAt).getTime() > new Date(simStatus.lastRunAt).getTime();

  useEffect(() => {
    if (!isRunning) return;

    const poll = () => {
      api.getLatestEvents(lastEventId.current ?? undefined)
        .then(newEvents => {
          if (newEvents.length > 0) {
            lastEventId.current = newEvents[0].id;
            setToasts(prev => {
              const combined = [...newEvents.filter(e => e.type !== "day_start"), ...prev];
              return combined.slice(0, 3);
            });
          }
        })
        .catch(() => {});
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isRunning]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts(prev => prev.slice(0, -1)), 8000);
    return () => clearTimeout(id);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(ev => (
        <div key={ev.id} className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 animate-in slide-in-from-right-3 fade-in duration-300">
          <div className="flex justify-between items-start gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Day {ev.dayNumber} · {ev.type.replace(/_/g, " ")}</div>
              <div className="font-semibold text-sm mt-0.5">{ev.title}</div>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(t => t.id !== ev.id))} className="text-xs text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer shrink-0">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
