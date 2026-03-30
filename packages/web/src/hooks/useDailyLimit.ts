import { useState, useEffect } from "react";
import { api } from "../api";

interface LimitInfo {
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Hook to fetch and track per-user 24h rolling window limits.
 * Returns limit info for a specific action type, plus a refresh function.
 */
export function useDailyLimit(actionType: string, userId: string | null | undefined) {
  const [info, setInfo] = useState<LimitInfo | null>(null);

  useEffect(() => {
    if (!userId) return;
    api.getMyLimits()
      .then(limits => {
        if (limits[actionType]) setInfo(limits[actionType]);
      })
      .catch(() => {});
  }, [actionType, userId]);

  const refresh = () => {
    if (!userId) return;
    api.getMyLimits()
      .then(limits => {
        if (limits[actionType]) setInfo(limits[actionType]);
      })
      .catch(() => {});
  };

  return { info, refresh, isAtLimit: info ? info.remaining <= 0 : false };
}
