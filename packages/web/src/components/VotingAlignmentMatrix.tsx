import { useState } from "react";
import { api } from "../api";
import type { AlignmentData } from "../api/types";
import { useApiData } from "../hooks/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fixColor } from "@/lib/utils";

function alignmentColor(pct: number): string {
  if (pct <= 50) {
    const ratio = pct / 50;
    const r = 220;
    const g = Math.round(50 + ratio * 170);
    const b = 50;
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const ratio = (pct - 50) / 50;
    const r = Math.round(220 - ratio * 170);
    const g = 200;
    const b = 50;
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function textColor(pct: number): string {
  return pct > 30 && pct < 70 ? "#1a1a1a" : "#fff";
}

interface VotingAlignmentMatrixProps {
  className?: string;
  compact?: boolean;
}

export function VotingAlignmentMatrix({ className, compact }: VotingAlignmentMatrixProps) {
  const [windowDays, setWindowDays] = useState<number | undefined>(undefined);
  const { data, loading } = useApiData<AlignmentData>(
    () => api.getAlignment(windowDays),
    { interval: 30000, deps: [windowDays] },
  );

  if (loading || !data) {
    return (
      <Card className={className}>
        <CardContent className="p-5">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const { parties, matrix, billCount } = data;

  if (compact) {
    return <CompactAlignment parties={parties} matrix={matrix} className={className} />;
  }

  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold">Abstimmungsmatrix</h3>
            <p className="text-xs text-muted-foreground">
              Partei-zu-Partei Übereinstimmung ({billCount} Abstimmungen{data.windowDays ? `, letzte ${data.windowDays} Tage` : ""})
            </p>
          </div>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            value={windowDays ?? ""}
            onChange={e => setWindowDays(e.target.value ? parseInt(e.target.value) : undefined)}
          >
            <option value="">Alle</option>
            <option value="30">Letzte 30 Tage</option>
            <option value="60">Letzte 60 Tage</option>
            <option value="90">Letzte 90 Tage</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <div
            className="grid gap-px"
            style={{
              gridTemplateColumns: `auto repeat(${parties.length}, 1fr)`,
              minWidth: parties.length * 56 + 60,
            }}
          >
            {/* Header row */}
            <div />
            {parties.map(p => (
              <div key={p.id} className="text-center text-xs font-semibold py-1.5 truncate">
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ backgroundColor: fixColor(p.color) }} />
                <span className="hidden sm:inline">{p.name}</span>
                <span className="sm:hidden">{p.id.slice(0, 3).toUpperCase()}</span>
              </div>
            ))}

            {/* Data rows */}
            {parties.map(rowParty => (
              <>
                <div key={`label-${rowParty.id}`} className="flex items-center text-xs font-semibold pr-2 truncate">
                  <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 shrink-0" style={{ backgroundColor: fixColor(rowParty.color) }} />
                  <span className="hidden sm:inline">{rowParty.name}</span>
                  <span className="sm:hidden">{rowParty.id.slice(0, 3).toUpperCase()}</span>
                </div>
                {parties.map(colParty => {
                  const val = matrix[rowParty.id]?.[colParty.id];
                  const isSelf = rowParty.id === colParty.id;
                  const bg = isSelf
                    ? fixColor(rowParty.color)
                    : val != null ? alignmentColor(val) : "#e5e7eb";
                  const fg = isSelf ? "#fff" : val != null ? textColor(val) : "#9ca3af";

                  return (
                    <div
                      key={`${rowParty.id}-${colParty.id}`}
                      className="flex items-center justify-center text-xs font-bold rounded-sm aspect-square min-h-[36px]"
                      style={{ backgroundColor: bg, color: fg }}
                      title={`${rowParty.name} / ${colParty.name}: ${val != null ? `${val}%` : "n/a"}`}
                    >
                      {val != null ? `${val}` : "--"}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: alignmentColor(0) }} /> 0%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: alignmentColor(50) }} /> 50%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ backgroundColor: alignmentColor(100) }} /> 100%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact version for Dashboard: top 3 most aligned + top 3 least aligned pairs */
function CompactAlignment({
  parties,
  matrix,
  className,
}: {
  parties: AlignmentData["parties"];
  matrix: AlignmentData["matrix"];
  className?: string;
}) {
  const pairs: Array<{ a: string; b: string; pct: number }> = [];
  const partyIds = parties.map(p => p.id);
  for (let i = 0; i < partyIds.length; i++) {
    for (let j = i + 1; j < partyIds.length; j++) {
      const val = matrix[partyIds[i]]?.[partyIds[j]];
      if (val != null) pairs.push({ a: partyIds[i], b: partyIds[j], pct: val });
    }
  }

  if (pairs.length === 0) return null;

  pairs.sort((a, b) => b.pct - a.pct);
  const top = pairs.slice(0, 3);
  const bottom = [...pairs].sort((a, b) => a.pct - b.pct).slice(0, 3);
  const shown = [...top, ...bottom.filter(b => !top.some(t => t.a === b.a && t.b === b.b))].slice(0, 6);

  const partyMap = Object.fromEntries(parties.map(p => [p.id, p]));

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-2">Abstimmungsmatrix</h3>
        <div className="space-y-1.5">
          {shown.map(({ a, b, pct }) => (
            <div key={`${a}-${b}`} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: fixColor(partyMap[a]?.color ?? "#999") }} />
              <span className="font-medium w-16 truncate">{partyMap[a]?.name ?? a}</span>
              <span className="text-muted-foreground">–</span>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: fixColor(partyMap[b]?.color ?? "#999") }} />
              <span className="font-medium w-16 truncate">{partyMap[b]?.name ?? b}</span>
              <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: alignmentColor(pct) }} />
              </div>
              <span className="font-bold tabular-nums w-8 text-right">{pct}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
