import { describe, it, expect, vi } from 'vitest';
import { create } from '../src/create';

describe('computed', () => {
  it('should compute initial values', () => {
    const useStore = create({
      state: { items: [1, 2, 3] },
      computed: {
        total: (state) => state.items.reduce((a: number, b: number) => a + b, 0),
        count: (state) => state.items.length,
      },
    });

    expect(useStore.getState().total).toBe(6);
    expect(useStore.getState().count).toBe(3);
  });

  it('should recompute when state changes via setState', () => {
    const useStore = create({
      state: { count: 2 },
      computed: {
        doubled: (state) => state.count * 2,
      },
    });

    expect(useStore.getState().doubled).toBe(4);

    useStore.setState({ count: 5 });
    expect(useStore.getState().doubled).toBe(10);

    useStore.setState((s) => { s.count = 10; });
    expect(useStore.getState().doubled).toBe(20);
  });

  it('should recompute when state changes via actions', () => {
    const useStore = create({
      state: { items: ['a', 'b'] },
      actions: {
        add(state, item: string) { state.items.push(item); },
        clear(state) { state.items = []; },
      },
      computed: {
        count: (state) => state.items.length,
        isEmpty: (state) => state.items.length === 0,
      },
    });

    expect(useStore.getState().count).toBe(2);
    expect(useStore.getState().isEmpty).toBe(false);

    useStore.actions.add('c');
    expect(useStore.getState().count).toBe(3);
    expect(useStore.getState().isEmpty).toBe(false);

    useStore.actions.clear();
    expect(useStore.getState().count).toBe(0);
    expect(useStore.getState().isEmpty).toBe(true);
  });

  it('should include computed in subscriber notifications', () => {
    const useStore = create({
      state: { x: 1 },
      computed: {
        squared: (state) => state.x * state.x,
      },
    });

    const listener = vi.fn();
    useStore.subscribe(listener);

    useStore.setState({ x: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useStore.getState().squared).toBe(9);
  });

  it('should recompute on effects setState', async () => {
    const useStore = create({
      state: { value: 0 },
      effects: {
        async load({ set }) {
          set((s) => { s.value = 42; });
        },
      },
      computed: {
        isPositive: (state) => state.value > 0,
      },
    });

    expect(useStore.getState().isPositive).toBe(false);

    await useStore.effects.load();
    expect(useStore.getState().isPositive).toBe(true);
    expect(useStore.getState().value).toBe(42);
  });

  it('should allow computed to reference other computed values', () => {
    const useStore = create({
      state: { price: 100, taxRate: 0.1 },
      computed: {
        tax: (state) => state.price * state.taxRate,
        total: (state) => state.price + state.tax, // depends on computed "tax"
      },
    });

    expect(useStore.getState().tax).toBe(10);
    expect(useStore.getState().total).toBe(110);

    useStore.setState({ price: 200 });
    expect(useStore.getState().tax).toBe(20);
    expect(useStore.getState().total).toBe(220);
  });

  it('should skip recompute when deps did not change', () => {
    let expensiveCallCount = 0;
    const useStore = create({
      state: { x: 1, y: 10 },
      computed: {
        // Only depends on x
        doubled: (state) => {
          expensiveCallCount++;
          return state.x * 2;
        },
      },
    });

    expect(useStore.getState().doubled).toBe(2);
    expect(expensiveCallCount).toBe(1); // initial compute

    // Change y — doubled should NOT recompute (doesn't depend on y)
    useStore.setState({ y: 20 });
    expect(useStore.getState().doubled).toBe(2);
    expect(expensiveCallCount).toBe(1); // still 1, skipped

    // Change x — doubled SHOULD recompute
    useStore.setState({ x: 5 });
    expect(useStore.getState().doubled).toBe(10);
    expect(expensiveCallCount).toBe(2); // now 2
  });

  it('should warn when computed key collides with state key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    create({
      state: { count: 0 },
      computed: {
        count: (state) => state.count * 2, // same name as state key!
      },
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('computed key "count" overwrites state key'),
    );

    warnSpy.mockRestore();
  });

  it('should work with no computed (backward compat)', () => {
    const useStore = create({
      state: { count: 0 },
      actions: {
        inc(state) { state.count += 1; },
      },
    });

    useStore.actions.inc();
    expect(useStore.getState().count).toBe(1);
  });
});
