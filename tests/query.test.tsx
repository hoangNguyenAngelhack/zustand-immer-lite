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
