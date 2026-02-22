import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ROLE_BADGE } from "@/lib/colors";

interface PartyCardProps {
  party: {
    id: string;
    name: string;
    color: string;
    approvalRating: number;
    seatCount: number;
    coalitionRole: string;
    ideology?: string;
  };
  compact?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

function fixColor(c: string): string {
  return c === "#FFED00" ? "#c4a900" : c;
}

/** Short abbreviation for party display in the icon block */
const ABBREVIATION: Record<string, string> = {
  spd: "SPD",
  cdu: "Union",
  gruene: "Grüne",
  fdp: "FDP",
  afd: "AfD",
  linke: "Linke",
};

/**
 * Tagesschau-style party card with colored icon block.
 * Features a square colored block with party abbreviation + mini bar chart icon,
 * followed by party stats (approval, seats, role).
 */
export function PartyCard({ party, compact, highlight, onClick, className, children }: PartyCardProps) {
  const color = fixColor(party.color);
  const abbr = ABBREVIATION[party.id] ?? party.name;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex gap-3 rounded-lg bg-card border border-border p-3 transition-all duration-100",
        onClick && "cursor-pointer hover:shadow-md hover:border-border/80",
        highlight && "ring-2 ring-primary/20",
        className,
      )}
    >
      {/* Colored icon block */}
      <div
        className="shrink-0 w-14 h-14 rounded-md flex flex-col items-center justify-center"
        style={{ backgroundColor: color }}
      >
        <span className="text-white font-extrabold text-xs leading-none">{abbr}</span>
        {/* Mini bar chart icon */}
        <div className="flex items-end gap-[2px] mt-1.5">
          <div className="w-[3px] h-[6px] bg-white/60 rounded-[1px]" />
          <div className="w-[3px] h-[10px] bg-white/80 rounded-[1px]" />
          <div className="w-[3px] h-[7px] bg-white/60 rounded-[1px]" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground truncate">{party.name}</span>
          {party.coalitionRole !== "opposition" && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", ROLE_BADGE[party.coalitionRole])}>
              {party.coalitionRole === "leader" ? "Regierung" : "Koalition"}
            </Badge>
          )}
        </div>

        {!compact ? (
          <div className="flex items-baseline gap-4 mt-1">
            <div>
              <span className="text-lg font-extrabold tabular-nums" style={{ color }}>
                {party.approvalRating.toFixed(1)}%
              </span>
              <span className="text-[10px] text-muted-foreground ml-1">Zustimmung</span>
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {party.seatCount} Sitze
            </div>
          </div>
        ) : (
          <div className="mt-0.5">
            <span className="text-base font-extrabold tabular-nums" style={{ color }}>
              {party.approvalRating.toFixed(1)}%
            </span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

/**
 * Grid wrapper for displaying PartyCards in a 2-column layout.
 */
export function PartyCardGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-3", className)}>
      {children}
    </div>
  );
}
