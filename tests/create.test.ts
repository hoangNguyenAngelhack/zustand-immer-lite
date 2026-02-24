import { describe, it, expect, vi } from 'vitest';
import { create } from '../src/create';

describe('create - state management', () => {
  it('should initialize with correct state', () => {
    const useStore = create({
      state: { count: 0, name: 'test' },
    });
    expect(useStore.getState()).toEqual({ count: 0, name: 'test' });
  });

  it('should update state with setState (partial)', () => {
    const useStore = create({ state: { a: 1, b: 2 } });
    useStore.setState({ a: 10 });
    expect(useStore.getState()).toEqual({ a: 10, b: 2 });
  });

  it('should update state with setState (Immer updater)', () => {
    const useStore = create({ state: { count: 0 } });
    useStore.setState((s) => { s.count = 42; });
    expect(useStore.getState().count).toBe(42);
  });

  it('should notify subscribers', () => {
    const useStore = create({ state: { x: 0 } });
    const listener = vi.fn();
    useStore.subscribe(listener);

    useStore.setState({ x: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    useStore.setState({ x: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('should unsubscribe', () => {
    const useStore = create({ state: { x: 0 } });
    const listener = vi.fn();
    const unsub = useStore.subscribe(listener);

    useStore.setState({ x: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    useStore.setState({ x: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('create - actions', () => {
  it('should bind sync actions with Immer', () => {
    const useStore = create({
      state: { count: 0 },
      actions: {
        increment(state) { state.count += 1; },
        addBy(state, n: number) { state.count += n; },
      },
    });

    useStore.actions.increment();
    expect(useStore.getState().count).toBe(1);

    useStore.actions.addBy(10);
    expect(useStore.getState().count).toBe(11);
  });

  it('should not mutate original state', () => {
    const useStore = create({
      state: { items: ['a'] },
      actions: {
        add(state, item: string) { state.items.push(item); },
      },
    });

    const before = useStore.getState();
    useStore.actions.add('b');
    const after = useStore.getState();

    expect(before.items).toEqual(['a']);
    expect(after.items).toEqual(['a', 'b']);
    expect(before).not.toBe(after);
  });

  it('should notify subscribers on action', () => {
    const useStore = create({
      state: { x: 0 },
      actions: {
        inc(state) { state.x += 1; },
      },
    });

    const listener = vi.fn();
    useStore.subscribe(listener);
    useStore.actions.inc();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('create - effects', () => {
  it('should bind async effects with set/get', async () => {
    const useStore = create({
      state: { data: '', loading: false },
      effects: {
        async fetchData({ set, get }) {
          set((s) => { s.loading = true; });
          expect(get().loading).toBe(true);

          await new Promise((r) => setTimeout(r, 10));

          set((s) => { s.data = 'hello'; s.loading = false; });
        },
      },
    });

    await useStore.effects.fetchData();
    expect(useStore.getState()).toEqual({ data: 'hello', loading: false });
  });

  it('should pass arguments to effects', async () => {
    const useStore = create({
      state: { result: '' },
      effects: {
        async search({ set }, query: string) {
          set((s) => { s.result = `Results for: ${query}`; });
        },
      },
    });

    await useStore.effects.search('hello');
    expect(useStore.getState().result).toBe('Results for: hello');
  });

  it('should handle errors in effects', async () => {
    const useStore = create({
      state: { error: null as string | null, loading: false },
      effects: {
        async failingFetch({ set }) {
          set((s) => { s.loading = true; });
          try {
            throw new Error('Network error');
          } catch (e: any) {
            set((s) => { s.error = e.message; s.loading = false; });
          }
        },
      },
    });

    await useStore.effects.failingFetch();
    expect(useStore.getState()).toEqual({ error: 'Network error', loading: false });
  });
});
