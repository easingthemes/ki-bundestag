import { useState, useEffect, useCallback } from "react";
import { api, type AppNotification } from "../api";
import { usePolling } from "../usePolling";
import { useUser } from "../userContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE } from "@/lib/colors";
import { ShowMoreButton } from "../components/shared";

const TYPE_FILTERS = ["all", "morning_summary", "event_queued", "event_ready"] as const;
const TYPE_LABELS: Record<string, string> = {
  all: "All",
  morning_summary: "Morning Summary",
  event_queued: "Queued",
  event_ready: "Ready",
};

export function Notifications() {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(20);

  const refresh = useCallback(() => {
    if (!user) return;
    api.getNotifications().then(setNotifications).catch(console.error);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);
  usePolling(refresh, 15000);

  if (!user) {
    return (
      <div>
        <h1>Notifications</h1>
        <p className="text-sm text-muted-foreground">Log in to view your notifications.</p>
      </div>
    );
  }

  const filtered = filter === "all" ? notifications : notifications.filter(n => n.type === filter);
  const unreadCount = notifications.filter(n => !n.read).length;

  async function markAllRead() {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) { console.error(err); }
  }

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) { console.error(err); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="mb-0">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Mark all as read ({unreadCount})
          </button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {TYPE_FILTERS.map(t => (
          <button
            key={t}
            onClick={() => { setFilter(t); setVisible(20); }}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer transition-colors",
              filter === t ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-muted/50",
            )}
          >
            {TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No notifications.</p>
      )}

      <div className="space-y-3">
        {filtered.slice(0, visible).map(n => (
          <Card key={n.id} className={cn(!n.read && "border-blue-300 bg-blue-50/30")}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    <span className="font-medium text-sm">{n.title}</span>
                    <Badge variant="outline" className={STATUS_BADGE[n.type] ?? "bg-zinc-100 text-zinc-600 border-zinc-200"}>
                      {TYPE_LABELS[n.type] ?? n.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{n.message}</p>
                  <span className="text-xs text-muted-foreground mt-1 block">
                    Day {n.dayNumber} &middot; {new Date(n.createdAt).toLocaleString("de-DE")}
                  </span>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ShowMoreButton
        visible={visible}
        total={filtered.length}
        increment={20}
        onShowMore={() => setVisible(v => v + 20)}
      />
    </div>
  );
}
