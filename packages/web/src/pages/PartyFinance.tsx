import { useState } from "react";
import { api, type PartyDonation, type DonationSummary, type Party } from "../api";
import { useApiData } from "../hooks/useApiData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FilterPills } from "@/components/FilterPills";
import { cn } from "@/lib/utils";

const DONOR_TYPE_LABELS: Record<string, string> = {
  individual: "Privatperson",
  corporate: "Unternehmen",
  association: "Verband",
};

export function PartyFinance() {
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const { data: summary } = useApiData<DonationSummary[]>(() => api.getDonationSummary(), { interval: 15000 });
  const { data: donations } = useApiData<PartyDonation[]>(() => api.getPartyDonations(), { interval: 15000 });
  const { data: parties } = useApiData<Party[]>(() => api.getParties(), { interval: 30000 });

  const partyMap = new Map((parties ?? []).map(p => [p.id, p]));

  const filtered = (donations ?? []).filter(d =>
    partyFilter === "all" || d.partyId === partyFilter
  );

  const maxAmount = Math.max(...(summary ?? []).map(s => s.totalAmount), 1);

  const partyOptions = [
    { value: "all", label: "Alle Parteien" },
    ...(parties ?? []).map(p => ({ value: p.id, label: p.name })),
  ];

  const isEmpty = (summary ?? []).every(s => s.donationCount === 0);

  return (
    <div>
      <h2>Parteifinanzen</h2>
      <p className="text-muted-foreground mb-4">
        Transparente Uebersicht ueber Parteispenden im simulierten Bundestag.
        Spenden ueber 10.000 EUR werden automatisch veroeffentlicht.
      </p>

      {isEmpty ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Noch keine Parteispenden vorhanden. Diese werden im Laufe der Simulation generiert.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary chart */}
          <Card className="mb-4">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold">Spendenvolumen nach Partei</h3>
              {(summary ?? []).map(s => (
                <div key={s.partyId} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">{s.partyName}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {s.totalAmount.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR
                    </span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${(s.totalAmount / maxAmount) * 100}%`,
                        backgroundColor: s.color === "#000000" ? "#1a1a1a" : s.color,
                        minWidth: s.totalAmount > 0 ? "0.5rem" : "0",
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.donationCount} Spenden, {s.publicDonationCount} oeffentlich
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Filter */}
          <div className="mb-4">
            <FilterPills
              options={partyOptions}
              value={partyFilter}
              onChange={setPartyFilter}
            />
          </div>

          {/* Donation list */}
          <div className="space-y-2">
            {filtered.sort((a, b) => b.dayNumber - a.dayNumber).map(d => {
              const party = partyMap.get(d.partyId);
              return (
                <Card key={d.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: party?.color ?? "#888" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{d.donorName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {DONOR_TYPE_LABELS[d.donorType] ?? d.donorType}
                        </Badge>
                        {d.isPublic && (
                          <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">
                            Oeffentlich
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                        <span className="font-medium">{d.amount.toLocaleString("de-DE")} EUR</span>
                        <span>An: {party?.name ?? d.partyId}</span>
                        <span>Tag {d.dayNumber}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-4">
                Keine Spenden fuer diesen Filter gefunden.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
