import { api } from "../api";
import type { VotingComparisonResponse } from "../api/types";
import { useApiData } from "../hooks/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, fixColor } from "@/lib/utils";
import { ALERT_STYLES, SEMANTIC_HEX } from "@/lib/colors";

interface VotingComparisonChartProps {
  className?: string;
}

export function VotingComparisonChart({ className }: VotingComparisonChartProps) {
  const { data, loading } = useApiData<VotingComparisonResponse>(
    () => api.getVotingComparison(),
    { interval: 30000 },
  );

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-5">
          <Skeleton className="h-6 w-64 mb-4" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.available) {
    return (
      <Card className={className}>
        <CardContent className="p-5">
          <div className={cn(ALERT_STYLES.info, "text-sm")}>
            Keine Ausgangsdaten verfügbar. Abstimmungsdaten werden beim ersten Wissensabruf als Baseline gespeichert.
          </div>
        </CardContent>
      </Card>
    );
  }

  const { parties, simulated, baseline, drift } = data;
  if (!parties || !simulated || !baseline || !drift) return null;

  // Build party pairs sorted by absolute drift
  const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));
  const partyIds = parties.map(p => p.id);
  const pairs: Array<{ a: string; b: string; sim: number; base: number; drift: number }> = [];

  for (let i = 0; i < partyIds.length; i++) {
    for (let j = i + 1; j < partyIds.length; j++) {
      const a = partyIds[i], b = partyIds[j];
      const simVal = simulated[a]?.[b];
      const baseVal = baseline[a]?.[b];
      const driftVal = drift[a]?.[b];
      if (simVal != null && baseVal != null && driftVal != null) {
        pairs.push({ a, b, sim: simVal, base: baseVal, drift: driftVal });
      }
    }
  }

  pairs.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
  const topPairs = pairs.slice(0, 6);

  if (topPairs.length === 0) return null;

  return (
    <Card className={className}>
      <CardContent className="p-5">
        <h3 className="text-base font-semibold mb-1">
          Wie hat sich das Abstimmungsverhalten seit Simulationsbeginn verändert?
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Ausgangslage basiert auf Bundestag-Daten vom Tag {data.baselineCapturedOnDay} ({data.baselinePollCount} Abstimmungen)
        </p>

        <div className="space-y-4">
          {topPairs.map(({ a, b, sim, base, drift: d }) => (
            <div key={`${a}-${b}`}>
              <div className="flex items-center gap-2 mb-1.5 text-sm font-medium">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fixColor(partyMap[a]?.color ?? "#999") }} />
                <span>{partyMap[a]?.name ?? a}</span>
                <span className="text-muted-foreground">–</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fixColor(partyMap[b]?.color ?? "#999") }} />
                <span>{partyMap[b]?.name ?? b}</span>
              </div>
              {/* Baseline bar */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-24 shrink-0">Ausgangslage</span>
                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${base}%`, backgroundColor: "#94a3b8" }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums w-9 text-right">{base}%</span>
              </div>
              {/* Simulation bar */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-muted-foreground w-24 shrink-0">Simulation</span>
                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{ width: `${sim}%`, backgroundColor: "#f59e0b" }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums w-9 text-right">{sim}%</span>
              </div>
              {/* Drift indicator */}
              <div className="text-right">
                <span
                  className="text-xs font-bold"
                  style={{
                    color: d > 0
                      ? SEMANTIC_HEX.positive
                      : d < 0
                        ? SEMANTIC_HEX.negative
                        : SEMANTIC_HEX.neutral,
                  }}
                >
                  {d > 0 ? `+${d}%` : d < 0 ? `${d}%` : "0%"}
                  {d > 0 ? " (näher)" : d < 0 ? " (weiter)" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
