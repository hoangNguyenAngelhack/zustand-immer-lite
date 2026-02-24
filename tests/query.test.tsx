import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { create } from '../src/create';
import { createQueryHook } from '../src/query';

describe('createQueryHook', () => {
  it('should fetch data and return result', async () => {
    const fetchFn = vi.fn().mockResolvedValue(['item1', 'item2']);
    const useQuery = createQueryHook({ fn: fetchFn });

    function TestComponent() {
      const { data, loading, error } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      if (error) return <span data-testid="v">Error: {error.message}</span>;
      return <span data-testid="v">{JSON.stringify(data)}</span>;
    }

    render(<TestComponent />);
    expect(screen.getByTestId('v').textContent).toBe('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["item1","item2"]');
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should handle fetch errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('Network fail'));
    const useQuery = createQueryHook({ fn: fetchFn });

    function TestComponent() {
      const { data, loading, error } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      if (error) return <span data-testid="v">Error: {error.message}</span>;
      return <span data-testid="v">{JSON.stringify(data)}</span>;
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('Error: Network fail');
    });
  });

  it('should pass args and cache per args', async () => {
    const fetchFn = vi.fn().mockImplementation(async (id: number) => ({ id, name: `User ${id}` }));
    const useQuery = createQueryHook({ fn: fetchFn });

    function TestComponent({ id }: { id: number }) {
      const { data, loading } = useQuery(id);
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data?.name}</span>;
    }

    const { rerender } = render(<TestComponent id={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('User 1');
    });

    expect(fetchFn).toHaveBeenCalledWith(1);
  });

  it('should respect staleTime and not refetch', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading } = useQuery();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data}</span>;
    }

    const { unmount } = render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data');
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    unmount();

    // Re-render — should use cache, not refetch
    render(<TestComponent />);
    // Should show data immediately (from cache) or loading then data
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data');
    });

    // Should still only be 1 call because staleTime hasn't expired
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should refetch via refetch()', async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => `data-${++callCount}`);
    const useQuery = createQueryHook({ fn: fetchFn });

    function TestComponent() {
      const { data, loading, refetch } = useQuery();
      return (
        <div>
          <span data-testid="v">{loading ? 'Loading' : data}</span>
          <button data-testid="refetch" onClick={refetch}>Refetch</button>
        </div>
      );
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-1');
    });

    await act(async () => {
      screen.getByTestId('refetch').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-2');
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should refetch() even when staleTime has not expired', async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () => `data-${++callCount}`);
    const useQuery = createQueryHook({ fn: fetchFn, staleTime: 60_000 });

    function TestComponent() {
      const { data, loading, refetch } = useQuery();
      return (
        <div>
          <span data-testid="v">{loading ? 'Loading' : data}</span>
          <button data-testid="refetch" onClick={refetch}>Refetch</button>
        </div>
      );
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-1');
    });

    // refetch should bypass staleTime
    await act(async () => {
      screen.getByTestId('refetch').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-2');
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should handle race conditions (last request wins)', async () => {
    let resolvers: Array<(v: string) => void> = [];
    const fetchFn = vi.fn().mockImplementation(() => {
      return new Promise<string>((resolve) => { resolvers.push(resolve); });
    });
    const useQuery = createQueryHook({ fn: fetchFn });

    function TestComponent() {
      const { data, loading, refetch } = useQuery();
      return (
        <div>
          <span data-testid="v">{loading ? 'Loading' : (data ?? 'empty')}</span>
          <button data-testid="refetch" onClick={refetch}>Refetch</button>
        </div>
      );
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('Loading');
    });

    // Trigger a second request before the first resolves
    await act(async () => {
      screen.getByTestId('refetch').click();
    });

    expect(resolvers.length).toBe(2);

    // Resolve request 2 first, then request 1
    await act(async () => {
      resolvers[1]('second');
      await new Promise((r) => setTimeout(r, 10));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('second');
    });

    // Resolve request 1 (stale) — should be ignored
    await act(async () => {
      resolvers[0]('first-stale');
      await new Promise((r) => setTimeout(r, 10));
    });

    // Should still show "second", not "first-stale"
    expect(screen.getByTestId('v').textContent).toBe('second');
  });
});

describe('query cache eviction', () => {
  it('should evict old entries when maxCacheSize is exceeded', async () => {
    const fetchFn = vi.fn().mockImplementation(async (id: number) => `data-${id}`);
    const useQuery = createQueryHook({ fn: fetchFn, maxCacheSize: 2 });

    // Render with id=1
    function TestComponent({ id }: { id: number }) {
      const { data, loading } = useQuery(id);
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{data}</span>;
    }

    const { unmount: unmount1 } = render(<TestComponent id={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-1');
    });
    unmount1();

    // Render with id=2
    const { unmount: unmount2 } = render(<TestComponent id={2} />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-2');
    });
    unmount2();

    // Render with id=3 — should trigger eviction of id=1 (oldest, no listeners)
    const { unmount: unmount3 } = render(<TestComponent id={3} />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-3');
    });
    unmount3();

    // Wait for microtask eviction
    await new Promise((r) => setTimeout(r, 50));

    // Now render id=1 again — should refetch since it was evicted
    fetchFn.mockClear();
    render(<TestComponent id={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('data-1');
    });
    // Should have fetched again since cache was evicted
    expect(fetchFn).toHaveBeenCalledWith(1);
  });
});

describe('queries in create()', () => {
  it('should bind queries to store', async () => {
    const useStore = create({
      state: { filter: 'all' },
      queries: {
        items: {
          fn: async () => ['a', 'b', 'c'],
        },
      },
    });

    function TestComponent() {
      const { data, loading } = useStore.queries.items();
      const filter = useStore((s) => s.filter);
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{JSON.stringify(data)} filter={filter}</span>;
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b","c"] filter=all');
    });
  });
});
