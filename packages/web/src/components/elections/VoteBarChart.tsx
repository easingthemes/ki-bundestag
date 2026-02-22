import { type ElectionResult, type Party } from "../../api";
import { fixColor } from "@/lib/utils";
import { SEMANTIC_HEX } from "@/lib/colors";

interface VoteBarChartProps {
  results: ElectionResult[];
  parties: Party[];
  previousResults: ElectionResult[] | null;
}

export function VoteBarChart({ results, parties, previousResults }: VoteBarChartProps) {
  const sorted = [...results].filter(r => r.seatsWon > 0).sort((a, b) => b.votesPercent - a.votesPercent);
  const maxPct = Math.max(...sorted.map(r => r.votesPercent), 1);

  return (
    <div className="flex flex-col gap-2">
      {sorted.map(r => {
        const party = parties.find(p => p.id === r.partyId);
        const color = fixColor(party?.color || "#999");
        const prevResult = previousResults?.find(pr => pr.partyId === r.partyId);
        const barWidth = (r.votesPercent / maxPct) * 100;
        const prevWidth = prevResult ? (prevResult.votesPercent / maxPct) * 100 : 0;
        const delta = prevResult ? Math.round((r.votesPercent - prevResult.votesPercent) * 10) / 10 : null;

        return (
          <div key={r.partyId} className="flex items-center gap-3">
            <div className="min-w-24 shrink-0 flex items-center gap-2">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-sm font-medium truncate">{party?.name || r.partyId}</span>
            </div>
            <div className="flex-1 relative h-7 bg-muted/50 rounded overflow-hidden">
              {previousResults && prevResult && (
                <div
                  className="absolute top-0 h-full rounded bg-muted-foreground/15"
                  style={{ width: `${prevWidth}%` }}
                />
              )}
              <div
                className="absolute top-0 h-full rounded"
                style={{ width: `${barWidth}%`, backgroundColor: color }}
              />
            </div>
            <div className="min-w-20 shrink-0 text-right">
              <span className="text-sm font-extrabold tabular-nums">{r.votesPercent}%</span>
              {delta != null && (
                <span
                  className="text-xs ml-1.5 tabular-nums"
                  style={{ color: delta > 0 ? SEMANTIC_HEX.positive : delta < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral }}
                >
                  {delta > 0 ? "+" : ""}{delta}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {previousResults && (
        <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded bg-zinc-500 inline-block" /> Aktuell
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-2 rounded bg-muted-foreground/15 inline-block" /> Vorherig
          </span>
        </div>
      )}
    </div>
  );
}
