import { useMemo } from "react";
import { Play, Pause, Square, Zap, Gauge, Timer, Snail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SimulationStatus } from "../../api/types";

type SimState = "running" | "paused" | "stopped";

const PRESET_ICON: Record<string, typeof Zap> = {
  "ultra-fast": Zap,
  fast: Gauge,
  normal: Timer,
  slow: Snail,
};

const PRESET_LABEL: Record<string, string> = {
  "ultra-fast": "Ultra",
  fast: "Schnell",
  normal: "Normal",
  slow: "Langsam",
};

/** How long without a heartbeat before we consider the sim dead (2 min) */
const HEARTBEAT_STALE_MS = 120_000;

function deriveState(status: SimulationStatus, now: number): SimState {
  const started = status.dayStartedAt ? new Date(status.dayStartedAt).getTime() : 0;
  const completed = status.lastRunAt ? new Date(status.lastRunAt).getTime() : 0;
  const heartbeat = status.heartbeatAt ? new Date(status.heartbeatAt).getTime() : 0;

  // Currently running a day (started > completed)
  if (started > completed) {
    // Check heartbeat — if the sim process is alive, heartbeat is recent
    if (heartbeat > 0 && (now - heartbeat) < HEARTBEAT_STALE_MS) return "running";
    // No heartbeat data (old server) — fall back to started time check (generous 30 min)
    if (heartbeat === 0 && (now - started) < 1_800_000) return "running";
    // Heartbeat stale → process likely crashed
    return completed > 0 ? "paused" : "stopped";
  }

  // Completed recently (within 2 min) — likely running in auto mode between days
  const sinceCompleted = now - completed;
  if (completed > 0 && sinceCompleted < 120_000) return "running";

  // Has run before but not recently — paused or stopped
  if (completed > 0) return "paused";

  return "stopped";
}

export function SimStatusPill({ status, now }: { status: SimulationStatus; now?: number }) {
  const currentTime = now ?? Date.now();

  const simState = useMemo(() => deriveState(status, currentTime), [status, currentTime]);

  const PresetIcon = PRESET_ICON[status.timingPreset] ?? Timer;
  const presetLabel = PRESET_LABEL[status.timingPreset] ?? status.timingPreset;

  return (
    <div className="flex items-center gap-1.5">
      {/* State pill */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
          simState === "running" && "bg-emerald-50 text-emerald-700",
          simState === "paused" && "bg-amber-50 text-amber-700",
          simState === "stopped" && "bg-zinc-100 text-zinc-500",
        )}
        title={simState === "running" ? "Simulation läuft" : simState === "paused" ? "Simulation pausiert" : "Simulation gestoppt"}
      >
        {simState === "running" && <Play className="w-2.5 h-2.5 fill-current" />}
        {simState === "paused" && <Pause className="w-2.5 h-2.5 fill-current" />}
        {simState === "stopped" && <Square className="w-2.5 h-2.5 fill-current" />}
        {simState === "running" && <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />}
      </span>

      {/* Preset pill */}
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none bg-zinc-100 text-zinc-600"
        title={`Modus: ${presetLabel}`}
      >
        <PresetIcon className="w-2.5 h-2.5" />
        <span className="hidden sm:inline">{presetLabel}</span>
      </span>
    </div>
  );
}
