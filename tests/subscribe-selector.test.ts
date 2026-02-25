import { describe, it, expect, vi } from 'vitest';
import { create } from '../src/create';
import { immer } from '../src/index';

describe('subscribeWithSelector', () => {
  it('should still work with original subscribe(listener) signature', () => {
    const useStore = create({ state: { count: 0 } });
    const listener = vi.fn();
    const unsub = useStore.subscribe(listener);

    useStore.setState({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    useStore.setState({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should fire callback when selected slice changes', () => {
    const useStore = create({ state: { count: 0, name: 'test' } });
    const callback = vi.fn();

    useStore.subscribe((s) => s.count, callback);

    useStore.setState({ count: 1 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(1, 0);
  });

  it('should NOT fire callback when unrelated state changes', () => {
    const useStore = create({ state: { count: 0, name: 'test' } });
    const callback = vi.fn();

    useStore.subscribe((s) => s.count, callback);

    useStore.setState({ name: 'changed' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('should pass correct previous and current values', () => {
    const useStore = create({ state: { count: 0 } });
    const callback = vi.fn();

    useStore.subscribe((s) => s.count, callback);

    useStore.setState({ count: 5 });
    expect(callback).toHaveBeenCalledWith(5, 0);

    useStore.setState({ count: 10 });
    expect(callback).toHaveBeenCalledWith(10, 5);
  });

  it('should respect custom equalityFn', () => {
    const useStore = create({ state: { count: 0 } });
    const callback = vi.fn();

    useStore.subscribe(
      (s) => s.count,
      callback,
      { equalityFn: (a, b) => Math.abs(a - b) < 5 },
    );

    useStore.setState({ count: 3 });
    expect(callback).not.toHaveBeenCalled();

    useStore.setState({ count: 8 });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(8, 0);
  });

  it('should fire immediately when fireImmediately is true', () => {
    const useStore = create({ state: { count: 42 } });
    const callback = vi.fn();

    useStore.subscribe(
      (s) => s.count,
      callback,
      { fireImmediately: true },
    );

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(42, 42);
  });

  it('should unsubscribe from selector-based subscription', () => {
    const useStore = create({ state: { count: 0 } });
    const callback = vi.fn();

    const unsub = useStore.subscribe((s) => s.count, callback);

    useStore.setState({ count: 1 });
    expect(callback).toHaveBeenCalledTimes(1);

    unsub();
    useStore.setState({ count: 2 });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should work with computed values in selector', () => {
    const useStore = create({
      state: { price: 100, taxRate: 0.1 },
      computed: {
        total: (state: any) => state.price + state.price * state.taxRate,
      },
    });
    const callback = vi.fn();

    useStore.subscribe((s) => s.total, callback);

    useStore.setState({ price: 200 });
    expect(callback).toHaveBeenCalledWith(220, 110);
  });

  it('should handle multiple selectors on the same store independently', () => {
    const useStore = create({ state: { a: 0, b: 0 } });
    const callbackA = vi.fn();
    const callbackB = vi.fn();

    useStore.subscribe((s) => s.a, callbackA);
    useStore.subscribe((s) => s.b, callbackB);

    useStore.setState({ a: 1 });
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).not.toHaveBeenCalled();

    useStore.setState({ b: 1 });
    expect(callbackA).toHaveBeenCalledTimes(1);
    expect(callbackB).toHaveBeenCalledTimes(1);
  });

  it('should handle rapid successive changes correctly', () => {
    const useStore = create({ state: { count: 0 } });
    const values: Array<[number, number]> = [];

    useStore.subscribe(
      (s) => s.count,
      (current, prev) => { values.push([current, prev]); },
    );

    useStore.setState({ count: 1 });
    useStore.setState({ count: 2 });
    useStore.setState({ count: 3 });

    expect(values).toEqual([[1, 0], [2, 1], [3, 2]]);
  });
});

describe('immer export', () => {
  it('should be a no-op identity function', () => {
    const config = { state: { count: 0 } };
    expect(immer(config)).toBe(config);
  });
});
