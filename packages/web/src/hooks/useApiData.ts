import { useState, useCallback, useEffect } from "react";
import { usePolling } from "../usePolling";

interface UseApiDataOptions {
  interval?: number;
  deps?: unknown[];
}

interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Generic hook for data fetching with optional polling.
 * Wraps the common pattern: useState + useCallback + useEffect + usePolling.
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  options: UseApiDataOptions = {}
): UseApiDataResult<T> {
  const { interval = 5000, deps = [] } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
    } catch {
      // Silently ignore errors — caller can check data for null
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps); // intentionally using deps array directly

  useEffect(() => {
    setLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  usePolling(refresh, interval);

  return { data, loading, refresh };
}
