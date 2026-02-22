import { useState, useEffect } from "react";
import { api, type CrisisTemplate } from "../../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MODEL_TYPE_BADGE } from "@/lib/colors";

const SELECT_CLS = "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

interface InjectFormsProps {
  onInjected: (text: string, ok: boolean) => void;
}

export function InjectForms({ onInjected }: InjectFormsProps) {
  const [crisisTemplates, setCrisisTemplates] = useState<CrisisTemplate[]>([]);
  const [selectedCrisis, setSelectedCrisis] = useState("");

  useEffect(() => {
    api.getCrisisTemplates().then(ts => {
      setCrisisTemplates(ts);
      if (ts.length > 0) setSelectedCrisis(ts[0].id);
    }).catch(console.error);
  }, []);

  async function inject(type: string, data?: Record<string, unknown>) {
    try {
      await api.injectEvent(type, data);
      const labels: Record<string, string> = {
        crisis: "Crisis queued",
        election: "Snap election queued",
        economic_shock: "Economic shock queued",
        invalidate_election: "Election invalidation queued",
        budget: "Budget cycle queued",
      };
      onInjected(`${labels[type] ?? "Event queued"} — takes effect on the next simulation day.`, true);
    } catch {
      onInjected(`Failed to inject ${type}.`, false);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="section-title">Ereignisse einspeisen</h2>
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground mb-4">
            Manually trigger simulation events. All injections take effect at the start of the next simulation day.
          </p>

          <div className="flex flex-col gap-4">
            {/* Crisis */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong>Trigger Crisis</strong>
                  <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Injects a crisis from the 8 German templates. Daily economic drain + sentiment hit for its duration.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedCrisis}
                  onChange={e => setSelectedCrisis(e.target.value)}
                  className={SELECT_CLS}
                >
                  {crisisTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.severity})</option>
                  ))}
                </select>
                <button
                  className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                  onClick={() => { if (selectedCrisis) inject("crisis", { templateId: selectedCrisis }); }}
                >
                  Inject
                </button>
              </div>
            </div>

            {/* Snap Election */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong>Call Snap Election</strong>
                  <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Schedules an election announcement on the next sim day. Overrides nextElectionDay.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                  onClick={() => inject("election")}
                >
                  Inject
                </button>
              </div>
            </div>

            {/* Economic Shock */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong>Economic Shock</strong>
                  <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Applies a fixed shock: budget −5B, unemployment +0.5pp, inflation +0.3pp, GDP −0.5pp, sentiment −5.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-3.5 py-1.5 rounded border border-amber-500 bg-amber-500 text-white text-sm cursor-pointer hover:bg-amber-600"
                  onClick={() => inject("economic_shock", {
                    impact: { budget: -5, unemployment: 0.5, inflation: 0.3, gdpGrowth: -0.5, publicSentiment: -5 },
                  })}
                >
                  Inject
                </button>
              </div>
            </div>

            {/* Trigger Budget Cycle */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong>Trigger Budget Cycle</strong>
                  <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Forces a budget vote on the next sim day, regardless of the 60-day cycle.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-3.5 py-1.5 rounded border border-primary bg-primary text-white text-sm cursor-pointer hover:bg-primary/90"
                  onClick={() => inject("budget")}
                >
                  Inject
                </button>
              </div>
            </div>

            {/* Invalidate Election */}
            <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-b-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <strong>Invalidate Election</strong>
                  <Badge className={MODEL_TYPE_BADGE.Algorithmic}>Algorithmic</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cancels an active election in progress (announced/campaign phase). Resets to next scheduled term (4 years out).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="px-3.5 py-1.5 rounded border border-destructive bg-destructive text-white text-sm cursor-pointer hover:bg-destructive/90"
                  onClick={() => inject("invalidate_election")}
                >
                  Inject
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Re-export cn for use in parent
export { cn };
