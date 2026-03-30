import { useCallback, useEffect, useRef, useState } from "react";
import { api, type SimulationEvent, type SimulationStatus, onSimEvents, isSocketConnected } from "../../api";

const STORAGE_KEY = "liveTickerLastEventId";
const SEEN_KEY = "liveTickerSeenIds";

function getSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function addSeenIds(ids: string[]) {
  const seen = getSeenIds();
  for (const id of ids) seen.add(id);
  // Keep only last 50 to avoid unbounded growth
  const arr = [...seen].slice(-50);
  sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr));
}

interface LiveEventTickerProps {
  simStatus: SimulationStatus;
}

export function LiveEventTicker({ simStatus }: LiveEventTickerProps) {
  const [toasts, setToasts] = useState<SimulationEvent[]>([]);
  const lastEventId = useRef<string | null>(sessionStorage.getItem(STORAGE_KEY));
  const isRunning = simStatus.dayStartedAt && simStatus.lastRunAt &&
    new Date(simStatus.dayStartedAt).getTime() > new Date(simStatus.lastRunAt).getTime();

  const handleNewEvents = useCallback((newEvents: SimulationEvent[]) => {
    if (newEvents.length > 0) {
      lastEventId.current = newEvents[0].id;
      sessionStorage.setItem(STORAGE_KEY, newEvents[0].id);

      const seen = getSeenIds();
      const unseen = newEvents.filter(e => e.type !== "day_start" && !seen.has(e.id));
      if (unseen.length > 0) {
        addSeenIds(unseen.map(e => e.id));
        setToasts(prev => [...unseen, ...prev].slice(0, 3));
      }
    }
  }, []);

  const poll = useCallback(() => {
    api.getLatestEvents(lastEventId.current ?? undefined)
      .then(handleNewEvents)
      .catch(() => {});
  }, [handleNewEvents]);

  useEffect(() => {
    // Subscribe to WebSocket event pushes
    const unsub = onSimEvents(handleNewEvents);
    return unsub;
  }, [handleNewEvents]);

  useEffect(() => {
    if (!isRunning) return;

    // Fallback polling: only when WS is disconnected
    poll();
    const id = setInterval(() => {
      if (!isSocketConnected()) poll();
    }, 5_000);
    return () => clearInterval(id);
  }, [isRunning, poll]);

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
