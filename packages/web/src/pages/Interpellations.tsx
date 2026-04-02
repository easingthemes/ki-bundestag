import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api, Interpellation, Party } from "../api";
import { usePolling } from "../usePolling";
import { ShowMoreButton } from "../components/shared";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE as STATUS_BADGE_COLORS, INTERPELLATION_TYPE_BADGE, SEMANTIC_HEX } from "@/lib/colors";
import { FilterPills } from "@/components/FilterPills";
import { usePageMeta } from "@/hooks/usePageMeta";
import { ROUTE_SEO } from "@/seo";

const STATUS_OPTIONS = ["all", "pending", "answered", "expired"] as const;
const TYPE_OPTIONS = ["all", "kleine", "große"] as const;

export function Interpellations() {
  usePageMeta(ROUTE_SEO["/interpellations"] ?? { title: "Anfragen" });
  const { t } = useTranslation("parliament");
  const [interpellations, setInterpellations] = useState<Interpellation[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const refresh = useCallback(() => {
    api.getInterpellations().then(setInterpellations).catch(console.error);
    api.getParties().then(setParties).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);
  useEffect(() => { setVisibleCount(10); }, [statusFilter, typeFilter]);

  if (parties.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const filtered = interpellations.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    return true;
  });
  const visibleFiltered = filtered.slice(0, visibleCount);

  const statusLabels: Record<string, string> = {
    all: t("interpellations.filter.all"),
    pending: t("interpellations.filter.pending"),
    answered: t("interpellations.filter.answered"),
    expired: t("interpellations.filter.expired"),
  };

  const typeLabels: Record<string, string> = {
    all: t("interpellations.filter.all"),
    große: t("interpellations.type.grosse"),
    kleine: t("interpellations.type.kleine"),
  };

  return (
    <div>
      <h2 className="section-title">{t("interpellations.title")}</h2>
      <p className="text-muted-foreground mb-4">
        {t("interpellations.description")}
      </p>

      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{t("interpellations.filter.status")}</span>
          <FilterPills
            options={STATUS_OPTIONS.map(opt => ({ value: opt, label: statusLabels[opt] ?? opt }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{t("interpellations.filter.type")}</span>
          <FilterPills
            options={TYPE_OPTIONS.map(opt => ({ value: opt, label: typeLabels[opt] ?? opt }))}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-muted-foreground">{t("interpellations.empty")}</p>
      )}

      {visibleFiltered.map(interp => (
        <InterpellationCard
          key={interp.id}
          interp={interp}
          partyMap={partyMap}
          expanded={expandedId === interp.id}
          onToggle={() => setExpandedId(expandedId === interp.id ? null : interp.id)}
        />
      ))}

      <ShowMoreButton
        total={filtered.length}
        visible={Math.min(visibleCount, filtered.length)}
        increment={10}
        onShowMore={() => setVisibleCount(c => c + 10)}
      />
    </div>
  );
}

function InterpellationCard({
  interp,
  partyMap,
  expanded,
  onToggle,
}: {
  interp: Interpellation;
  partyMap: Map<string, Party>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("parliament");
  const filer = partyMap.get(interp.filedByPartyId);
  const targetParty = partyMap.get(interp.targetPartyId);
  const typeLabel = interp.type === "große" ? t("interpellations.type.grosse") : t("interpellations.type.kleine");

  return (
    <Card className="mb-3 cursor-pointer" onClick={onToggle}>
      <CardContent className="p-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <strong>{interp.title}</strong>
            <Badge variant="outline" className={cn(
              interp.type === "große"
                ? INTERPELLATION_TYPE_BADGE["große"]
                : INTERPELLATION_TYPE_BADGE.kleine
            )}>
              {typeLabel}
            </Badge>
          </div>
          <Badge variant="outline" className={STATUS_BADGE_COLORS[interp.status] ?? STATUS_BADGE_COLORS.pending}>
            {interp.status === "pending" ? t("interpellations.filter.pending")
              : interp.status === "answered" ? t("interpellations.filter.answered")
              : t("interpellations.filter.expired")}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mt-1">
          {t("interpellations.filedBy")}{" "}
          <span className="font-semibold" style={{ color: filer?.color ?? "#333" }}>
            {filer?.name ?? interp.filedByPartyId}
          </span>
          {" "}{t("interpellations.targeting")}{" "}
          <strong>{interp.targetMinisterName}</strong> ({interp.targetMinistry})
          {targetParty && (
            <span style={{ color: targetParty.color }}> — {targetParty.name}</span>
          )}
        </p>

        <p className="text-xs text-muted-foreground">
          {t("interpellations.day", { day: interp.dayNumber })}
          {interp.respondedOnDay != null && ` ${t("interpellations.answeredOnDay", { day: interp.respondedOnDay })}`}
          {interp.sentimentImpact != null && interp.sentimentImpact !== 0 && (
            <span style={{ color: interp.sentimentImpact > 0 ? SEMANTIC_HEX.positive : SEMANTIC_HEX.negative }}>
              {" "}{t("interpellations.sentiment")} {interp.sentimentImpact > 0 ? "+" : ""}{interp.sentimentImpact}
            </span>
          )}
        </p>

        {expanded && (
          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2">
              <strong>{t("interpellations.question")}</strong>
              <p className="text-sm mt-1">{interp.question}</p>
            </div>

            {interp.response && (
              <div className="mt-2">
                <strong>{t("interpellations.ministerResponse", { name: interp.targetMinisterName })}</strong>
                <div
                  className="text-sm mt-1 p-2 rounded bg-muted"
                  style={{ borderLeft: `3px solid ${targetParty?.color ?? "#666"}` }}
                >
                  {interp.response}
                </div>
              </div>
            )}

            {interp.status === "expired" && (
              <p className="mt-2 text-sm text-destructive italic">
                {t("interpellations.expired")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
