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
