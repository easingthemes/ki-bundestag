import { useEffect, useState, useCallback } from "react";
import { api, ConstitutionalChallenge, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, ALERT_STYLES } from "@/lib/colors";

const STATUS_OPTIONS = ["all", "pending", "ruled"] as const;
const DECISION_OPTIONS = ["all", "struck_down", "upheld"] as const;

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function ConstitutionalCourt() {
  const [challenges, setChallenges] = useState<ConstitutionalChallenge[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getConstitutionalChallenges().then(setChallenges).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(10); }, [statusFilter, decisionFilter]);

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = challenges.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (decisionFilter !== "all" && c.decision !== decisionFilter) return false;
    return true;
  });
  const visibleFiltered = filtered.slice(0, visibleCount);

  return (
    <div>
      <h1>Bundesverfassungsgericht</h1>
      <p className="text-muted-foreground mb-4">Constitutional challenges to passed legislation</p>

      <div className="flex gap-4 mb-4 flex-wrap items-center">
        <label className="flex items-center gap-1.5 text-sm">
          Status:
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={SELECT_CLS}>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          Decision:
          <select value={decisionFilter} onChange={e => setDecisionFilter(e.target.value)} className={SELECT_CLS}>
            {DECISION_OPTIONS.map(d => (
              <option key={d} value={d}>
                {d === "all" ? "All" : d === "struck_down" ? "Struck Down" : "Upheld"}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{filtered.length} challenge{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No constitutional challenges match the current filters.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleFiltered.map(c => {
            const filedBy = partyMap.get(c.filedByPartyId);
            const isExpanded = expandedId === c.id;
            const isStruckDown = c.decision === "struck_down";
            const isUpheld = c.decision === "upheld";

            return (
              <Card
                key={c.id}
                className="overflow-hidden"
              >
                <div
                  className="p-3.5 cursor-pointer bg-card select-none hover:bg-muted/50"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <Badge variant="outline" className={cn(
                      isStruckDown
                        ? STATUS_BADGE.struck_down
                        : isUpheld
                        ? STATUS_BADGE.upheld
                        : STATUS_BADGE.pending
                    )}>
                      {isStruckDown ? "Struck Down" : isUpheld ? "Upheld" : "Pending"}
                    </Badge>
                    <span className="text-sm font-semibold">"{c.billTitle}"</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="font-semibold" style={{ color: filedBy?.color ?? "#888" }}>
                      Filed by {filedBy?.name ?? c.filedByPartyId}
                    </span>
                    <span>Day {c.dayNumber}</span>
                    {c.ruledOnDay != null && c.ruledOnDay !== c.dayNumber && (
                      <span>Ruled Day {c.ruledOnDay}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3.5 bg-muted/50 border-t border-border">
                    <div className="mb-3 text-sm leading-relaxed">
                      <strong>Constitutional Arguments:</strong>
                      <p className="mt-1">{c.arguments}</p>
                    </div>
                    {c.reasoning && (
                      <div className="mb-3 text-sm leading-relaxed">
                        <strong>Court Reasoning:</strong>
                        <p className="mt-1 italic text-muted-foreground">{c.reasoning}</p>
                      </div>
                    )}
                    {isStruckDown && (
                      <div className={ALERT_STYLES.warning}>
                        <strong>Effect:</strong> The law has been nullified. Its economic and sentiment effects have been reversed.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          <ShowMoreButton
            total={filtered.length}
            visible={Math.min(visibleCount, filtered.length)}
            increment={10}
            onShowMore={() => setVisibleCount(c => c + 10)}
          />
        </div>
      )}
    </div>
  );
}
