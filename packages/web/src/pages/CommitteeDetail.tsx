import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type CommitteeDetail as CommitteeDetailType, type Party } from "../api";
import { usePolling } from "../usePolling";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE } from "@/lib/colors";

const RECOMMENDATION_STYLE: Record<string, string> = {
  pass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amend: "bg-amber-50 text-amber-700 border-amber-200",
  reject: "bg-red-50 text-red-700 border-red-200",
};

const COMMITTEE_ROLE_STYLE: Record<string, string> = {
  chair: "bg-blue-50 text-blue-700 border-blue-200",
  deputy_chair: "bg-amber-50 text-amber-700 border-amber-200",
  member: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

export function CommitteeDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [committee, setCommittee] = useState<CommitteeDetailType | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [tab, setTab] = useState<"bills" | "members" | "stats">("bills");

  const refresh = useCallback(() => {
    if (!id) return;
    api.getCommitteeDetail(id).then(setCommittee).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (!committee) return <div className="py-8"><LoadingSkeleton lines={6} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  return (
    <div>
      <div className="mb-6">
        <Link to="/committees" className="text-sm text-muted-foreground hover:text-foreground no-underline">
          &larr; {t("committees.title")}
        </Link>
      </div>
      <h1>{committee.name}</h1>
      {committee.billCategory && (
        <Badge variant="outline" className="mb-4">{committee.billCategory}</Badge>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border mb-6">
        {(["bills", "members", "stats"] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors bg-transparent cursor-pointer",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {key === "bills" ? t("committees.bills") : key === "members" ? t("committees.members") : t("committees.stats")}
          </button>
        ))}
      </div>

      {/* Bills tab */}
      {tab === "bills" && (
        <div className="space-y-3">
          {committee.bills.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">{t("committees.noBills")}</p>
          ) : (
            committee.bills.map(bill => (
              <Card key={bill.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <Link to={`/bills/${bill.id}`} className="font-medium text-foreground hover:text-primary no-underline">
                      {bill.title}
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1">
                      {partyMap.get(bill.proposedBy)?.name ?? bill.proposedBy}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn("text-xs", STATUS_BADGE[bill.status])}>
                      {bill.status}
                    </Badge>
                    {bill.committeeRecommendation && (
                      <Badge variant="outline" className={cn("text-xs", RECOMMENDATION_STYLE[bill.committeeRecommendation])}>
                        {t(`committees.recommendation.${bill.committeeRecommendation}`)}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <div className="space-y-2">
          {committee.members.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">{t("committees.noMembers")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">{t("committees.partyLabel")}</th>
                    <th className="py-2 font-medium">{t("committees.roleLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {committee.members.map(m => {
                    const party = partyMap.get(m.partyId);
                    return (
                      <tr key={m.seatId} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-muted-foreground">{m.seatNumber}</td>
                        <td className="py-2 pr-3">
                          <Link to={`/mdb/${m.seatId}`} className="text-foreground hover:text-primary no-underline">
                            {m.displayName ?? `MdB #${m.seatNumber}`}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-1.5">
                            {party && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: party.color }}
                              />
                            )}
                            {party?.name ?? m.partyId}
                          </span>
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className={cn("text-xs", COMMITTEE_ROLE_STYLE[m.role])}>
                            {t(`committees.role.${m.role}`)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stats tab */}
      {tab === "stats" && (
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground mb-4">
              {t("committees.totalReviewed")}: <span className="font-semibold text-foreground">{committee.stats.totalBillsReviewed}</span>
            </div>
            {committee.stats.totalBillsReviewed > 0 ? (
              <div className="space-y-3">
                <StatBar
                  label={t("committees.recommendation.pass")}
                  count={committee.stats.passCount}
                  total={committee.stats.totalBillsReviewed}
                  color="bg-emerald-500"
                />
                <StatBar
                  label={t("committees.recommendation.amend")}
                  count={committee.stats.amendCount}
                  total={committee.stats.totalBillsReviewed}
                  color="bg-amber-400"
                />
                <StatBar
                  label={t("committees.recommendation.reject")}
                  count={committee.stats.rejectCount}
                  total={committee.stats.totalBillsReviewed}
                  color="bg-red-500"
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("committees.noStats")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="text-muted-foreground">{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
