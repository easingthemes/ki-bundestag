import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api, Budget as BudgetRecord, BudgetAllocations, Party, SimulationStatus } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE, REVISED_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { BUNDESTAG_SIZE } from "@/lib/parliament";
import { VoteBar } from "@/components/VoteBar";
import { FilterPills } from "@/components/FilterPills";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const MINISTRY_COLORS: Record<keyof BudgetAllocations, string> = {
  finance: "#4a6fa5",
  labour: "#e3000f",
  environment: "#64a12d",
  interior: "#5c5c5c",
  defence: "#8b6914",
  education: "#0070bb",
  health: "#c0392b",
  infrastructure: "#7f8c8d",
};

const TOTAL_SEATS = BUNDESTAG_SIZE;

export function Budget() {
  usePageMeta(ROUTE_SEO["/budget"] ?? { title: "Haushalt" });
  const { t } = useTranslation("budget");
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [simStatus, setSimStatus] = useState<SimulationStatus | null>(null);
  const [filter, setFilter] = useState<"all" | "passed" | "rejected">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(3);

  const refresh = useCallback(() => {
    api.getBudgets().then(setBudgets).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
    api.getSimulationStatus().then(setSimStatus).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = filter === "all" ? budgets : budgets.filter(b => b.status === filter);

  useEffect(() => { setVisibleCount(3); }, [filter]);

  const passedCount = budgets.filter(b => b.status === "passed").length;
  const rejectedCount = budgets.filter(b => b.status === "rejected").length;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h2 className="section-title">{t("title")}</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {t("description")}
      </p>

      <FilterPills
        className="mb-6"
        options={[
          { value: "all", label: t("filter.all", { count: budgets.length }) },
          { value: "passed", label: t("filter.passed", { count: passedCount }) },
          { value: "rejected", label: t("filter.rejected", { count: rejectedCount }) },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {filtered.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">
          {budgets.length === 0
            ? t("empty.noBudgets")
            : t("empty.noMatch")}
        </p>
      )}

      {filtered.slice(0, visibleCount).map(budget => {
        const isOpen = expanded.has(budget.id);
        return (
          <Card
            key={budget.id}
            className="mb-4"
            style={{ borderLeft: `4px solid ${budget.status === "passed" ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative}` }}
          >
            <CardContent className="p-5">
              <div
                className="flex justify-between items-center cursor-pointer"
                onClick={() => toggleExpand(budget.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{t("cycle", { number: budget.cycleNumber })}</strong>
                  <span className="text-sm text-muted-foreground">{t("day", { day: budget.proposedOnDay })}</span>
                  {budget.revisionAttempt > 0 && (
                    <Badge variant="outline" className={REVISED_BADGE}>{t("revised")}</Badge>
                  )}
                  {budget.status === "rejected" && budget.revisionAttempt === 0 && simStatus?.budgetRetryDay != null && (
                    <span className="text-xs text-amber-600">{t("retryDay", { day: simStatus.budgetRetryDay })}</span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant="outline" className={budget.status === "passed"
                    ? STATUS_BADGE.passed
                    : STATUS_BADGE.rejected
                  }>
                    {budget.status === "passed" ? t("status.passed") : t("status.rejected")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Seat vote bar */}
              <div className="mt-3">
                <div className="text-xs text-muted-foreground mb-1">
                  {t("vote.parliamentVote", { yes: budget.yesSeats ?? 0, no: budget.noSeats ?? 0 })}
                </div>
                <div className="my-2">
                  <VoteBar yes={budget.yesSeats ?? 0} no={budget.noSeats ?? 0} abstain={0} total={TOTAL_SEATS} />
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 pt-4 border-t border-border">
                  {/* Ministry allocations */}
                  <div className="mb-4">
                    <div className="text-sm font-semibold mb-2">
                      {t("vote.ministryAllocations", { total: budget.totalAmount })}
                    </div>
                    {(Object.keys(budget.allocations) as (keyof BudgetAllocations)[]).map(k => {
                      const amount = budget.allocations[k];
                      const share = (amount / budget.totalAmount) * 100;
                      const color = MINISTRY_COLORS[k] || "#999";
                      return (
                        <div key={k} className="flex items-center gap-2 mb-1 flex-wrap sm:flex-nowrap">
                          <div className="w-full sm:w-auto sm:min-w-36 text-xs">{t(`ministry.${k}`)}</div>
                          <div className="hidden sm:block min-w-18 text-xs text-right text-muted-foreground">{amount.toFixed(1)}B</div>
                          <div className="hidden sm:block min-w-11 text-xs text-right text-muted-foreground">{share.toFixed(1)}%</div>
                          <div className="flex-1 bg-muted rounded h-3 overflow-hidden min-w-15">
                            <div className="h-full rounded min-w-0.5" style={{ width: `${share}%`, background: color }} />
                          </div>
                          <div className="sm:hidden text-xs text-muted-foreground shrink-0">{share.toFixed(1)}%</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Economic effect */}
                  {budget.economicEffect && Object.keys(budget.economicEffect).length > 0 && (
                    <div className="mb-4">
                      <div className="text-sm font-semibold mb-1">{t("vote.economicEffects")}</div>
                      {Object.entries(budget.economicEffect).map(([key, delta]) => {
                        const d = delta as number;
                        return (
                          <div key={key} className="text-xs" style={{ color: d > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
                            {key}: {d > 0 ? "+" : ""}{d}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Party vote breakdown */}
                  {budget.votes.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold mb-1">{t("vote.partyVotes")}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {budget.votes.map(v => {
                          const party = partyMap.get(v.partyId);
                          return (
                            <Badge
                              key={v.partyId}
                              variant="outline"
                              className={cn(
                                "text-xs",
                                v.vote === "yes"
                                  ? STATUS_BADGE.passed
                                  : STATUS_BADGE.rejected
                              )}
                              style={{ border: `1px solid ${party?.color || "#ccc"}` }}
                            >
                              {party?.name ?? v.partyId}: {v.vote} ({v.seats})
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={3}
        onShowMore={() => setVisibleCount(c => c + 3)}
      />
    </div>
  );
}
