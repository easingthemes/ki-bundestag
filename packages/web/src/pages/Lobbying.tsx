import { useState } from "react";
import { api, type LobbyingEvent, type Party } from "../api";
import { useApiData } from "../hooks/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/FilterPills";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const SECTOR_LABELS: Record<string, string> = {
  energy: "Energie",
  finance: "Finanzen",
  pharma: "Pharma",
  tech: "Technologie",
  agriculture: "Landwirtschaft",
  defense: "Verteidigung",
  automotive: "Automobil",
  real_estate: "Immobilien",
};

export function Lobbying() {
  usePageMeta(ROUTE_SEO["/lobbyismus"] ?? { title: "Lobbyismus" });
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const { data: events } = useApiData<LobbyingEvent[]>(() => api.getLobbyingEvents(), { interval: 15000 });
  const { data: parties } = useApiData<Party[]>(() => api.getParties(), { interval: 30000 });

  const partyMap = new Map((parties ?? []).map(p => [p.id, p]));

  const filtered = (events ?? []).filter(e =>
    partyFilter === "all" || e.targetPartyId === partyFilter
  );

  // Aggregate by sector
  const sectorCounts = new Map<string, number>();
  for (const e of events ?? []) {
    sectorCounts.set(e.sector, (sectorCounts.get(e.sector) ?? 0) + 1);
  }
  const topSectors = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const partyOptions = [
    { value: "all", label: "Alle Parteien" },
    ...(parties ?? []).map(p => ({ value: p.id, label: p.name })),
  ];

  const isEmpty = (events ?? []).length === 0;

  return (
    <div>
      <h2>Lobbyismus-Register</h2>
      <p className="text-muted-foreground mb-4">
        Transparente Uebersicht ueber Lobbyaktivitaeten im simulierten Bundestag.
        Lobbyereignisse werden waehrend der Simulation generiert.
      </p>

      {isEmpty ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Noch keine Lobbyereignisse vorhanden. Diese werden im Laufe der Simulation generiert.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Sector overview */}
          {topSectors.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold mb-3">Aktivste Sektoren</h3>
                <div className="flex flex-wrap gap-2">
                  {topSectors.map(([sector, count]) => (
                    <Badge key={sector} variant="outline" className="text-xs">
                      {SECTOR_LABELS[sector] ?? sector}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Party filter */}
          <div className="mb-4">
            <FilterPills
              options={partyOptions}
              value={partyFilter}
              onChange={setPartyFilter}
            />
          </div>

          {/* Events list */}
          <div className="space-y-2">
            {filtered.sort((a, b) => b.dayNumber - a.dayNumber).map(e => {
              const party = partyMap.get(e.targetPartyId);
              return (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: party?.color ?? "#888" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{e.organizationName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {SECTOR_LABELS[e.sector] ?? e.sector}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            e.influence === "support"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-red-50 text-red-700 border-red-200"
                          )}
                        >
                          {e.influence === "support" ? "Unterstuetzung" : "Opposition"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                        <span>Ziel: {party?.name ?? e.targetPartyId}</span>
                        <span>Intensitaet: {"●".repeat(e.intensity)}{"○".repeat(5 - e.intensity)}</span>
                        <span>Tag {e.dayNumber}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
