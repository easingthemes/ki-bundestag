import { type Party, type ElectionResult } from "../../api";
import { fixColor, cn } from "@/lib/utils";

interface CoalitionChipsProps {
  ids: string[];
  parties: Party[];
  results?: ElectionResult[] | null;
  isFull?: boolean;
}

export function CoalitionChips({ ids, parties, results, isFull }: CoalitionChipsProps) {
  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {ids.map(id => {
        const p = parties.find(x => x.id === id);
        const color = fixColor(p?.color || "#999");
        const result = results?.find(r => r.partyId === id);
        return (
          <div
            key={id}
            className={cn("flex items-center gap-1.5 px-3 py-1 rounded", isFull ? "font-semibold text-sm" : "text-sm text-muted-foreground")}
            style={isFull
              ? { border: `2px solid ${color}`, background: `${color}18` }
              : { border: "1px solid var(--color-border)" }
            }
          >
            {isFull && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
            {p?.name || id}
            {result && <span className="font-normal text-muted-foreground">({result.seatsWon})</span>}
            {!result && p && <span className="text-muted-foreground">({p.seatCount})</span>}
          </div>
        );
      })}
    </div>
  );
}
