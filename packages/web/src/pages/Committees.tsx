import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, type CommitteeListItem } from "../api";
import { usePolling } from "../usePolling";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Committees() {
  const { t } = useTranslation();
  const [committees, setCommittees] = useState<CommitteeListItem[] | null>(null);

  const refresh = useCallback(() => {
    api.getCommittees().then(setCommittees).catch(console.error);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh);

  if (committees === null) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  return (
    <div>
      <h1>{t("committees.title")}</h1>
      {committees.length === 0 ? (
        <EmptyState message={t("committees.empty")} icon="🏛️" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {committees.map(c => (
            <Link key={c.id} to={`/committees/${c.id}`} className="no-underline">
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="font-semibold text-foreground mb-2">{c.name}</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {c.billCategory && (
                      <Badge variant="outline" className="text-xs">{c.billCategory}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>{c.billCount} {t("committees.billsInReview")}</div>
                    <div>{c.memberCount} {t("committees.members")}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
