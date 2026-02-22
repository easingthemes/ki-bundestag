import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, type AnalyticsData } from "../api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FUNNEL_LABELS: Record<string, string> = {
  registered: "Registered",
  joinedParty: "Joined Party",
  firstAction: "First Action",
  appliedMdb: "Applied MdB",
  gotSeat: "Got Seat",
};

const FUNNEL_COLORS = [
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#c084fc", // purple-light
];

const ACTION_COLOR = "#6366f1";
const CHART_BAR_COLOR = "#3b82f6";

function formatActionType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    api.getAnalytics().then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="text-center py-8 text-muted-foreground">Loading analytics...</p>;

  const maxActionCount = Math.max(...data.actionBreakdown.map(a => a.count), 1);
  const maxDailyCount = Math.max(...data.dailyActions.map(d => d.count), 1);
  const funnelKeys = ["registered", "joinedParty", "firstAction", "appliedMdb", "gotSeat"] as const;
  const maxFunnel = Math.max(data.funnel.registered, 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="mb-0">Analytics</h1>
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors">&larr; Back to Admin</Link>
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Users", value: data.totalUsers },
          { label: "Total Actions", value: data.totalActions },
          { label: "DAU (24h)", value: data.dau },
          { label: "WAU (7d)", value: data.wau },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-5 text-center">
              <div className="text-3xl font-bold tracking-tight">{value.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Two column: Action Breakdown + Funnel ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Action Breakdown */}
        <div>
          <h2>Action Breakdown</h2>
          <Card>
            <CardContent className="p-5">
              {data.actionBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No actions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.actionBreakdown.map(({ actionType, count }) => (
                    <div key={actionType}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{formatActionType(actionType)}</span>
                        <span className="text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
                      </div>
                      <div className="h-4 w-full bg-muted rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${(count / maxActionCount) * 100}%`,
                            backgroundColor: ACTION_COLOR,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* User Funnel */}
        <div>
          <h2>User Funnel</h2>
          <Card>
            <CardContent className="p-5">
              <div className="space-y-3">
                {funnelKeys.map((key, i) => {
                  const value = data.funnel[key];
                  const pct = maxFunnel > 0 ? (value / maxFunnel) * 100 : 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{FUNNEL_LABELS[key]}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground tabular-nums">{value.toLocaleString()}</span>
                          {i > 0 && data.funnel[funnelKeys[i - 1]] > 0 && (
                            <Badge variant="outline" className="text-xs tabular-nums">
                              {((value / data.funnel[funnelKeys[i - 1]]) * 100).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="h-5 w-full bg-muted rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${Math.max(pct, 1)}%`,
                            backgroundColor: FUNNEL_COLORS[i],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Daily Activity Chart ───────────────────────────────────────── */}
      <div className="mb-8">
        <h2>Daily Activity (Last 30 Days)</h2>
        <Card>
          <CardContent className="p-5">
            {data.dailyActions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity data yet.</p>
            ) : (
              <div>
                <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
                  {data.dailyActions.map(({ date, count }) => {
                    const heightPct = maxDailyCount > 0 ? (count / maxDailyCount) * 100 : 0;
                    return (
                      <div
                        key={date}
                        className="flex-1 rounded-t transition-all hover:opacity-80 group relative"
                        style={{
                          height: `${Math.max(heightPct, 2)}%`,
                          backgroundColor: CHART_BAR_COLOR,
                          minWidth: 4,
                        }}
                        title={`${date}: ${count} actions`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{data.dailyActions[0]?.date}</span>
                  <span>{data.dailyActions[data.dailyActions.length - 1]?.date}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Users ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2>Top Users</h2>
        <Card>
          <CardContent className="p-5">
            {data.topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No user data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">#</th>
                      <th className="pb-2 pr-4 font-medium text-muted-foreground">User</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topUsers.map((u, i) => (
                      <tr key={u.userId} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium">{u.displayName || u.userId.slice(0, 8)}</td>
                        <td className="py-2 text-right tabular-nums">{u.actionCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
