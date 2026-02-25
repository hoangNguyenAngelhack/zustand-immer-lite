import type { Draft } from 'immer';

// ─── SetState ───────────────────────────────────────────────────────

export type SetState<S> = (updater: S | Partial<S> | ((draft: Draft<S>) => void)) => void;

// ─── Effect helpers ─────────────────────────────────────────────────

export interface EffectHelpers<S> {
  set: SetState<S>;
  get: () => S;
}

// ─── Infer bound types ──────────────────────────────────────────────

type StripFirst<F> =
  F extends (first: any, ...rest: infer P) => any
    ? (...args: P) => void
    : () => void;

type StripFirstAsync<F> =
  F extends (first: any, ...rest: infer P) => infer R
    ? (...args: P) => R
    : () => Promise<void>;

export type InferActions<A> = { [K in keyof A]: StripFirst<A[K]> };
export type InferEffects<E> = { [K in keyof E]: StripFirstAsync<E[K]> };

// ─── Computed ───────────────────────────────────────────────────────

export type InferComputed<Co> = {
  [K in keyof Co]: Co[K] extends (state: any) => infer R ? R : never;
};

// ─── Storage ────────────────────────────────────────────────────────

export interface StateStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

// ─── PersistConfig ──────────────────────────────────────────────────

export interface PersistConfig<S> {
  name: string;
  storage?: StateStorage;
  partialize?: (state: S) => Partial<S>;
  version?: number;
  migrate?: (persisted: any, version: number) => S;
  merge?: (persisted: Partial<S>, current: S) => S;
  onRehydrationFinished?: (state: S) => void;
}

// ─── SubscribeWithSelector ──────────────────────────────────────────

export interface SubscribeWithSelector<S> {
  (listener: () => void): () => void;
  <T>(
    selector: (state: S) => T,
    callback: (current: T, previous: T) => void,
    options?: {
      equalityFn?: (a: T, b: T) => boolean;
      fireImmediately?: boolean;
    },
  ): () => void;
}

// ─── Query ──────────────────────────────────────────────────────────

export interface QueryConfig<T = any> {
  fn: (...args: any[]) => Promise<T>;
  staleTime?: number;
  refetchInterval?: number;
  maxCacheSize?: number;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface QueryHookMethods<T> {
  prefetch: (...args: any[]) => void;
  invalidate: (...args: any[]) => void;
  invalidateAll: () => void;
  setQueryData: (args: any[], updater: T | ((prev: T | undefined) => T)) => void;
  getQueryData: (args: any[]) => T | undefined;
  optimisticUpdate: <R>(config: {
    args: any[];
    updater: (prev: T | undefined) => T;
    mutationFn: () => Promise<R>;
    onError?: (error: Error, previousData: T | undefined) => void;
    onSuccess?: (result: R) => void;
    onSettled?: () => void;
  }) => Promise<R>;
}

export type QueryHook<T> = ((...args: any[]) => QueryResult<T>) & QueryHookMethods<T>;

// ─── Mutation ───────────────────────────────────────────────────────

export interface MutationConfig<T = any> {
  fn: (...args: any[]) => Promise<T>;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onSettled?: (data: T | undefined, error: Error | null) => void;
}

export interface MutationResult<T> {
  mutate: (...args: any[]) => void;
  mutateAsync: (...args: any[]) => Promise<T>;
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reset: () => void;
}

type InferMutationFn<M> =
  M extends { fn: (...args: infer _P) => Promise<infer T> }
    ? () => MutationResult<T>
    : () => MutationResult<unknown>;

export type InferMutations<M> = {
  [K in keyof M]: InferMutationFn<M[K]>;
};

// ─── Infinite Query ─────────────────────────────────────────────────

export interface InfiniteData<T> {
  pages: T[];
  pageParams: unknown[];
}

export interface InfiniteQueryConfig<T = any> {
  fn: (...args: any[]) => Promise<T>;
  getNextPageParam: (lastPage: T, allPages: T[]) => unknown | undefined | null;
  getPreviousPageParam?: (firstPage: T, allPages: T[]) => unknown | undefined | null;
  infinite: true;
  staleTime?: number;
  refetchInterval?: number;
  maxCacheSize?: number;
}

export interface InfiniteQueryResult<T> {
  data: InfiniteData<T> | undefined;
  loading: boolean;
  error: Error | null;
  fetchNextPage: () => void;
  fetchPreviousPage: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  refetch: () => void;
}

export interface InfiniteQueryHookMethods<T> {
  prefetch: (...args: any[]) => void;
  invalidate: (...args: any[]) => void;
  invalidateAll: () => void;
  setQueryData: (args: any[], updater: InfiniteData<T> | ((prev: InfiniteData<T> | undefined) => InfiniteData<T>)) => void;
  getQueryData: (args: any[]) => InfiniteData<T> | undefined;
}

export type InfiniteQueryHook<T> = ((...args: any[]) => InfiniteQueryResult<T>) & InfiniteQueryHookMethods<T>;

// ─── Infer Queries (regular + infinite) ─────────────────────────────

type InferQueryFn<Q> =
  Q extends { infinite: true; fn: (...args: infer _P) => Promise<infer T> }
    ? InfiniteQueryHook<T>
    : Q extends { fn: (...args: infer P) => Promise<infer T> }
      ? ((...args: P) => QueryResult<T>) & QueryHookMethods<T>
      : () => QueryResult<unknown>;

export type InferQueries<Q> = {
  [K in keyof Q]: InferQueryFn<Q[K]>;
};

// ─── UseStore hook ──────────────────────────────────────────────────

export interface UseStore<S, A, E, Co = {}, Q = {}, M = {}> {
  (): S & InferComputed<Co>;
  <R>(selector: (state: S & InferComputed<Co>) => R): R;
  actions: InferActions<A>;
  effects: InferEffects<E>;
  queries: InferQueries<Q>;
  mutations: InferMutations<M>;
  getState: () => S & InferComputed<Co>;
  setState: SetState<S>;
  subscribe: SubscribeWithSelector<S & InferComputed<Co>>;
}
