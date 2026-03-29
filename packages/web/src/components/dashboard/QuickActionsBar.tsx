import { Link } from "react-router-dom";
import { type Bill, type Poll, type BundestagSeat } from "../../api";
import { cn } from "@/lib/utils";

interface QuickActionsBarProps {
  user: { id: string; partyId: string | null } | null;
  mySeat: BundestagSeat | null;
  bills: Bill[];
  polls: Poll[];
}

export function QuickActionsBar({ user, mySeat, bills, polls }: QuickActionsBarProps) {
  if (!user) return null;

  const actions: { label: string; to: string; primary?: boolean }[] = [];

  if (!user.partyId) {
    actions.push({ label: "Partei beitreten", to: "/parties", primary: true });
  } else {
    if (!mySeat) {
      actions.push({ label: "Gesetzentwurf vorschlagen", to: `/parties/${user.partyId}#proposals` });
      actions.push({ label: "Frage stellen", to: `/parties/${user.partyId}#ask-question` });
      actions.push({ label: "MdB-Sitz beantragen", to: `/parties/${user.partyId}#mdb-seats` });
    } else {
      const thirdReading = bills.filter(b => b.status === "third_reading");
      if (thirdReading.length > 0) {
        actions.push({ label: `Über ${thirdReading.length} Gesetz${thirdReading.length !== 1 ? "e" : ""} abstimmen`, to: "/bills?status=third_reading", primary: true });
      }
      actions.push({ label: "Rede einreichen", to: "/bills" });
    }
  }

  if (polls.length > 0) actions.push({ label: "Umfragen abstimmen", to: "/polls#active-polls" });
  actions.push({ label: "Volksabstimmungen", to: "/referendums" });

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      {actions.map(a => (
        <Link
          key={a.label}
          to={a.to}
          className={cn(
            "px-3.5 py-1.5 rounded-full text-xs font-medium no-underline transition-colors",
            a.primary
              ? "bg-primary text-white hover:bg-primary/90"
              : "border border-border bg-card text-foreground hover:bg-muted"
          )}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
