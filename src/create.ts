import { produce, type Draft } from 'immer';
import { useSyncExternalStore, useRef, useCallback } from 'react';
import type { SetState, EffectHelpers, UseStore, PersistConfig } from './types';
import { createQueryHook } from './query';
import { createMutationHook } from './mutation';
import { createInfiniteQueryHook } from './infinite-query';
import { hydrateState, persistState } from './middleware/persist';

export function create<C extends {
  state: Record<string, any>;
  actions?: Record<string, (...args: any[]) => any>;
  effects?: Record<string, (...args: any[]) => any>;
  computed?: Record<string, (state: any) => any>;
  queries?: Record<string, { fn: (...args: any[]) => Promise<any>; staleTime?: number; refetchInterval?: number; maxCacheSize?: number; infinite?: boolean; getNextPageParam?: any; getPreviousPageParam?: any }>;
  mutations?: Record<string, { fn: (...args: any[]) => Promise<any>; onSuccess?: any; onError?: any; onSettled?: any }>;
  persist?: PersistConfig<any>;
}>(
  config: C & {
    state: C['state'];
    actions?: { [K in keyof C['actions']]: (state: Draft<C['state']>, ...args: any[]) => void };
    effects?: { [K in keyof C['effects']]: (helpers: EffectHelpers<C['state']>, ...args: any[]) => Promise<any> };
    computed?: { [K in keyof C['computed']]: (state: C['state']) => any };
    queries?: C['queries'];
    mutations?: C['mutations'];
    persist?: PersistConfig<C['state']>;
  },
): UseStore<C['state'], NonNullable<C['actions']>, NonNullable<C['effects']>, NonNullable<C['computed']>, NonNullable<C['queries']>, NonNullable<C['mutations']>> {
  type S = C['state'];

  let rawState: S = config.state;
  let computedValues: Record<string, any> = {};
  let exposedState: any = rawState;
  const listeners = new Set<() => void>();

  // ─── Computed (with Proxy-based dependency tracking) ────────────────
  const computedKeys = config.computed ? Object.keys(config.computed) : [];
  // deps[key] = Set of state keys that computed[key] accessed
  const deps = new Map<string, Set<string>>();
  // cached result per computed key
  const cachedResults = new Map<string, any>();
  // previous rawState ref for diffing changed keys
  let prevRawState: S | undefined = undefined;

  // Warn if computed key collides with state key (dev only)
  if (config.computed) {
    const stateKeys = Object.keys(config.state);
    for (const ck of computedKeys) {
      if (stateKeys.includes(ck)) {
        console.warn(
          `[zustand-immer-lite] computed key "${ck}" overwrites state key with the same name. ` +
          `Rename the computed key to avoid unexpected behavior.`,
        );
      }
    }
  }

  /**
   * Track dependencies of a computed fn by using a Proxy that records
   * which keys are read from the state object.
   */
  const trackDeps = (fn: Function, stateObj: Record<string, any>): { result: any; accessed: Set<string> } => {
    const accessed = new Set<string>();
    const proxy = new Proxy(stateObj, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') accessed.add(prop);
        return Reflect.get(target, prop, receiver);
      },
    });
    const result = fn(proxy);
    return { result, accessed };
  };

  const recompute = () => {
    if (!config.computed) {
      exposedState = rawState;
      return;
    }

    // Determine which raw state keys actually changed
    const changedKeys = new Set<string>();
    if (prevRawState === undefined) {
      // First run — everything is "changed"
      for (const k of Object.keys(rawState as any)) changedKeys.add(k);
    } else {
      for (const k of Object.keys(rawState as any)) {
        if (!Object.is((rawState as any)[k], (prevRawState as any)[k])) {
          changedKeys.add(k);
        }
      }
    }

    // Build state proxy that includes already-computed values for chaining
    const stateObj: Record<string, any> = { ...rawState };

    for (const key of computedKeys) {
      const prevDeps = deps.get(key);
      const hasCached = cachedResults.has(key);

      // Skip recompute if: has cached result AND deps are tracked AND none of
      // the deps are in changedKeys (also check computed deps via cascade)
      if (hasCached && prevDeps && prevDeps.size > 0) {
        let needsRecompute = false;
        for (const dep of prevDeps) {
          if (changedKeys.has(dep)) {
            needsRecompute = true;
            break;
          }
        }
        if (!needsRecompute) {
          // Reuse cached result
          stateObj[key] = cachedResults.get(key);
          continue;
        }
      }

      // Recompute with dependency tracking
      const { result, accessed } = trackDeps(config.computed[key] as Function, stateObj);
      deps.set(key, accessed);

      if (!Object.is(result, cachedResults.get(key))) {
        // Mark this computed key as "changed" so downstream computed that
        // depend on it will also recompute
        changedKeys.add(key);
      }

      cachedResults.set(key, result);
      stateObj[key] = result;
    }

    prevRawState = rawState;

    const next: Record<string, any> = {};
    for (const key of computedKeys) {
      next[key] = cachedResults.get(key);
    }
    computedValues = next;
    exposedState = { ...rawState, ...computedValues };
  };

  // Initial compute
  recompute();

  // Hydrate from storage if persist is configured
  if (config.persist) {
    rawState = hydrateState(rawState, config.persist);
    recompute();
    config.persist.onRehydrationFinished?.(exposedState);
  }

  const notify = () => {
    listeners.forEach((fn) => fn());
    if (config.persist) {
      persistState(rawState, config.persist);
    }
  };

  const commitState = (nextRaw: S) => {
    rawState = nextRaw;
    recompute();
    notify();
  };

  const getState = (): any => exposedState;

  function subscribe(listener: () => void): () => void;
  function subscribe<T>(
    selector: (state: any) => T,
    callback: (current: T, previous: T) => void,
    options?: { equalityFn?: (a: T, b: T) => boolean; fireImmediately?: boolean },
  ): () => void;
  function subscribe(
    selectorOrListener: ((state: any) => any) | (() => void),
    callback?: (current: any, previous: any) => void,
    options?: { equalityFn?: (a: any, b: any) => boolean; fireImmediately?: boolean },
  ): () => void {
    // Original path: simple listener
    if (callback === undefined) {
      const listener = selectorOrListener as () => void;
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }

    // Selector path
    const selector = selectorOrListener as (state: any) => any;
    const equalityFn = options?.equalityFn ?? Object.is;
    let previousValue = selector(getState());

    const internalListener = () => {
      const currentValue = selector(getState());
      if (!equalityFn(currentValue, previousValue)) {
        const prev = previousValue;
        previousValue = currentValue;
        callback(currentValue, prev);
      }
    };

    listeners.add(internalListener);

    if (options?.fireImmediately) {
      callback(previousValue, previousValue);
    }

    return () => { listeners.delete(internalListener); };
  }

  const setState: SetState<S> = (updater) => {
    if (typeof updater === 'function') {
      rawState = produce(rawState, updater as (draft: Draft<S>) => void);
    } else if (typeof updater === 'object' && updater !== null) {
      rawState = { ...rawState, ...updater };
    } else {
      rawState = updater as S;
    }
    recompute();
    notify();
  };

  // Bind sync actions
  const actions: any = {};
  if (config.actions) {
    for (const key of Object.keys(config.actions)) {
      const fn = config.actions[key] as Function;
      actions[key] = (...args: any[]) => {
        const nextRaw = produce(rawState, (draft: Draft<S>) => {
          fn(draft, ...args);
        });
        commitState(nextRaw);
      };
    }
  }

  // Bind async effects
  const effects: any = {};
  if (config.effects) {
    for (const key of Object.keys(config.effects)) {
      const fn = config.effects[key] as Function;
      effects[key] = (...args: any[]) => {
        return fn({ set: setState, get: getState }, ...args);
      };
    }
  }

  // Bind queries (detect infinite queries via `infinite: true` flag)
  const queries: any = {};
  if (config.queries) {
    for (const key of Object.keys(config.queries)) {
      const qConfig = (config.queries as any)[key];
      queries[key] = qConfig.infinite
        ? createInfiniteQueryHook(qConfig)
        : createQueryHook(qConfig);
    }
  }

  // Bind mutations
  const mutations: any = {};
  if (config.mutations) {
    for (const key of Object.keys(config.mutations)) {
      const mConfig = (config.mutations as any)[key];
      mutations[key] = createMutationHook(mConfig);
    }
  }

  // React hook
  const useStore = ((selector?: (state: any) => any) => {
    const cache = useRef({ state: undefined as any, result: undefined as any });
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    const getSnapshot = useCallback((): any => {
      const currentState = getState();

      if (currentState === cache.current.state && cache.current.result !== undefined) {
        return cache.current.result;
      }

      const nextResult = selectorRef.current
        ? selectorRef.current(currentState)
        : currentState;

      if (cache.current.result !== undefined && Object.is(cache.current.result, nextResult)) {
        cache.current.state = currentState;
        return cache.current.result;
      }

      cache.current.state = currentState;
      cache.current.result = nextResult;
      return nextResult;
    }, []);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }) as UseStore<C['state'], NonNullable<C['actions']>, NonNullable<C['effects']>, NonNullable<C['computed']>, NonNullable<C['queries']>, NonNullable<C['mutations']>>;

  useStore.actions = actions;
  useStore.effects = effects;
  useStore.queries = queries;
  useStore.mutations = mutations;
  useStore.getState = getState;
  useStore.setState = setState;
  useStore.subscribe = subscribe;

  return useStore;
}
