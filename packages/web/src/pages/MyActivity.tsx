import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type ActivityItem } from "../api";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShowMoreButton } from "../components/shared";
import { FilterPills } from "@/components/FilterPills";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const TYPE_ICONS: Record<string, string> = {
  proposal: "\u{1F4DD}",
  signal: "\u{1F5F3}\uFE0F",
  mdb_vote: "\u{1F3DB}\uFE0F",
  speech: "\u{1F3A4}",
  application: "\u{1F4CB}",
  question: "\u2753",
  seat_ended: "\u{1F6AA}",
};

const TYPE_BADGE: Record<string, string> = {
  proposal: "bg-purple-50 text-purple-700 border-purple-200",
  signal: "bg-indigo-50 text-indigo-700 border-indigo-200",
  mdb_vote: "bg-emerald-50 text-emerald-700 border-emerald-200",
  speech: "bg-cyan-50 text-cyan-700 border-cyan-200",
  application: "bg-amber-50 text-amber-700 border-amber-200",
  question: "bg-sky-50 text-sky-700 border-sky-200",
  seat_ended: "bg-red-50 text-red-700 border-red-200",
};

const OUTCOME_BADGE: Record<string, string> = {
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-zinc-100 text-zinc-600 border-zinc-200",
  open: "bg-amber-50 text-amber-700 border-amber-200",
  answered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  ended: "bg-red-50 text-red-700 border-red-200",
};

function entityLink(item: ActivityItem): string | null {
  if (item.entityType === "bill" && item.entityId) return `/bills/${item.entityId}`;
  if (item.entityType === "proposal" && item.entityId) return null;
  if (item.entityType === "question" && item.entityId) return "/questions";
  return null;
}

export function MyActivity() {
  usePageMeta(ROUTE_SEO["/my-activity"] ?? { title: "Meine Aktivität" });
  const { t } = useTranslation("notifications");
  const { user } = useUser();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    api.getMyActivity(undefined, 20).then(r => {
      setItems(r.items);
      setNextCursor(r.nextCursor);
    }).catch(console.error).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loading) return;
    setLoading(true);
    api.getMyActivity(nextCursor, 20).then(r => {
      setItems(prev => [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    }).catch(console.error).finally(() => setLoading(false));
  }, [nextCursor, loading]);

  if (!user) {
    return (
      <div>
        <h2 className="section-title">{t("activity.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("activity.loginPrompt")}</p>
      </div>
    );
  }

  const types = ["all", ...new Set(items.map(i => i.type))];
  const filtered = filter === "all" ? items : items.filter(i => i.type === filter);

  return (
    <div>
      <h2 className="section-title">{t("activity.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("activity.subtitle")}</p>

      {/* Filter pills */}
      <FilterPills
        className="mb-5"
        options={types.map(type => ({ value: type, label: type === "all" ? t("activity.filter.all") : t(`activity.activityTypes.${type}`, { defaultValue: type.replace(/_/g, " ") }) }))}
        value={filter}
        onChange={type => { setFilter(type); }}
      />

      {filtered.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      )}

      <div className="space-y-3">
        {filtered.map((item, i) => {
          const link = entityLink(item);
          return (
            <Card key={`${item.type}-${item.entityId}-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg shrink-0">{TYPE_ICONS[item.type] ?? "\u{1F4CC}"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-sm">{item.title}</span>
                      <Badge variant="outline" className={TYPE_BADGE[item.type] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}>
                        {t(`activity.activityTypes.${item.type}`, { defaultValue: item.type.replace(/_/g, " ") })}
                      </Badge>
                      {item.outcome && (
                        <Badge variant="outline" className={OUTCOME_BADGE[item.outcome] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}>
                          {t(`activity.outcomes.${item.outcome}`, { defaultValue: item.outcome })}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {item.dayNumber > 0 ? t("activity.day", { number: item.dayNumber }) : ""} {new Date(item.createdAt).toLocaleString("de-DE")}
                      </span>
                      {link && (
                        <Link to={link} className="text-xs text-blue-600 hover:underline">{t("activity.view")}</Link>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {nextCursor && (
        <ShowMoreButton
          visible={filtered.length}
          total={filtered.length + 1}
          increment={20}
          onShowMore={loadMore}
        />
      )}
    </div>
  );
}
