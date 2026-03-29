import { useState, useCallback, useEffect, useRef } from "react";
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
 *
 * Uses a ref for the fetcher so the effect doesn't re-run on every render
 * when callers pass inline arrow functions, while still calling the latest
 * version of the fetcher on each invocation.
 */
export function useApiData<T>(
  fetcher: () => Promise<T>,
  options: UseApiDataOptions = {}
): UseApiDataResult<T> {
  const { interval = 5000, deps = [] } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep a ref to the latest fetcher so the effect/callback doesn't need
  // fetcher in its dependency array (avoids re-running on every render when
  // callers pass inline arrow functions).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // refresh is stable across renders; it always calls the latest fetcher via ref.
  // deps triggers a new fetch when external dependencies (e.g. route params) change.
  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch {
      // Silently ignore errors — caller can check data for null
    } finally {
      setLoading(false);
    }
    // deps is intentionally spread here so callers can trigger re-fetch on
    // external value changes (e.g. a selected party ID).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  usePolling(refresh, interval);

  return { data, loading, refresh };
}
