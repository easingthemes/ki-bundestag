import { useEffect, useState, useCallback } from "react";
import { api, Interpellation, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE as STATUS_BADGE_COLORS, INTERPELLATION_TYPE_BADGE, SEMANTIC_HEX } from "@/lib/colors";

const STATUS_OPTIONS = ["all", "pending", "answered", "expired"] as const;
const TYPE_OPTIONS = ["all", "kleine", "große"] as const;

export function Interpellations() {
  const [interpellations, setInterpellations] = useState<Interpellation[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getInterpellations().then(setInterpellations).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(10); }, [statusFilter, typeFilter]);

  if (parties.length === 0) return <p className="text-center py-8 text-muted-foreground">Loading...</p>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = interpellations.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    return true;
  });
  const visibleFiltered = filtered.slice(0, visibleCount);

  return (
    <div>
      <h1>Anfragen (Interpellations)</h1>
      <p className="text-muted-foreground mb-4">
        Opposition parties formally question government ministers. Kleine Anfrage = written question.
        Große Anfrage = major inquiry with plenary debate.
      </p>

      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Status:</span>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={cn(
                "px-2 py-1 text-xs rounded border cursor-pointer transition-colors",
                statusFilter === opt
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-foreground border-input hover:bg-accent"
              )}
            >
              {opt === "all" ? "All" : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Type:</span>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setTypeFilter(opt)}
              className={cn(
                "px-2 py-1 text-xs rounded border cursor-pointer transition-colors",
                typeFilter === opt
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-foreground border-input hover:bg-accent"
              )}
            >
              {opt === "all" ? "All" : opt === "große" ? "Große Anfrage" : "Kleine Anfrage"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">No interpellations yet. Run the simulation to see opposition parties question the government.</p>
      )}

      {visibleFiltered.map(interp => (
        <InterpellationCard
          key={interp.id}
          interp={interp}
          partyMap={partyMap}
          expanded={expandedId === interp.id}
          onToggle={() => setExpandedId(expandedId === interp.id ? null : interp.id)}
        />
      ))}

      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={10}
        onShowMore={() => setVisibleCount(c => c + 10)}
      />
    </div>
  );
}

function InterpellationCard({
  interp,
  partyMap,
  expanded,
  onToggle,
}: {
  interp: Interpellation;
  partyMap: Map<string, Party>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const filer = partyMap.get(interp.filedByPartyId);
  const targetParty = partyMap.get(interp.targetPartyId);
  const typeLabel = interp.type === "große" ? "Große Anfrage" : "Kleine Anfrage";

  return (
    <Card className="mb-3 cursor-pointer" onClick={onToggle}>
      <CardContent className="p-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <strong>{interp.title}</strong>
            <Badge variant="outline" className={cn(
              interp.type === "große"
                ? INTERPELLATION_TYPE_BADGE["große"]
                : INTERPELLATION_TYPE_BADGE.kleine
            )}>
              {typeLabel}
            </Badge>
          </div>
          <Badge variant="outline" className={STATUS_BADGE_COLORS[interp.status] ?? STATUS_BADGE_COLORS.pending}>
            {interp.status}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mt-1">
          Filed by{" "}
          <span className="font-semibold" style={{ color: filer?.color ?? "#333" }}>
            {filer?.name ?? interp.filedByPartyId}
          </span>
          {" "}targeting{" "}
          <strong>{interp.targetMinisterName}</strong> ({interp.targetMinistry})
          {targetParty && (
            <span style={{ color: targetParty.color }}> — {targetParty.name}</span>
          )}
        </p>

        <p className="text-xs text-muted-foreground">
          Day {interp.dayNumber}
          {interp.respondedOnDay != null && ` · Answered on day ${interp.respondedOnDay}`}
          {interp.sentimentImpact != null && interp.sentimentImpact !== 0 && (
            <span style={{ color: interp.sentimentImpact > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
              {" "}· Sentiment: {interp.sentimentImpact > 0 ? "+" : ""}{interp.sentimentImpact}
            </span>
          )}
        </p>

        {expanded && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2">
              <strong>Question:</strong>
              <p className="text-sm mt-1">{interp.question}</p>
            </div>

            {interp.response && (
              <div className="mt-2">
                <strong>Minister's Response ({interp.targetMinisterName}):</strong>
                <div
                  className="text-sm mt-1 p-2 rounded bg-muted"
                  style={{ borderLeft: `3px solid ${targetParty?.color ?? "#666"}` }}
                >
                  {interp.response}
                </div>
              </div>
            )}

            {interp.status === "expired" && (
              <p className="mt-2 text-sm text-destructive italic">
                This interpellation went unanswered for 14 days — an embarrassment for the government.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
