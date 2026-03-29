import { useState, useEffect, useCallback } from "react";
import { api, MediaArticle } from "../api";
import { usePolling } from "../usePolling";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BIAS_BADGE as SHARED_BIAS_BADGE } from "@/lib/colors";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

const CATEGORY_COLORS: Record<string, string> = {
  policy: "#1d4ed8",
  crisis: "#ef4444",
  election: "#7c3aed",
  opinion: "#0891b2",
  economy: "#10b981",
};

const BIAS_LABELS: Record<string, string> = {
  left: "Left",
  center: "Center",
  right: "Right",
};

export function Media() {
  const [articles, setArticles] = useState<MediaArticle[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    api.getMedia().then(data => {
      setArticles(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 10000);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Group articles by day
  const dayGroups: Array<{ day: number; articles: MediaArticle[] }> = [];
  const dayMap = new Map<number, MediaArticle[]>();
  for (const article of articles) {
    const list = dayMap.get(article.dayNumber) || [];
    list.push(article);
    dayMap.set(article.dayNumber, list);
  }
  for (const [day, arts] of dayMap) {
    dayGroups.push({ day, articles: arts });
  }
  dayGroups.sort((a, b) => b.day - a.day);

  const visible = dayGroups.slice(0, limit);

  const OUTLET_ORDER = ["Berliner Tagesspiegel", "Volksstimme", "Wirtschaftswoche"];
  const latestDayArticles = dayGroups[0]?.articles ?? [];
  const frontPageMap = new Map(latestDayArticles.map(a => [a.outlet, a]));

  if (loading && articles.length === 0) return <div className="py-8"><LoadingSkeleton lines={4} /></div>;

  return (
    <div>
      <h2 className="section-title">Medien</h2>
      {articles.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Noch keine Artikel. Starte die Simulation, um Medienberichte zu erzeugen.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Today's Front Pages */}
          <h2 className="section-title">Titelseiten von heute</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {OUTLET_ORDER.map(outletName => {
              const article = frontPageMap.get(outletName);
              const borderColor = article ? (CATEGORY_COLORS[article.category] || "#888") : "#ddd";
              const isExpanded = article ? expanded.has(article.id) : false;

              if (!article) {
                return (
                  <Card key={outletName} className="opacity-50">
                    <CardContent className="p-4">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{outletName}</div>
                      <p className="text-sm text-muted-foreground">Keine Berichterstattung heute</p>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card
                  key={outletName}
                  className="cursor-pointer transition-colors hover:border-border"
                  style={{ borderColor }}
                  onClick={() => toggleExpand(article.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{outletName}</span>
                      <Badge variant="outline" className={SHARED_BIAS_BADGE[article.bias] || SHARED_BIAS_BADGE.center}>
                        {BIAS_LABELS[article.bias] || "Center"}
                      </Badge>
                    </div>
                    <div className="font-bold text-base mb-2 leading-tight">{article.headline}</div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {article.summary.length > 200 ? article.summary.slice(0, 200) + "…" : article.summary}
                    </p>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border text-sm leading-[1.7]">
                        {article.content.split("\n").map((p, i) => (
                          <p key={i} className="mb-2 last:mb-0">{p}</p>
                        ))}
                      </div>
                    )}
                    {!isExpanded && (
                      <p className="text-xs text-muted-foreground mt-1.5">Klicken für vollständigen Artikel</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <h2 className="section-title">Archiv</h2>
          {visible.map(group => (
            <div key={group.day}>
              <div className="font-bold text-sm text-foreground py-2 mt-4 mb-1 border-b border-border">Day {group.day}</div>
              {group.articles.map(article => {
                const borderColor = CATEGORY_COLORS[article.category] || "#888";
                const isExpanded = expanded.has(article.id);

                return (
                  <Card
                    key={article.id}
                    className="mb-2 cursor-pointer transition-colors hover:border-border"
                    style={{ borderLeft: `4px solid ${borderColor}` }}
                    onClick={() => toggleExpand(article.id)}
                  >
                    <CardContent className="p-4">
                      <img
                        src={`https://picsum.photos/seed/${article.id}/800/280`}
                        alt={article.headline}
                        className="w-full h-40 object-cover rounded-t mb-2.5"
                        loading="lazy"
                      />
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{article.outlet}</span>
                        <Badge variant="outline" className={SHARED_BIAS_BADGE[article.bias] || SHARED_BIAS_BADGE.center}>
                          {BIAS_LABELS[article.bias] || "Center"}
                        </Badge>
                        <Badge
                          className="hover:opacity-80"
                          style={{ background: `${borderColor}20`, color: borderColor }}
                        >
                          {article.category}
                        </Badge>
                      </div>
                      <div className="font-bold text-[1.1rem] leading-tight mb-1">{article.headline}</div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{article.summary}</p>
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-border text-sm leading-[1.7]">
                          {article.content.split("\n").map((p, i) => (
                            <p key={i} className="mb-2 last:mb-0">{p}</p>
                          ))}
                        </div>
                      )}
                      {!isExpanded && (
                        <p className="text-xs text-muted-foreground mt-1.5">Klicken für vollständigen Artikel</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ))}
          {visible.length < dayGroups.length && (
            <button
              onClick={() => setLimit(l => l + 50)}
              className="block mx-auto my-6 py-3 px-8 border border-input rounded-md bg-card cursor-pointer text-sm hover:bg-accent"
            >
              Mehr laden
            </button>
          )}
        </>
      )}
    </div>
  );
}
