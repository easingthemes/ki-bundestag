import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type SimulationEvent, type Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, fixColor } from "@/lib/utils";
import { MDB_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const PAGE_SIZE = 20;

/** Group mdb_speech events by billId */
interface DebateGroup {
  billId: string;
  billTitle: string;
  speeches: SimulationEvent[];
  latestDay: number;
}

function groupByBill(events: SimulationEvent[]): DebateGroup[] {
  const map = new Map<string, DebateGroup>();
  for (const ev of events) {
    const billId = (ev.data?.billId as string) ?? "unknown";
    const billTitle = ev.title.replace(/^MdB .+ spricht zu "/, "").replace(/" \(\d\. Lesung\)$/, "") || billId;
    let group = map.get(billId);
    if (!group) {
      group = { billId, billTitle, speeches: [], latestDay: ev.dayNumber };
      map.set(billId, group);
    }
    group.speeches.push(ev);
    if (ev.dayNumber > group.latestDay) group.latestDay = ev.dayNumber;
  }
  return [...map.values()].sort((a, b) => b.latestDay - a.latestDay);
}

export function Debates() {
  usePageMeta(ROUTE_SEO["/debatten"] ?? { title: "Debatten" });
  const { t } = useTranslation("parliament");
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const refresh = useCallback(() => {
    api.getEvents(200, 0, "mdb_speech").then(r => {
      setEvents(r.events);
      setTotal(r.total);
      setLoading(false);
    }).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (loading) return <div className="py-8"><LoadingSkeleton lines={6} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));
  const groups = groupByBill(events);
  const visibleGroups = groups.slice(0, visibleCount);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1>{t("debates.title")}</h1>
        <Badge variant="outline" className="text-xs">
          {t("debates.totalSpeeches", { count: total })}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{t("debates.subtitle")}</p>

      {groups.length === 0 ? (
        <EmptyState message={t("debates.empty")} icon="🎤" />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map(group => (
            <DebateCard key={group.billId} group={group} partyMap={partyMap} />
          ))}
        </div>
      )}

      <ShowMoreButton
        total={groups.length}
        visible={Math.min(visibleCount, groups.length)}
        increment={PAGE_SIZE}
        onShowMore={() => setVisibleCount(c => c + PAGE_SIZE)}
      />
    </div>
  );
}

function DebateCard({ group, partyMap }: { group: DebateGroup; partyMap: Map<string, Party> }) {
  const { t } = useTranslation("parliament");
  const [expanded, setExpanded] = useState(false);
  const previewCount = 3;
  const speeches = expanded ? group.speeches : group.speeches.slice(0, previewCount);

  return (
    <Card>
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <Link
              to={`/bills/${group.billId}`}
              className="font-bold text-sm text-foreground no-underline hover:underline leading-snug"
            >
              {group.billTitle}
            </Link>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t("debates.speechCount", { count: group.speeches.length })} · {t("debates.latestDay", { day: group.latestDay })}
            </div>
          </div>
          <Link to={`/bills/${group.billId}`} className="text-xs text-primary font-medium shrink-0 no-underline hover:underline">
            {t("debates.viewBill")}
          </Link>
        </div>

        {/* Speeches */}
        <div className="space-y-2">
          {speeches.map(ev => {
            const impact = ev.data?.sentimentImpact as number | null;
            const reading = ev.data?.reading as number | undefined;
            const displayName = ev.title.match(/^MdB (.+?) spricht/)?.[1] ?? "MdB";
            const impactColor = impact != null && impact > 0 ? SEMANTIC_HEX.positive : impact != null && impact < 0 ? SEMANTIC_HEX.negative : SEMANTIC_HEX.neutral;

            return (
              <div key={ev.id} className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", MDB_BADGE)}>MdB</Badge>
                    <span className="font-semibold text-xs truncate">{displayName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reading && (
                      <span className="text-[10px] text-muted-foreground">{reading}. Lesung</span>
                    )}
                    {impact != null && impact !== 0 && (
                      <span className="text-[10px] font-medium" style={{ color: impactColor }}>
                        {impact > 0 ? "+" : ""}{impact.toFixed(1)}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">Tag {ev.dayNumber}</span>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">{ev.description}</div>
              </div>
            );
          })}
        </div>

        {/* Expand/collapse */}
        {group.speeches.length > previewCount && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-primary font-medium mt-2 cursor-pointer hover:underline"
          >
            {expanded
              ? t("debates.showLess")
              : t("debates.showMoreSpeeches", { count: group.speeches.length - previewCount })
            }
          </button>
        )}
      </CardContent>
    </Card>
  );
}
