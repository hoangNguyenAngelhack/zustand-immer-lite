import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from '../src/create';
import type { StateStorage } from '../src/types';

const createMockStorage = (): StateStorage & { store: Map<string, string> } => {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, val),
    removeItem: (key) => store.delete(key),
  };
};

describe('persist middleware', () => {
  it('should persist state to storage after setState', () => {
    const storage = createMockStorage();
    const useStore = create({
      state: { count: 0 },
      persist: { name: 'test-store', storage },
    });

    useStore.setState({ count: 5 });

    const stored = JSON.parse(storage.store.get('test-store')!);
    expect(stored.state.count).toBe(5);
    expect(stored.version).toBe(0);
  });

  it('should persist state after action', () => {
    const storage = createMockStorage();
    const useStore = create({
      state: { count: 0 },
      actions: {
        increment(state) { state.count += 1; },
      },
      persist: { name: 'test-store', storage },
    });

    useStore.actions.increment();

    const stored = JSON.parse(storage.store.get('test-store')!);
    expect(stored.state.count).toBe(1);
  });

  it('should hydrate state from storage on creation', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({ state: { count: 42 }, version: 0 }));

    const useStore = create({
      state: { count: 0 },
      persist: { name: 'test-store', storage },
    });

    expect(useStore.getState().count).toBe(42);
  });

  it('should respect partialize (only persist selected keys)', () => {
    const storage = createMockStorage();
    const useStore = create({
      state: { count: 0, secret: 'hidden' },
      persist: {
        name: 'test-store',
        storage,
        partialize: (state) => ({ count: state.count }),
      },
    });

    useStore.setState({ count: 10, secret: 'visible' });

    const stored = JSON.parse(storage.store.get('test-store')!);
    expect(stored.state.count).toBe(10);
    expect(stored.state.secret).toBeUndefined();
  });

  it('should handle version mismatch with migrate function', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({ state: { value: 'old' }, version: 0 }));

    const useStore = create({
      state: { value: '', newField: '' },
      persist: {
        name: 'test-store',
        storage,
        version: 1,
        migrate: (persisted, version) => {
          if (version === 0) {
            return { ...persisted, newField: 'migrated' };
          }
          return persisted;
        },
      },
    });

    expect(useStore.getState().value).toBe('old');
    expect(useStore.getState().newField).toBe('migrated');
  });

  it('should discard persisted state when version differs and no migrate provided', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({ state: { count: 99 }, version: 0 }));

    const useStore = create({
      state: { count: 0 },
      persist: { name: 'test-store', storage, version: 1 },
    });

    expect(useStore.getState().count).toBe(0);
  });

  it('should handle corrupted storage gracefully', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', 'not valid json!!!');

    const useStore = create({
      state: { count: 0 },
      persist: { name: 'test-store', storage },
    });

    expect(useStore.getState().count).toBe(0);
  });

  it('should handle missing storage entry', () => {
    const storage = createMockStorage();

    const useStore = create({
      state: { count: 5 },
      persist: { name: 'test-store', storage },
    });

    expect(useStore.getState().count).toBe(5);
  });

  it('should use custom merge strategy', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({
      state: { nested: { a: 1 } },
      version: 0,
    }));

    const useStore = create({
      state: { nested: { a: 0, b: 2 } },
      persist: {
        name: 'test-store',
        storage,
        merge: (persisted: any, current: any) => ({
          ...current,
          nested: { ...current.nested, ...persisted.nested },
        }),
      },
    });

    expect(useStore.getState().nested).toEqual({ a: 1, b: 2 });
  });

  it('should call onRehydrationFinished with correct state', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({ state: { count: 10 }, version: 0 }));
    const onFinished = vi.fn();

    create({
      state: { count: 0 },
      persist: { name: 'test-store', storage, onRehydrationFinished: onFinished },
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({ count: 10 });
  });

  it('should work with computed (re-derive after hydration)', () => {
    const storage = createMockStorage();
    storage.setItem('test-store', JSON.stringify({ state: { price: 100, taxRate: 0.1 }, version: 0 }));

    const useStore = create({
      state: { price: 0, taxRate: 0 },
      computed: {
        total: (state: any) => state.price + state.price * state.taxRate,
      },
      persist: { name: 'test-store', storage },
    });

    expect(useStore.getState().price).toBe(100);
    expect(useStore.getState().total).toBe(110);
  });

  it('should persist rawState only (not computed values)', () => {
    const storage = createMockStorage();
    const useStore = create({
      state: { price: 50, taxRate: 0.2 },
      computed: {
        total: (state: any) => state.price + state.price * state.taxRate,
      },
      persist: { name: 'test-store', storage },
    });

    useStore.setState({ price: 100 });

    const stored = JSON.parse(storage.store.get('test-store')!);
    expect(stored.state.total).toBeUndefined();
    expect(stored.state.price).toBe(100);
    expect(stored.state.taxRate).toBe(0.2);
  });

  it('should persist with correct version number', () => {
    const storage = createMockStorage();
    const useStore = create({
      state: { count: 0 },
      persist: { name: 'test-store', storage, version: 3 },
    });

    useStore.setState({ count: 1 });

    const stored = JSON.parse(storage.store.get('test-store')!);
    expect(stored.version).toBe(3);
  });
});
