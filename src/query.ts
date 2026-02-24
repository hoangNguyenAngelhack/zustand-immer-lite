import { useSyncExternalStore, useEffect, useRef, useCallback, useMemo } from 'react';
import type { QueryConfig, QueryResult } from './types';

interface CacheEntry<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  fetchedAt: number;
}

/**
 * Creates a React hook for a single query config.
 * Each unique set of args gets its own cache entry.
 */
export function createQueryHook<T>(config: QueryConfig<T>) {
  const cache = new Map<string, CacheEntry<T>>();
  const listeners = new Map<string, Set<() => void>>();
  // Stable snapshot cache to avoid infinite loops in useSyncExternalStore
  const snapshotCache = new Map<string, { entry: CacheEntry<T>; snapshot: CacheEntry<T> }>();

  const getEntry = (key: string): CacheEntry<T> => {
    if (!cache.has(key)) {
      cache.set(key, { data: undefined, loading: false, error: null, fetchedAt: 0 });
    }
    return cache.get(key)!;
  };

  const getListeners = (key: string): Set<() => void> => {
    if (!listeners.has(key)) {
      listeners.set(key, new Set());
    }
    return listeners.get(key)!;
  };

  const notify = (key: string) => {
    const set = listeners.get(key);
    if (set) set.forEach((fn) => fn());
  };

  const setEntry = (key: string, entry: CacheEntry<T>) => {
    cache.set(key, entry);
    // Update snapshot cache - return same object if values unchanged
    const cached = snapshotCache.get(key);
    if (cached && cached.entry.data === entry.data && cached.entry.loading === entry.loading && cached.entry.error === entry.error) {
      cached.entry = entry;
      // snapshot stays the same reference
    } else {
      snapshotCache.set(key, { entry, snapshot: { ...entry } });
    }
    notify(key);
  };

  const getSnapshot = (key: string): CacheEntry<T> => {
    const entry = getEntry(key);
    const cached = snapshotCache.get(key);
    if (cached && cached.entry === entry) {
      return cached.snapshot;
    }
    // First time or entry ref changed
    const snapshot = { ...entry };
    snapshotCache.set(key, { entry, snapshot });
    return snapshot;
  };

  const fetchData = async (key: string, args: any[]) => {
    const entry = getEntry(key);
    const staleTime = config.staleTime ?? 0;

    // Skip if data is still fresh
    if (entry.data !== undefined && entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < staleTime) {
      return;
    }

    // Set loading
    setEntry(key, { ...entry, loading: true, error: null });

    try {
      const data = await config.fn(...args);
      setEntry(key, { data, loading: false, error: null, fetchedAt: Date.now() });
    } catch (e: any) {
      const prev = getEntry(key);
      setEntry(key, { ...prev, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
    }
  };

  // The returned hook
  return (...args: any[]): QueryResult<T> => {
    const key = JSON.stringify(args);
    const argsRef = useRef(args);
    argsRef.current = args;

    const subscribe = useCallback((listener: () => void) => {
      const set = getListeners(key);
      set.add(listener);
      return () => { set.delete(listener); };
    }, [key]);

    const snap = useCallback(() => getSnapshot(key), [key]);

    const entry = useSyncExternalStore(subscribe, snap, snap);

    const refetch = useCallback(() => {
      fetchData(key, argsRef.current);
    }, [key]);

    // Auto-fetch on mount and when args change
    useEffect(() => {
      fetchData(key, argsRef.current);
    }, [key]);

    // refetchInterval
    useEffect(() => {
      if (!config.refetchInterval) return;
      const id = setInterval(() => {
        fetchData(key, argsRef.current);
      }, config.refetchInterval);
      return () => clearInterval(id);
    }, [key]);

    return useMemo(
      () => ({ data: entry.data, loading: entry.loading, error: entry.error, refetch }),
      [entry, refetch],
    );
  };
}
