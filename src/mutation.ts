import { useSyncExternalStore, useCallback, useMemo, useRef } from 'react';
import type { MutationConfig, MutationResult } from './types';

export function createMutationHook<T>(config: MutationConfig<T>) {
  return (): MutationResult<T> => {
    const stateRef = useRef({
      data: undefined as T | undefined,
      loading: false,
      error: null as Error | null,
    });
    const listenerRef = useRef<(() => void) | null>(null);
    const snapshotRef = useRef({ ...stateRef.current });

    const subscribe = useCallback((listener: () => void) => {
      listenerRef.current = listener;
      return () => { listenerRef.current = null; };
    }, []);

    const notify = useCallback(() => {
      snapshotRef.current = { ...stateRef.current };
      listenerRef.current?.();
    }, []);

    const getSnapshot = useCallback(() => snapshotRef.current, []);

    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const mutateAsync = useCallback(async (...args: any[]): Promise<T> => {
      stateRef.current = { ...stateRef.current, loading: true, error: null };
      notify();

      try {
        const data = await config.fn(...args);
        stateRef.current = { data, loading: false, error: null };
        notify();
        config.onSuccess?.(data);
        config.onSettled?.(data, null);
        return data;
      } catch (e: any) {
        const error = e instanceof Error ? e : new Error(String(e));
        stateRef.current = { ...stateRef.current, loading: false, error };
        notify();
        config.onError?.(error);
        config.onSettled?.(undefined, error);
        throw error;
      }
    }, [notify]);

    const mutate = useCallback((...args: any[]): void => {
      mutateAsync(...args).catch(() => {});
    }, [mutateAsync]);

    const reset = useCallback(() => {
      stateRef.current = { data: undefined, loading: false, error: null };
      notify();
    }, [notify]);

    return useMemo(
      () => ({
        mutate,
        mutateAsync,
        data: state.data,
        loading: state.loading,
        error: state.error,
        reset,
      }),
      [state, mutate, mutateAsync, reset],
    );
  };
}
