import { type BundestagSeat } from "../../api";
import { useUser } from "../../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DISCIPLINE_BADGE, DISCIPLINE_LABEL, MDB_BADGE } from "@/lib/colors";

interface MdbRosterTableProps {
  seats: BundestagSeat[];
  partyId: string;
}

export function MdbRosterTable({ seats, partyId }: MdbRosterTableProps) {
  const { user } = useUser();
  const humanSeats = seats.filter(s => s.controller === "human");
  const aiSeats = seats.filter(s => s.controller === "ai");

  // Suppress unused variable warning - partyId is used by consumers to determine context
  void partyId;

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[500px]">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 border-b-2 border-border">Sitz</th>
              <th className="text-left px-3 py-2 border-b-2 border-border">Mitglied</th>
              <th className="text-center px-3 py-2 border-b-2 border-border">Typ</th>
              <th className="text-center px-3 py-2 border-b-2 border-border">Disziplin</th>
              <th className="text-center px-3 py-2 border-b-2 border-border">Stellvertretung</th>
            </tr>
          </thead>
          <tbody>
            {humanSeats.map(seat => (
              <tr key={seat.id}>
                <td className="px-3 py-2 border-b border-border font-mono text-xs">#{seat.seatNumber}</td>
                <td className="px-3 py-2 border-b border-border">
                  {seat.displayName ? (
                    <span className="font-semibold">{seat.displayName}</span>
                  ) : (
                    <span className="text-emerald-600 italic">Frei</span>
                  )}
                  {seat.userId === user?.id && <span className="text-xs ml-1.5 text-emerald-600">(Du)</span>}
                </td>
                <td className="px-3 py-2 border-b border-border text-center">
                  <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>MdB</Badge>
                </td>
                <td className="px-3 py-2 border-b border-border text-center">
                  {seat.userId && (
                    <Badge variant="outline" className={cn("text-xs", DISCIPLINE_BADGE[seat.disciplineLevel] ?? DISCIPLINE_BADGE[0])}>
                      {DISCIPLINE_LABEL[seat.disciplineLevel] ?? "?"}
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 border-b border-border text-center text-xs text-muted-foreground">
                  {seat.userId ? (seat.proxyDefault === "party_line" ? "Parteilinie" : "Enthaltung") : "—"}
                </td>
              </tr>
            ))}
            {aiSeats.length > 0 && (
              <tr>
                <td className="px-3 py-2 border-b border-border text-muted-foreground" colSpan={5}>
                  + {aiSeats.length} KI-gesteuerte{aiSeats.length !== 1 ? " Sitze" : "r Sitz"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
