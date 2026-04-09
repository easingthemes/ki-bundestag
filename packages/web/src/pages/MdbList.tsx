import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, Party, type BundestagSeat } from "../api";
import { usePolling } from "../usePolling";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MDB_BADGE } from "@/lib/colors";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function MdbList() {
  usePageMeta(ROUTE_SEO["/mdb"] ?? { title: "Abgeordnete" });
  const { t } = useTranslation("common");
  const [seats, setSeats] = useState<BundestagSeat[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [filterParty, setFilterParty] = useState("");
  const [filterController, setFilterController] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const refresh = useCallback(() => {
    api.getSeatRoster(filterParty || undefined, filterController || undefined, filterSearch || undefined)
      .then(setSeats)
      .catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [filterParty, filterController, filterSearch]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  // Sort: human-controlled first, then by seat number
  const sorted = [...seats].sort((a, b) => {
    const aIsPlayer = a.controller === "human" || a.controller === "bot";
    const bIsPlayer = b.controller === "human" || b.controller === "bot";
    if (aIsPlayer !== bIsPlayer) return aIsPlayer ? -1 : 1;
    return a.seatNumber - b.seatNumber;
  });

  return (
    <div>
      <h2 className="section-title">Abgeordnete</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        {seats.length} Mitglieder des Bundestages
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <select value={filterParty} onChange={e => setFilterParty(e.target.value)} className={SELECT_CLS}>
          <option value="">Alle Parteien</option>
          {parties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterController} onChange={e => setFilterController(e.target.value)} className={SELECT_CLS}>
          <option value="">Alle Typen</option>
          <option value="human">Spieler</option>
          <option value="ai">KI</option>
        </select>
        <input
          type="text"
          placeholder="Name oder Sitznr. suchen..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className={cn(SELECT_CLS, "w-52")}
        />
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("px-3 py-1 rounded text-sm border", viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-transparent")}
          >
            Kacheln
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("px-3 py-1 rounded text-sm border", viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-transparent")}
          >
            Liste
          </button>
        </div>
      </div>

      {sorted.length === 0 && (
        <p className="text-muted-foreground py-8 text-center">Keine Abgeordneten gefunden.</p>
      )}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.map(seat => {
            const party = partyMap.get(seat.partyId);
            return (
              <Link key={seat.id} to={`/mdb/${seat.id}`} className="no-underline">
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ backgroundColor: party?.color ?? "#6b7280" }}
                      >
                        {seat.seatNumber}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">
                          {seat.displayName ?? `Sitz ${seat.seatNumber}`}
                        </p>
                        <p className="text-xs text-muted-foreground">{party?.name ?? seat.partyId}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {(seat.controller === "human" || seat.controller === "bot") && (
                        <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>Spieler</Badge>
                      )}
                      {seat.controller === "ai" && (
                        <Badge variant="outline" className="text-xs bg-zinc-50 text-zinc-500">KI</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Sitz</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Partei</th>
                <th className="text-left px-3 py-2 font-medium">Typ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(seat => {
                const party = partyMap.get(seat.partyId);
                return (
                  <tr key={seat.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: party?.color ?? "#6b7280" }}
                      >
                        {seat.seatNumber}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/mdb/${seat.id}`} className="text-primary hover:underline font-medium">
                        {seat.displayName ?? `Sitz ${seat.seatNumber}`}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: party?.color ?? "#6b7280" }} />
                        {party?.name ?? seat.partyId}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(seat.controller === "human" || seat.controller === "bot") ? (
                        <Badge variant="outline" className={cn("text-xs", MDB_BADGE)}>Spieler</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-zinc-50 text-zinc-500">KI</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
