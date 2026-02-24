import { useSyncExternalStore, useEffect, useRef, useCallback, useMemo } from 'react';
import type { QueryConfig, QueryResult } from './types';

interface CacheEntry<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  fetchedAt: number;
}

const DEFAULT_MAX_CACHE_SIZE = 50;

/**
 * Creates a React hook for a single query config.
 * Each unique set of args gets its own cache entry.
 * Cache auto-cleans: entries with no active listeners are evicted
 * when cache size exceeds maxCacheSize (default 50).
 */
export function createQueryHook<T>(config: QueryConfig<T>) {
  const maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;

  const cache = new Map<string, CacheEntry<T>>();
  const listeners = new Map<string, Set<() => void>>();
  const snapshotCache = new Map<string, { entry: CacheEntry<T>; snapshot: CacheEntry<T> }>();
  const inflightId = new Map<string, number>();
  // Track insertion order for LRU eviction
  const accessOrder: string[] = [];
  let nextRequestId = 0;

  const touchKey = (key: string) => {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(key);
  };

  /**
   * Evict oldest cache entries that have no active listeners.
   */
  const evict = () => {
    if (cache.size <= maxCacheSize) return;

    const toRemove: string[] = [];
    for (const key of accessOrder) {
      if (cache.size - toRemove.length <= maxCacheSize) break;
      const set = listeners.get(key);
      const hasListeners = set && set.size > 0;
      // Only evict entries that have no active listeners and are not loading
      const entry = cache.get(key);
      if (!hasListeners && entry && !entry.loading) {
        toRemove.push(key);
      }
    }

    for (const key of toRemove) {
      cache.delete(key);
      snapshotCache.delete(key);
      inflightId.delete(key);
      const idx = accessOrder.indexOf(key);
      if (idx !== -1) accessOrder.splice(idx, 1);
    }
  };

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
    touchKey(key);
    const cached = snapshotCache.get(key);
    if (cached && cached.entry.data === entry.data && cached.entry.loading === entry.loading && cached.entry.error === entry.error) {
      cached.entry = entry;
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
    const snapshot = { ...entry };
    snapshotCache.set(key, { entry, snapshot });
    return snapshot;
  };

  const fetchData = async (key: string, args: any[], force = false) => {
    const entry = getEntry(key);
    const staleTime = config.staleTime ?? 0;

    if (!force && entry.data !== undefined && entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < staleTime) {
      return;
    }

    if (!force && entry.loading) {
      return;
    }

    const requestId = ++nextRequestId;
    inflightId.set(key, requestId);

    setEntry(key, { ...entry, loading: true, error: null });

    try {
      const data = await config.fn(...args);
      if (inflightId.get(key) === requestId) {
        setEntry(key, { data, loading: false, error: null, fetchedAt: Date.now() });
      }
    } catch (e: any) {
      if (inflightId.get(key) === requestId) {
        const prev = getEntry(key);
        setEntry(key, { ...prev, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
      }
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
      return () => {
        set.delete(listener);
        // Schedule eviction when a listener unsubscribes (component unmount)
        // Use microtask to batch with other unmounts
        Promise.resolve().then(evict);
      };
    }, [key]);

    const snap = useCallback(() => getSnapshot(key), [key]);

    const entry = useSyncExternalStore(subscribe, snap, snap);

    const refetch = useCallback(() => {
      fetchData(key, argsRef.current, true);
    }, [key]);

    // Auto-fetch on mount and when args change
    useEffect(() => {
      fetchData(key, argsRef.current);
    }, [key]);

    // refetchInterval
    useEffect(() => {
      if (!config.refetchInterval) return;
      const id = setInterval(() => {
        fetchData(key, argsRef.current, true);
      }, config.refetchInterval);
      return () => clearInterval(id);
    }, [key]);

    return useMemo(
      () => ({ data: entry.data, loading: entry.loading, error: entry.error, refetch }),
      [entry, refetch],
    );
  };
}
