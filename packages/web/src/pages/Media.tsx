import { useState, useEffect, useCallback } from "react";
import { api, MediaArticle } from "../api";
import { usePolling } from "../usePolling";

const CATEGORY_COLORS: Record<string, string> = {
  policy: "#004b91",
  crisis: "#dc3545",
  election: "#6f42c1",
  opinion: "#17a2b8",
  economy: "#28a745",
};

const BIAS_LABELS: Record<string, { label: string; className: string }> = {
  left: { label: "Left", className: "media-bias-left" },
  center: { label: "Center", className: "media-bias-center" },
  right: { label: "Right", className: "media-bias-right" },
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

  if (loading && articles.length === 0) return <div className="loading">Loading media...</div>;

  return (
    <div>
      <h1>Media</h1>
      {articles.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
          No articles yet. Run a simulation to generate media coverage.
        </div>
      ) : (
        <>
          {/* Today's Front Pages */}
          <h2 style={{ marginBottom: "0.75rem" }}>Today's Front Pages</h2>
          <div className="front-pages-grid" style={{ marginBottom: "2rem" }}>
            {OUTLET_ORDER.map(outletName => {
              const article = frontPageMap.get(outletName);
              const bias = article ? (BIAS_LABELS[article.bias] || BIAS_LABELS.center) : null;
              const borderColor = article ? (CATEGORY_COLORS[article.category] || "#888") : "#ddd";
              const isExpanded = article ? expanded.has(article.id) : false;

              if (!article) {
                return (
                  <div key={outletName} className="front-page-column front-page-column-empty">
                    <div className="media-outlet" style={{ marginBottom: "0.5rem" }}>{outletName}</div>
                    <div style={{ color: "#aaa", fontSize: "0.85rem" }}>No coverage today</div>
                  </div>
                );
              }

              return (
                <div
                  key={outletName}
                  className="front-page-column"
                  style={{ borderColor }}
                  onClick={() => toggleExpand(article.id)}
                >
                  <div className="media-header" style={{ marginBottom: "0.5rem" }}>
                    <span className="media-outlet">{outletName}</span>
                    {bias && <span className={`badge ${bias.className}`}>{bias.label}</span>}
                  </div>
                  <div className="media-headline" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
                    {article.headline}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#555", lineHeight: 1.5 }}>
                    {article.summary.length > 200 ? article.summary.slice(0, 200) + "…" : article.summary}
                  </div>
                  {isExpanded && (
                    <div className="media-content">
                      {article.content.split("\n").map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  )}
                  {!isExpanded && (
                    <div className="media-expand-hint">Click to read full article</div>
                  )}
                </div>
              );
            })}
          </div>

          <h2 style={{ marginBottom: "0.75rem" }}>Archive</h2>
          {visible.map(group => (
            <div key={group.day}>
              <div className="news-day-separator">Day {group.day}</div>
              {group.articles.map(article => {
                const borderColor = CATEGORY_COLORS[article.category] || "#888";
                const bias = BIAS_LABELS[article.bias] || BIAS_LABELS.center;
                const isExpanded = expanded.has(article.id);

                return (
                  <div
                    key={article.id}
                    className="media-card"
                    style={{ borderLeftColor: borderColor }}
                    onClick={() => toggleExpand(article.id)}
                  >
                    <img
                      src={`https://picsum.photos/seed/${article.id}/800/280`}
                      alt={article.headline}
                      style={{
                        width: "100%",
                        height: 160,
                        objectFit: "cover",
                        borderRadius: "4px 4px 0 0",
                        display: "block",
                        marginBottom: 10,
                      }}
                      loading="lazy"
                    />
                    <div className="media-header">
                      <span className="media-outlet">{article.outlet}</span>
                      <span className={`badge ${bias.className}`}>{bias.label}</span>
                      <span className="badge" style={{
                        background: `${borderColor}20`,
                        color: borderColor,
                        marginLeft: 4,
                      }}>{article.category}</span>
                    </div>
                    <div className="media-headline">{article.headline}</div>
                    <div className="media-summary">{article.summary}</div>
                    {isExpanded && (
                      <div className="media-content">
                        {article.content.split("\n").map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    )}
                    {!isExpanded && (
                      <div className="media-expand-hint">Click to read full article</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {visible.length < dayGroups.length && (
            <button
              onClick={() => setLimit(l => l + 50)}
              style={{
                display: "block",
                margin: "1.5rem auto",
                padding: "0.75rem 2rem",
                border: "1px solid #ddd",
                borderRadius: 6,
                background: "white",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
