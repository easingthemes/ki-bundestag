import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ImpactData } from "../../api";
import { useUser } from "../../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function MyImpactCard() {
  const { user } = useUser();
  const [impact, setImpact] = useState<ImpactData | null>(null);

  useEffect(() => {
    if (!user) return;
    api.getMyImpact().then(setImpact).catch(() => {});
  }, [user]);

  const { t } = useTranslation("dashboard");

  if (!user || !impact) return null;

  const hasData = impact.signalAccuracy.total > 0 || impact.mdbVoteStats.total > 0 || impact.proposalOutcomes.length > 0 || impact.partyStats;
  if (!hasData) return null;

  const PROPOSAL_STATUS: Record<string, string> = { accepted: "Angenommen", declined: "Abgelehnt", expired: "Abgelaufen" };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Dein Einfluss</div>
        {impact.signalAccuracy.total > 0 && (
          <div className="mb-2">
            <div className="text-sm">
              <span className="font-semibold">{impact.signalAccuracy.matched}/{impact.signalAccuracy.total}</span>
              <span className="text-muted-foreground ml-1">Signale übereingestimmt</span>
            </div>
            <div className="flex h-1.5 rounded overflow-hidden mt-1 bg-muted">
              <div className="h-full rounded bg-emerald-500" style={{ width: `${impact.signalAccuracy.pct}%` }} />
            </div>
          </div>
        )}
        {impact.mdbVoteStats.total > 0 && (
          <div className="mb-2 text-sm">
            <span className="font-semibold">{impact.mdbVoteStats.total}</span> MdB-Stimmen, <span className="font-semibold">{impact.mdbVoteStats.withMajority}</span> mit Mehrheit
          </div>
        )}
        {impact.proposalOutcomes.length > 0 && (
          <div className="mb-2">
            {impact.proposalOutcomes.slice(0, 3).map((p, i) => (
              <div key={i} className="text-sm flex items-center gap-1.5">
                <Badge variant="outline" className={cn("text-xs", p.status === "accepted" ? "text-emerald-600 border-emerald-300" : p.status === "declined" ? "text-destructive border-destructive/30" : "")}>
                  {PROPOSAL_STATUS[p.status] ?? p.status}
                </Badge>
                {p.billId ? (
                  <Link to={`/bills/${p.billId}`} className="text-sm hover:underline truncate">{p.title}</Link>
                ) : (
                  <span className="truncate">{p.title}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {impact.partyStats && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
            {impact.partyStats.partyName}: {impact.partyStats.memberCount} Mitglieder · {impact.partyStats.approvalPerDay >= 0 ? "+" : ""}{impact.partyStats.approvalPerDay.toFixed(3)}/Tag
          </div>
        )}
      </CardContent>
    </Card>
  );
}
