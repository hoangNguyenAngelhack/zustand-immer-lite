import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createInfiniteQueryHook } from '../src/infinite-query';
import { create } from '../src/create';

interface Page {
  items: string[];
  nextCursor: string | null;
  prevCursor?: string | null;
}

const makePage = (items: string[], nextCursor: string | null, prevCursor?: string | null): Page => ({
  items, nextCursor, prevCursor,
});

describe('createInfiniteQueryHook', () => {
  it('should fetch first page on mount', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['a', 'b'], 'cursor-2'));
    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return <span data-testid="v">{JSON.stringify(allItems)}</span>;
    }

    render(<TestComponent />);
    expect(screen.getByTestId('v').textContent).toBe('Loading');

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b"]');
    });
  });

  it('should fetch next page and append', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makePage(['a', 'b'], 'cursor-2'))
      .mockResolvedValueOnce(makePage(['c', 'd'], null));

    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return (
        <div>
          <span data-testid="v">{JSON.stringify(allItems)}</span>
          <span data-testid="has-next">{String(hasNextPage)}</span>
          <span data-testid="fetching-next">{String(isFetchingNextPage)}</span>
          <button data-testid="next" onClick={fetchNextPage}>Next</button>
        </div>
      );
    }

    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b"]');
    });
    expect(screen.getByTestId('has-next').textContent).toBe('true');

    await act(async () => {
      screen.getByTestId('next').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b","c","d"]');
    });
    expect(screen.getByTestId('has-next').textContent).toBe('false');
  });

  it('should derive hasNextPage from getNextPageParam', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['x'], null));
    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { hasNextPage, loading } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      return <span data-testid="v">{String(hasNextPage)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('false');
    });
  });

  it('should not fetch next page when already fetching', async () => {
    let resolveNext: ((v: Page) => void) | null = null;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makePage(['a'], 'c2'))
      .mockImplementationOnce(() => new Promise<Page>((resolve) => { resolveNext = resolve; }));

    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, fetchNextPage, isFetchingNextPage } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      return (
        <div>
          <span data-testid="v">{data?.pages.length}</span>
          <span data-testid="fetching">{String(isFetchingNextPage)}</span>
          <button data-testid="next" onClick={fetchNextPage}>Next</button>
        </div>
      );
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('1'));

    // Click next — starts fetching
    act(() => { screen.getByTestId('next').click(); });
    await waitFor(() => expect(screen.getByTestId('fetching').textContent).toBe('true'));

    // Click next again — should be a no-op (already fetching)
    act(() => { screen.getByTestId('next').click(); });

    // Resolve
    await act(async () => {
      resolveNext!(makePage(['b'], null));
      await new Promise((r) => setTimeout(r, 50));
    });

    // Should only have 2 pages, not 3
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('2'));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('should handle fetchNextPage when no more pages', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['a'], null));
    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, fetchNextPage } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      return (
        <div>
          <span data-testid="v">{data?.pages.length}</span>
          <button data-testid="next" onClick={fetchNextPage}>Next</button>
        </div>
      );
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('1'));

    // Click next — should be a no-op (hasNextPage=false)
    await act(async () => {
      screen.getByTestId('next').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId('v').textContent).toBe('1');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should refetch and reset to first page', async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(async () =>
      makePage([`item-${++callCount}`], 'next'),
    );

    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, refetch } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return (
        <div>
          <span data-testid="v">{JSON.stringify(allItems)}</span>
          <button data-testid="refetch" onClick={refetch}>Refetch</button>
        </div>
      );
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('["item-1"]'));

    await act(async () => {
      screen.getByTestId('refetch').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["item-2"]');
    });
  });

  it('should handle error on next page without corrupting existing pages', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makePage(['a'], 'c2'))
      .mockRejectedValueOnce(new Error('Network error'));

    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, error, fetchNextPage } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return (
        <div>
          <span data-testid="v">{JSON.stringify(allItems)}</span>
          <span data-testid="error">{error?.message ?? 'none'}</span>
          <button data-testid="next" onClick={fetchNextPage}>Next</button>
        </div>
      );
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('["a"]'));

    await act(async () => {
      screen.getByTestId('next').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Pages should be preserved, error should be set
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a"]');
      expect(screen.getByTestId('error').textContent).toBe('Network error');
    });
  });

  it('should support fetchPreviousPage', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(makePage(['b', 'c'], 'c3', 'c0'))
      .mockResolvedValueOnce(makePage(['a'], null, null));

    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      getPreviousPageParam: (firstPage: Page) => firstPage.prevCursor,
      infinite: true,
    });

    function TestComponent() {
      const { data, loading, fetchPreviousPage, hasPreviousPage } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return (
        <div>
          <span data-testid="v">{JSON.stringify(allItems)}</span>
          <span data-testid="has-prev">{String(hasPreviousPage)}</span>
          <button data-testid="prev" onClick={fetchPreviousPage}>Prev</button>
        </div>
      );
    }

    render(<TestComponent />);
    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('["b","c"]'));
    expect(screen.getByTestId('has-prev').textContent).toBe('true');

    await act(async () => {
      screen.getByTestId('prev').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["a","b","c"]');
    });
  });
});

describe('infinite queries in create()', () => {
  it('should bind infinite queries to store via infinite: true flag', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['x', 'y'], null));
    const useStore = create({
      state: { x: 0 },
      queries: {
        items: {
          fn: fetchFn,
          getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
          infinite: true as const,
        },
      },
    });

    function TestComponent() {
      const result = (useStore.queries.items as any)();
      if (result.loading) return <span data-testid="v">Loading</span>;
      const allItems = result.data?.pages.flatMap((p: Page) => p.items) ?? [];
      return <span data-testid="v">{JSON.stringify(allItems)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["x","y"]');
    });
  });
});

describe('infinite query imperative methods', () => {
  it('should prefetch first page', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['prefetched'], null));
    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
      staleTime: 60_000,
    });

    useInfinite.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    function TestComponent() {
      const { data, loading } = useInfinite();
      if (loading) return <span data-testid="v">Loading</span>;
      const allItems = data?.pages.flatMap((p) => p.items) ?? [];
      return <span data-testid="v">{JSON.stringify(allItems)}</span>;
    }

    render(<TestComponent />);
    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('["prefetched"]');
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('should setQueryData and getQueryData on infinite queries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(makePage(['a'], null));
    const useInfinite = createInfiniteQueryHook({
      fn: fetchFn,
      getNextPageParam: (lastPage: Page) => lastPage.nextCursor,
      infinite: true,
      staleTime: 60_000,
    });

    // No data initially
    expect(useInfinite.getQueryData([])).toBeUndefined();

    // Prefetch
    useInfinite.prefetch();
    await new Promise((r) => setTimeout(r, 50));

    const data = useInfinite.getQueryData([]);
    expect(data?.pages).toHaveLength(1);
    expect(data?.pages[0].items).toEqual(['a']);

    // Set custom data
    useInfinite.setQueryData([], {
      pages: [makePage(['x', 'y'], null)],
      pageParams: [undefined],
    });

    const updated = useInfinite.getQueryData([]);
    expect(updated?.pages[0].items).toEqual(['x', 'y']);
  });
});
