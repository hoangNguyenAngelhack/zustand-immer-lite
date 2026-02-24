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

// ─── Query ──────────────────────────────────────────────────────────

export interface QueryConfig<T = any> {
  fn: (...args: any[]) => Promise<T>;
  staleTime?: number;
  refetchInterval?: number;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

type InferQueryFn<Q> =
  Q extends { fn: (...args: infer P) => Promise<infer T> }
    ? (...args: P) => QueryResult<T>
    : () => QueryResult<unknown>;

export type InferQueries<Q> = {
  [K in keyof Q]: InferQueryFn<Q[K]>;
};

// ─── UseStore hook ──────────────────────────────────────────────────

export interface UseStore<S, A, E, Co = {}, Q = {}> {
  (): S & InferComputed<Co>;
  <R>(selector: (state: S & InferComputed<Co>) => R): R;
  actions: InferActions<A>;
  effects: InferEffects<E>;
  queries: InferQueries<Q>;
  getState: () => S & InferComputed<Co>;
  setState: SetState<S>;
  subscribe: (listener: () => void) => () => void;
}
