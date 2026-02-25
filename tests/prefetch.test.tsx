import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createQueryHook } from '../src/query';
import { create } from '../src/create';

describe('prefetch', () => {
  it('should populate cache so component gets data immediately', async () => {
    const fetchFn = vi.fn().mockResolvedValue('prefetched-data');
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    // Prefetch before any component mounts
    await useQuery.prefetch();

    // Wait for the async fetch to complete
    await new Promise((r) => setTimeout(r, 50));

    function TestComponent() {
      const { data, loading } = useQuery();
      return <span data-testid="v">{loading ? 'Loading' : data}</span>;
    }

    render(<TestComponent />);

    // Data should be available immediately (from cache)
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('prefetched-data');
    });

    // Should only have fetched once (via prefetch)
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should respect staleTime on prefetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    useQuery.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    // Prefetch again — should NOT refetch because staleTime hasn't expired
    useQuery.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should prefetch via store binding', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a', 'b']);
    const useStore = create({
      state: { x: 0 },
      queries: {
        items: { fn: fetchFn, staleTime: 60_000 },
      },
    });

    (useStore.queries.items as any).prefetch();
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('invalidate', () => {
  it('should mark cache as stale so next mount refetches', async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => `data-${++callCount}`);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data}</span>;
    }

    const { unmount } = render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-1');
    });
    unmount();

    // Invalidate the cache
    useQuery.invalidate();

    // Re-render — should refetch because cache is stale
    render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-2');
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should invalidateAll for all cached entries', async () => {
    const fetchFn = vi.fn().mockImplementation(async (id: number) => `data-${id}`);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent({ id }: { id: number }) {
      const { data, loading } = useQuery(id);
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data}</span>;
    }

    // Fetch id=1
    const { unmount: u1 } = render(<TestComponent id={1} />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('data-1'));
    u1();

    // Fetch id=2
    const { unmount: u2 } = render(<TestComponent id={2} />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('data-2'));
    u2();

    expect(fetchFn).toHaveBeenCalledTimes(2);

    // Invalidate all
    useQuery.invalidateAll();

    // Re-render id=1 — should refetch
    fetchFn.mockClear();
    render(<TestComponent id={1} />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('data-1'));
    expect(fetchFn).toHaveBeenCalledWith(1);
  });
});

describe('setQueryData / getQueryData', () => {
  it('should manually update cache data', async () => {
    const fetchFn = vi.fn().mockResolvedValue('original');
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('original'));

    // Manually update cache
    useQuery.setQueryData([], 'updated');

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('updated');
    });
  });

  it('should support updater function in setQueryData', async () => {
    const fetchFn = vi.fn().mockResolvedValue(10);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{String(data)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('10'));

    useQuery.setQueryData([], (prev: number | undefined) => (prev ?? 0) + 5);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('15');
    });
  });

  it('should read cache via getQueryData', async () => {
    const fetchFn = vi.fn().mockResolvedValue('cached-value');
    const useQuery = createQueryHook({ fn: fetchFn });

    // No data yet
    expect(useQuery.getQueryData([])).toBeUndefined();

    // Prefetch
    useQuery.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    expect(useQuery.getQueryData([])).toBe('cached-value');
  });
});

describe('optimisticUpdate', () => {
  it('should apply optimistic update and keep on success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['item1', 'item2']);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{JSON.stringify(data)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('["item1","item2"]'));

    const onSuccess = vi.fn();
    await useQuery.optimisticUpdate({
      args: [],
      updater: (prev) => [...(prev ?? []), 'item3'],
      mutationFn: async () => 'ok',
      onSuccess,
    });

    expect(onSuccess).toHaveBeenCalledWith('ok');
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["item1","item2","item3"]');
    });
  });

  it('should rollback on mutation failure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['a', 'b']);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{JSON.stringify(data)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('["a","b"]'));

    const onError = vi.fn();
    try {
      await useQuery.optimisticUpdate({
        args: [],
        updater: (prev) => [...(prev ?? []), 'c'],
        mutationFn: async () => { throw new Error('fail'); },
        onError,
      });
    } catch { /* expected */ }

    expect(onError).toHaveBeenCalled();
    // Should rollback to original data
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b"]');
    });
  });

  it('should call onSettled in both success and error paths', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    // Prefetch first
    useQuery.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    // Success path
    const onSettled1 = vi.fn();
    await useQuery.optimisticUpdate({
      args: [],
      updater: (prev) => prev,
      mutationFn: async () => 'ok',
      onSettled: onSettled1,
    });
    expect(onSettled1).toHaveBeenCalledTimes(1);

    // Error path
    const onSettled2 = vi.fn();
    try {
      await useQuery.optimisticUpdate({
        args: [],
        updater: (prev) => prev,
        mutationFn: async () => { throw new Error('fail'); },
        onSettled: onSettled2,
      });
    } catch { /* expected */ }
    expect(onSettled2).toHaveBeenCalledTimes(1);
  });
});
