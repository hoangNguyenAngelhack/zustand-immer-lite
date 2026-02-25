export { create } from './create';
export { createQueryHook } from './query';
export { createMutationHook } from './mutation';
export { createInfiniteQueryHook } from './infinite-query';
export type {
  SetState, EffectHelpers, UseStore,
  QueryConfig, QueryResult, QueryHookMethods, QueryHook,
  MutationConfig, MutationResult, InferMutations,
  InfiniteData, InfiniteQueryConfig, InfiniteQueryResult, InfiniteQueryHookMethods, InfiniteQueryHook,
  StateStorage, PersistConfig, SubscribeWithSelector,
} from './types';

/** No-op identity. Immer is already built into zustand-immer-lite. */
export const immer = <T>(config: T): T => config;
