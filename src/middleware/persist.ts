import type { StateStorage, PersistConfig } from '../types';

interface StoredState {
  state: any;
  version: number;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const getDefaultStorage = (): StateStorage =>
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : noopStorage;

export function hydrateState<S extends Record<string, any>>(
  currentState: S,
  config: PersistConfig<S>,
): S {
  const storage = config.storage ?? getDefaultStorage();
  const version = config.version ?? 0;
  const merge = config.merge ?? ((persisted, current) => ({ ...current, ...persisted }));

  try {
    const raw = storage.getItem(config.name);
    if (raw === null) return currentState;

    const stored: StoredState = JSON.parse(raw);
    let persistedState = stored.state;

    if (stored.version !== version) {
      if (config.migrate) {
        persistedState = config.migrate(persistedState, stored.version);
      } else {
        return currentState;
      }
    }

    return merge(persistedState, currentState);
  } catch {
    return currentState;
  }
}

export function persistState<S extends Record<string, any>>(
  state: S,
  config: PersistConfig<S>,
): void {
  const storage = config.storage ?? getDefaultStorage();
  const version = config.version ?? 0;
  const partialize = config.partialize ?? ((s: S) => s);

  try {
    const toPersist: StoredState = {
      state: partialize(state),
      version,
    };
    storage.setItem(config.name, JSON.stringify(toPersist));
  } catch {
    // Storage full or unavailable — silently fail
  }
}
