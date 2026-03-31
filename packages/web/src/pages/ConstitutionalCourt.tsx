import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, ConstitutionalChallenge, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, ALERT_STYLES } from "@/lib/colors";
import { EmptyState } from "../components/EmptyState";

const STATUS_OPTIONS = ["all", "pending", "ruled"] as const;
const DECISION_OPTIONS = ["all", "struck_down", "upheld"] as const;

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function ConstitutionalCourt() {
  const { t } = useTranslation("parliament");
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

  const statusLabel = (s: string) => {
    if (s === "all") return t("court.filter.all");
    if (s === "pending") return t("court.filter.pending");
    return t("court.filter.ruled");
  };

  const decisionLabel = (d: string) => {
    if (d === "all") return t("court.filter.all");
    if (d === "struck_down") return t("court.filter.struck_down");
    return t("court.filter.upheld");
  };

  return (
    <div>
      <h2 className="section-title">{t("court.title")}</h2>
      <p className="text-muted-foreground mb-4">{t("court.description")}</p>

      <div className="flex gap-4 mb-4 flex-wrap items-center">
        <label className="flex items-center gap-1.5 text-sm">
          {t("court.filter.status")}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={SELECT_CLS}>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          {t("court.filter.decision")}
          <select value={decisionFilter} onChange={e => setDecisionFilter(e.target.value)} className={SELECT_CLS}>
            {DECISION_OPTIONS.map(d => (
              <option key={d} value={d}>{decisionLabel(d)}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">
          {filtered.length === 1
            ? t("court.challenge.singular")
            : t("court.challenges", { count: filtered.length })}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="Keine Verfassungsbeschwerden entsprechen den aktuellen Filtern." icon="⚖️" />
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
                      {isStruckDown ? t("court.status.struck_down") : isUpheld ? t("court.status.upheld") : t("court.status.pending")}
                    </Badge>
                    <span className="text-sm font-semibold">"{c.billTitle}"</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="font-semibold" style={{ color: filedBy?.color ?? "#888" }}>
                      {t("court.filedBy", { name: filedBy?.name ?? c.filedByPartyId })}
                    </span>
                    <span>{t("court.day", { day: c.dayNumber })}</span>
                    {c.ruledOnDay != null && c.ruledOnDay !== c.dayNumber && (
                      <span>{t("court.ruledDay", { day: c.ruledOnDay })}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-3.5 bg-muted/50 border-t border-border">
                    <div className="mb-3 text-sm leading-relaxed">
                      <strong>{t("court.arguments")}</strong>
                      <p className="mt-1">{c.arguments}</p>
                    </div>
                    {c.reasoning && (
                      <div className="mb-3 text-sm leading-relaxed">
                        <strong>{t("court.reasoning")}</strong>
                        <p className="mt-1 italic text-muted-foreground">{c.reasoning}</p>
                      </div>
                    )}
                    {isStruckDown && (
                      <div className={ALERT_STYLES.warning}>
                        <strong>{t("court.effect")}</strong> {t("court.effectText")}
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
