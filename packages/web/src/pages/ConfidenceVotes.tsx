import { useEffect, useState, useCallback } from "react";
import { api, ConfidenceVote, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, CONFIDENCE_TYPE_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";
import { FilterPills } from "@/components/FilterPills";

const STATUS_OPTIONS = ["all", "passed", "failed"] as const;
const TYPE_OPTIONS = ["all", "vertrauensfrage", "misstrauensvotum"] as const;

export function ConfidenceVotes() {
  const [votes, setVotes] = useState<ConfidenceVote[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);

  const refresh = useCallback(() => {
    api.getConfidenceVotes().then(setVotes).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(5); }, [statusFilter, typeFilter]);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = votes.filter(v => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (typeFilter !== "all" && v.type !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      <h2 className="section-title">Vertrauensvoten</h2>
      <p className="text-muted-foreground mb-4">
        Parlamentarische Vertrauensmechanismen. <strong>Vertrauensfrage</strong>: Der Kanzler stellt
        die Vertrauensfrage — Scheitern löst Neuwahlen aus. <strong>Konstruktives Misstrauensvotum</strong>:
        Die Opposition benennt einen Ersatzkanzler — Erfolg überträgt die Macht sofort.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Status:</span>
          <FilterPills
            options={STATUS_OPTIONS.map(opt => ({ value: opt, label: opt === "all" ? "Alle" : opt === "passed" ? "Angenommen" : "Abgelehnt" }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Typ:</span>
          <FilterPills
            options={TYPE_OPTIONS.map(opt => ({ value: opt, label: opt === "all" ? "Alle" : opt === "vertrauensfrage" ? "Vertrauensfrage" : "Misstrauensvotum" }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">
          Noch keine Vertrauensvoten. Der Koalitionsführer kann eine Vertrauensfrage stellen; Oppositionsparteien können ein Misstrauensvotum einreichen.
        </p>
      )}

      {filtered.slice(0, visibleCount).map(vote => (
        <ConfidenceVoteCard
          key={vote.id}
          vote={vote}
          partyMap={partyMap}
          expanded={expandedId === vote.id}
          onToggle={() => setExpandedId(expandedId === vote.id ? null : vote.id)}
        />
      ))}
      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={5}
        onShowMore={() => setVisibleCount(c => c + 5)}
      />
    </div>
  );
}

function ConfidenceVoteCard({
  vote,
  partyMap,
  expanded,
  onToggle,
}: {
  vote: ConfidenceVote;
  partyMap: Map<string, Party>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const initiator = partyMap.get(vote.initiatedByPartyId);
  const proposedParty = vote.proposedChancellorPartyId
    ? partyMap.get(vote.proposedChancellorPartyId)
    : null;

  const isVertrauensfrage = vote.type === "vertrauensfrage";
  const typeLabel = isVertrauensfrage ? "Vertrauensfrage" : "Misstrauensvotum";

  // Outcome description
  let outcomeText = "";
  if (isVertrauensfrage) {
    outcomeText = vote.status === "passed"
      ? `Regierung von Bundeskanzler/in ${vote.chancellorName} hat das Vertrauen gewonnen.`
      : `Regierung gestürzt — Neuwahlen ausgelöst.`;
  } else {
    outcomeText = vote.status === "passed"
      ? `Neue/r Bundeskanzler/in: ${vote.proposedChancellor ?? "Unbekannt"} — Regierungswechsel ohne Wahl.`
      : `Antrag gescheitert — Regierung von ${vote.chancellorName} überlebt.`;
  }

  // Seat tally from votes
  const totalYes = vote.votes
    .filter(v => v.vote === "yes")
    .reduce((sum, v) => sum + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const totalNo = vote.votes
    .filter(v => v.vote === "no")
    .reduce((sum, v) => sum + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const totalSeats = totalYes + totalNo;

  return (
    <Card className="mb-3 cursor-pointer" onClick={onToggle}>
      <CardContent className="p-5">
        <div className="flex justify-between items-center flex-wrap gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <strong>{vote.title}</strong>
            <Badge variant="outline" className={cn(
              isVertrauensfrage
                ? CONFIDENCE_TYPE_BADGE.vertrauensfrage
                : CONFIDENCE_TYPE_BADGE.misstrauensvotum
            )}>
              {typeLabel}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            "font-semibold",
            vote.status === "passed"
              ? STATUS_BADGE.passed
              : STATUS_BADGE.rejected
          )}>
            {vote.status === "passed" ? "Angenommen" : "Gescheitert"}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mt-1">
          {isVertrauensfrage ? (
            <>
              Gestellt von{" "}
              <span className="font-semibold" style={{ color: initiator?.color ?? "#333" }}>
                {initiator?.name ?? vote.initiatedByPartyId}
              </span>
              {" "}· Bundeskanzler/in: <strong>{vote.chancellorName}</strong>
            </>
          ) : (
            <>
              Eingereicht von{" "}
              <span className="font-semibold" style={{ color: initiator?.color ?? "#333" }}>
                {initiator?.name ?? vote.initiatedByPartyId}
              </span>
              {" "}· Vorgeschlagen: <strong>{vote.proposedChancellor}</strong>
              {proposedParty && (
                <span style={{ color: proposedParty.color }}> ({proposedParty.name})</span>
              )}
            </>
          )}
        </p>

        {/* Seat vote bar */}
        {totalSeats > 0 && (
          <div className="my-2">
            <VoteBar yes={totalYes} no={totalNo} abstain={0} total={totalSeats} height="h-2" />
            <p className="text-xs text-muted-foreground mt-0.5">
              <span style={{ color: SEMANTIC_HEX.positive }}>Ja: {totalYes}</span>
              {" · "}
              <span style={{ color: SEMANTIC_HEX.negative }}>Nein: {totalNo}</span>
              {" · "}Schwellenwert: 368
              {totalYes >= 368 && <span style={{ color: SEMANTIC_HEX.positive }}> ✓</span>}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground italic">{outcomeText}</p>

        <p className="text-xs text-muted-foreground mt-0.5">
          Tag {vote.dayNumber}
          {vote.sentimentImpact != null && vote.sentimentImpact !== 0 && (
            <span style={{ color: vote.sentimentImpact > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
              {" "}· Stimmung: {vote.sentimentImpact > 0 ? "+" : ""}{vote.sentimentImpact}
            </span>
          )}
        </p>

        {expanded && vote.votes.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <strong className="text-sm">Beschreibung:</strong>
            <p className="text-sm mb-2">{vote.description}</p>

            <strong className="text-sm">Abstimmungsergebnis:</strong>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {vote.votes.map(v => {
                const p = partyMap.get(v.partyId);
                return (
                  <Badge
                    key={v.partyId}
                    variant="outline"
                    title={v.reason}
                    className={cn(
                      v.vote === "yes"
                        ? STATUS_BADGE.passed
                        : STATUS_BADGE.rejected
                    )}
                    style={{ border: `1px solid ${p?.color ?? "#ccc"}` }}
                  >
                    {p?.name ?? v.partyId}: {v.vote === "yes" ? "Ja" : "Nein"}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
