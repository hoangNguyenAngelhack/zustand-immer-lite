import { useSyncExternalStore, useEffect, useRef, useCallback, useMemo } from 'react';
import type { InfiniteQueryConfig, InfiniteQueryResult, InfiniteData, InfiniteQueryHook } from './types';

interface InfiniteCacheEntry<T> {
  data: InfiniteData<T> | undefined;
  loading: boolean;
  error: Error | null;
  fetchedAt: number;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
}

const DEFAULT_MAX_CACHE_SIZE = 50;

export function createInfiniteQueryHook<T>(config: InfiniteQueryConfig<T>) {
  const maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;

  const cache = new Map<string, InfiniteCacheEntry<T>>();
  const listeners = new Map<string, Set<() => void>>();
  const snapshotCache = new Map<string, { entry: InfiniteCacheEntry<T>; snapshot: InfiniteCacheEntry<T> }>();
  const inflightId = new Map<string, number>();
  const accessOrder: string[] = [];
  let nextRequestId = 0;

  const touchKey = (key: string) => {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(key);
  };

  const evict = () => {
    if (cache.size <= maxCacheSize) return;
    const toRemove: string[] = [];
    for (const key of accessOrder) {
      if (cache.size - toRemove.length <= maxCacheSize) break;
      const set = listeners.get(key);
      const hasListeners = set && set.size > 0;
      const entry = cache.get(key);
      if (!hasListeners && entry && !entry.loading && !entry.isFetchingNextPage && !entry.isFetchingPreviousPage) {
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

  const getEntry = (key: string): InfiniteCacheEntry<T> => {
    if (!cache.has(key)) {
      cache.set(key, {
        data: undefined, loading: false, error: null, fetchedAt: 0,
        isFetchingNextPage: false, isFetchingPreviousPage: false,
      });
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

  const setEntry = (key: string, entry: InfiniteCacheEntry<T>) => {
    cache.set(key, entry);
    touchKey(key);
    const cached = snapshotCache.get(key);
    if (
      cached &&
      cached.entry.data === entry.data &&
      cached.entry.loading === entry.loading &&
      cached.entry.error === entry.error &&
      cached.entry.isFetchingNextPage === entry.isFetchingNextPage &&
      cached.entry.isFetchingPreviousPage === entry.isFetchingPreviousPage
    ) {
      cached.entry = entry;
    } else {
      snapshotCache.set(key, { entry, snapshot: { ...entry } });
    }
    notify(key);
  };

  const getSnapshot = (key: string): InfiniteCacheEntry<T> => {
    const entry = getEntry(key);
    const cached = snapshotCache.get(key);
    if (cached && cached.entry === entry) {
      return cached.snapshot;
    }
    const snapshot = { ...entry };
    snapshotCache.set(key, { entry, snapshot });
    return snapshot;
  };

  // Fetch first page (initial load or refetch)
  const fetchInitial = async (key: string, args: any[], force = false) => {
    const entry = getEntry(key);
    const staleTime = config.staleTime ?? 0;

    if (!force && entry.data !== undefined && entry.fetchedAt > 0 && Date.now() - entry.fetchedAt < staleTime) {
      return;
    }
    if (!force && entry.loading) return;

    const requestId = ++nextRequestId;
    inflightId.set(key, requestId);
    setEntry(key, { ...entry, loading: true, error: null });

    try {
      const firstPage = await config.fn(...args, undefined);
      if (inflightId.get(key) === requestId) {
        setEntry(key, {
          data: { pages: [firstPage], pageParams: [undefined] },
          loading: false, error: null, fetchedAt: Date.now(),
          isFetchingNextPage: false, isFetchingPreviousPage: false,
        });
      }
    } catch (e: any) {
      if (inflightId.get(key) === requestId) {
        const prev = getEntry(key);
        setEntry(key, { ...prev, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
      }
    }
  };

  // Fetch next page
  const fetchNext = async (key: string, args: any[]) => {
    const entry = getEntry(key);
    if (!entry.data || entry.isFetchingNextPage) return;

    const lastPage = entry.data.pages[entry.data.pages.length - 1];
    const nextParam = config.getNextPageParam(lastPage, entry.data.pages);
    if (nextParam == null) return;

    setEntry(key, { ...entry, isFetchingNextPage: true });

    try {
      const page = await config.fn(...args, nextParam);
      const current = getEntry(key);
      if (current.data) {
        setEntry(key, {
          ...current,
          data: {
            pages: [...current.data.pages, page],
            pageParams: [...current.data.pageParams, nextParam],
          },
          isFetchingNextPage: false,
          fetchedAt: Date.now(),
        });
      }
    } catch (e: any) {
      const current = getEntry(key);
      setEntry(key, {
        ...current,
        isFetchingNextPage: false,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  };

  // Fetch previous page
  const fetchPrevious = async (key: string, args: any[]) => {
    const entry = getEntry(key);
    if (!entry.data || entry.isFetchingPreviousPage || !config.getPreviousPageParam) return;

    const firstPage = entry.data.pages[0];
    const prevParam = config.getPreviousPageParam(firstPage, entry.data.pages);
    if (prevParam == null) return;

    setEntry(key, { ...entry, isFetchingPreviousPage: true });

    try {
      const page = await config.fn(...args, prevParam);
      const current = getEntry(key);
      if (current.data) {
        setEntry(key, {
          ...current,
          data: {
            pages: [page, ...current.data.pages],
            pageParams: [prevParam, ...current.data.pageParams],
          },
          isFetchingPreviousPage: false,
          fetchedAt: Date.now(),
        });
      }
    } catch (e: any) {
      const current = getEntry(key);
      setEntry(key, {
        ...current,
        isFetchingPreviousPage: false,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    }
  };

  // The returned hook
  const hook = ((...args: any[]): InfiniteQueryResult<T> => {
    const key = JSON.stringify(args);
    const argsRef = useRef(args);
    argsRef.current = args;

    const subscribe = useCallback((listener: () => void) => {
      const set = getListeners(key);
      set.add(listener);
      return () => {
        set.delete(listener);
        Promise.resolve().then(evict);
      };
    }, [key]);

    const snap = useCallback(() => getSnapshot(key), [key]);
    const entry = useSyncExternalStore(subscribe, snap, snap);

    const fetchNextPage = useCallback(() => {
      fetchNext(key, argsRef.current);
    }, [key]);

    const fetchPreviousPage = useCallback(() => {
      fetchPrevious(key, argsRef.current);
    }, [key]);

    const refetch = useCallback(() => {
      fetchInitial(key, argsRef.current, true);
    }, [key]);

    useEffect(() => {
      fetchInitial(key, argsRef.current);
    }, [key]);

    // refetchInterval
    useEffect(() => {
      if (!config.refetchInterval) return;
      const id = setInterval(() => {
        fetchInitial(key, argsRef.current, true);
      }, config.refetchInterval);
      return () => clearInterval(id);
    }, [key]);

    const hasNextPage = useMemo(() => {
      if (!entry.data || entry.data.pages.length === 0) return false;
      const lastPage = entry.data.pages[entry.data.pages.length - 1];
      return config.getNextPageParam(lastPage, entry.data.pages) != null;
    }, [entry.data]);

    const hasPreviousPage = useMemo(() => {
      if (!config.getPreviousPageParam || !entry.data || entry.data.pages.length === 0) return false;
      const firstPage = entry.data.pages[0];
      return config.getPreviousPageParam(firstPage, entry.data.pages) != null;
    }, [entry.data]);

    return useMemo(
      () => ({
        data: entry.data,
        loading: entry.loading,
        error: entry.error,
        fetchNextPage,
        fetchPreviousPage,
        hasNextPage,
        hasPreviousPage,
        isFetchingNextPage: entry.isFetchingNextPage,
        isFetchingPreviousPage: entry.isFetchingPreviousPage,
        refetch,
      }),
      [entry, fetchNextPage, fetchPreviousPage, hasNextPage, hasPreviousPage, refetch],
    );
  }) as InfiniteQueryHook<T>;

  // ─── Imperative methods ───────────────────────────────────────────

  hook.prefetch = (...args: any[]) => {
    const key = JSON.stringify(args);
    fetchInitial(key, args, false);
  };

  hook.invalidate = (...args: any[]) => {
    const key = JSON.stringify(args);
    const entry = cache.get(key);
    if (entry) {
      setEntry(key, { ...entry, fetchedAt: 0 });
    }
  };

  hook.invalidateAll = () => {
    for (const [key, entry] of cache) {
      setEntry(key, { ...entry, fetchedAt: 0 });
    }
  };

  hook.setQueryData = (args: any[], updater: InfiniteData<T> | ((prev: InfiniteData<T> | undefined) => InfiniteData<T>)) => {
    const key = JSON.stringify(args);
    const entry = getEntry(key);
    const newData = typeof updater === 'function'
      ? (updater as (prev: InfiniteData<T> | undefined) => InfiniteData<T>)(entry.data)
      : updater;
    setEntry(key, { ...entry, data: newData, fetchedAt: Date.now() });
  };

  hook.getQueryData = (args: any[]): InfiniteData<T> | undefined => {
    const key = JSON.stringify(args);
    return cache.get(key)?.data;
  };

  return hook;
}
