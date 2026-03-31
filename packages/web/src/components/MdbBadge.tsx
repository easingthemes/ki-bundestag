import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MDB_BADGE, DISCIPLINE_BADGE, DISCIPLINE_LABEL } from "@/lib/colors";

export function MdbBadge() {
  return (
    <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>
      MdB
    </Badge>
  );
}

export function DisciplineBadge({ level }: { level: number }) {
  const cls = DISCIPLINE_BADGE[level] ?? DISCIPLINE_BADGE[0];
  const label = DISCIPLINE_LABEL[level] ?? "Unbekannt";
  return (
    <Badge variant="outline" className={cn("text-xs", cls)}>
      {label}
    </Badge>
  );
}
