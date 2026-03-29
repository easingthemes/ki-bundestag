import { useEffect, useState, useCallback } from "react";
import { api, Motion, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, MOTION_TYPE_BADGE, VOTE_COLORS } from "@/lib/colors";
import { VoteBar } from "@/components/VoteBar";

const STATUS_ORDER = ["passed", "rejected"];

export function Motions() {
  const [motions, setMotions] = useState<Motion[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getMotions().then(setMotions).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const visibleMotions = motions.slice(0, visibleCount);

  const grouped = STATUS_ORDER.map(status => ({
    status,
    motions: visibleMotions.filter(m => m.status === status),
  })).filter(g => g.motions.length > 0);

  return (
    <div>
      <h2 className="section-title">Anträge & Entschließungen</h2>
      {motions.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">Noch keine Anträge. Starte die Simulation, um Anträge zu sehen.</p>
      )}
      {grouped.map(group => (
        <div key={group.status} className="mb-8">
          <h2 className="section-title">
            {group.status === "passed" ? "Angenommen" : "Abgelehnt"} ({motions.filter(m => m.status === group.status).length})
          </h2>
          {group.motions.map(motion => (
            <MotionCard key={motion.id} motion={motion} partyMap={partyMap} />
          ))}
        </div>
      ))}
      <ShowMoreButton
        total={motions.length}
        visible={Math.min(visibleCount, motions.length)}
        increment={10}
        onShowMore={() => setVisibleCount(c => c + 10)}
      />
    </div>
  );
}

function MotionCard({ motion, partyMap }: { motion: Motion; partyMap: Map<string, Party> }) {
  const proposer = partyMap.get(motion.proposedBy);
  const typeLabel = motion.type === "motion" ? "Antrag" : "Entschließung";

  const totalSeats = motion.votes.reduce((sum, v) => {
    const p = partyMap.get(v.partyId);
    return sum + (p?.seatCount ?? 0);
  }, 0);

  const yesSeats = motion.votes
    .filter(v => v.vote === "yes")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);
  const noSeats = motion.votes
    .filter(v => v.vote === "no")
    .reduce((s, v) => s + (partyMap.get(v.partyId)?.seatCount ?? 0), 0);

  return (
    <Card className="mb-3">
      <CardContent className="p-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <strong>{motion.title}</strong>
            <Badge variant="outline" className={cn(
              motion.type === "motion"
                ? MOTION_TYPE_BADGE.motion
                : MOTION_TYPE_BADGE.resolution
            )}>
              {typeLabel}
            </Badge>
          </div>
          <Badge variant="outline" className={cn(
            motion.status === "passed"
              ? STATUS_BADGE.passed
              : STATUS_BADGE.rejected
          )}>
            {motion.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{motion.description}</p>
        <p className="text-xs text-muted-foreground">
          Proposed by {proposer?.name ?? motion.proposedBy} on day {motion.dayNumber}
        </p>

        {motion.votes.length > 0 && totalSeats > 0 && (
          <>
            <div className="my-2">
              <VoteBar yes={yesSeats} no={noSeats} abstain={0} total={totalSeats} showCounts />
            </div>
            <div className="mt-2">
              {motion.votes.map(v => {
                const p = partyMap.get(v.partyId);
                return (
                  <div key={v.partyId} className="flex items-center gap-2 text-sm py-1">
                    <span className={cn(
                      "size-2.5 rounded-full shrink-0",
                      v.vote === "yes" ? VOTE_COLORS.yes : VOTE_COLORS.no
                    )} />
                    <strong>{p?.name ?? v.partyId}</strong>
                    <span className="text-muted-foreground">— {v.reason}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
