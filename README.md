# zustand-immer-lite

Zustand-like state management for React with built-in Immer and async support.

[![npm](https://img.shields.io/npm/v/zustand-immer-lite)](https://www.npmjs.com/package/zustand-immer-lite)
[![bundle size](https://img.shields.io/bundlephobia/minzip/zustand-immer-lite)](https://bundlephobia.com/package/zustand-immer-lite)
[![license](https://img.shields.io/npm/l/zustand-immer-lite)](./LICENSE)

## Features

- **Zero config** — one `create()` call, no Provider, no boilerplate
- **Immer built-in** — mutate state directly, immutability handled for you
- **Computed state** — derived values with Proxy-based dependency tracking and caching
- **Async effects** — side effects with `set`/`get` helpers
- **Queries** — data fetching with per-args caching, stale time, refetch interval, LRU eviction, race condition handling, and request deduplication
- **Infinite queries** — cursor-based pagination with `fetchNextPage`/`fetchPreviousPage`
- **Mutations** — write operations with `onSuccess`/`onError`/`onSettled` lifecycle
- **Optimistic updates** — instant UI feedback with automatic rollback on failure
- **Prefetching & cache control** — `prefetch`, `invalidate`, `setQueryData`, `getQueryData`
- **Persist** — save/restore state to localStorage (or custom storage) with versioning and migration
- **Subscribe with selector** — listen to specific state slices with custom equality
- **TypeScript-first** — full type inference from config

## Install

```bash
npm install zustand-immer-lite
```

Requires `react >= 18` and `react-dom >= 18` as peer dependencies.

---

## Quick Start

```tsx
import { create } from 'zustand-immer-lite';

const useCounter = create({
  state: { count: 0 },
  actions: {
    increment(state) { state.count += 1; },
    decrement(state) { state.count -= 1; },
    addBy(state, amount: number) { state.count += amount; },
  },
  computed: {
    doubled: (state) => state.count * 2,
  },
});

function Counter() {
  const count = useCounter((s) => s.count);
  const doubled = useCounter((s) => s.doubled);
  const { increment, addBy } = useCounter.actions;

  return (
    <div>
      <p>{count} (doubled: {doubled})</p>
      <button onClick={increment}>+1</button>
      <button onClick={() => addBy(10)}>+10</button>
    </div>
  );
}
```

No `<Provider>`, no `useDispatch`, no action types.

---

## API Reference

### `create(config)`

```ts
const useStore = create({
  state: { ... },       // initial state (required)
  actions: { ... },     // sync state updaters (optional)
  effects: { ... },     // async side effects (optional)
  computed: { ... },    // derived values (optional)
  queries: { ... },     // data fetching hooks (optional)
  mutations: { ... },   // write operation hooks (optional)
  persist: { ... },     // state persistence config (optional)
});
```

**Returns** a React hook with attached properties:

| Property | Description |
|---|---|
| `useStore()` | Full state including computed values |
| `useStore(selector)` | Selected slice of state |
| `useStore.actions` | Bound sync actions (callable outside React) |
| `useStore.effects` | Bound async effects (callable outside React) |
| `useStore.queries` | Query hooks (use inside React components) |
| `useStore.mutations` | Mutation hooks (use inside React components) |
| `useStore.getState()` | Read current state outside React |
| `useStore.setState(updater)` | Update state outside React |
| `useStore.subscribe(listener)` | Listen to all state changes |
| `useStore.subscribe(selector, cb, opts?)` | Listen to specific state slices |

---

### Actions

Sync functions that receive an Immer draft as the first argument. Mutate directly — Immer produces the immutable update.

```ts
const useStore = create({
  state: { items: [] as string[], count: 0 },
  actions: {
    add(state, item: string) {
      state.items.push(item);
    },
    reset(state) {
      state.items = [];
      state.count = 0;
    },
  },
});

// Call anywhere — no dispatch needed
useStore.actions.add('hello');
useStore.actions.reset();
```

For complex state types, annotate the first param with `Draft<YourState>`:

```ts
import type { Draft } from 'immer';

interface AppState { items: Todo[]; loading: boolean; }

const useStore = create({
  state: { items: [] as Todo[], loading: false },
  actions: {
    add(state: Draft<AppState>, text: string) {
      state.items.push({ id: Date.now(), text, done: false });
    },
  },
});
```

---

### Effects

Async functions for API calls and side effects. Receive `{ set, get }` helpers as the first argument.

- `set(updater)` — accepts an Immer draft function, a partial object, or a full state replacement
- `get()` — returns current state (including computed)

```ts
import { create, type EffectHelpers } from 'zustand-immer-lite';

const useTodos = create({
  state: {
    items: [] as Todo[],
    loading: false,
    error: null as string | null,
  },
  effects: {
    async fetchTodos({ set }: EffectHelpers<TodoState>) {
      set((s) => { s.loading = true; s.error = null; });
      try {
        const res = await fetch('/api/todos');
        const data = await res.json();
        set((s) => { s.items = data; s.loading = false; });
      } catch (e: any) {
        set((s) => { s.error = e.message; s.loading = false; });
      }
    },
  },
});

// Call from a component or anywhere
useTodos.effects.fetchTodos();
```

---

### Computed

Derived values that auto-recalculate when dependencies change. Uses **Proxy-based dependency tracking** — each computed function is only recomputed when the specific state keys it reads have actually changed.

```ts
const useTodos = create({
  state: {
    items: [] as Todo[],
    filter: 'all' as 'all' | 'active' | 'completed',
  },
  computed: {
    activeCount: (state) => state.items.filter(t => !t.done).length,
    completedCount: (state) => state.items.filter(t => t.done).length,
    filtered: (state) => {
      if (state.filter === 'all') return state.items;
      if (state.filter === 'active') return state.items.filter(t => !t.done);
      return state.items.filter(t => t.done);
    },
  },
});

// Use like regular state
const count = useTodos((s) => s.activeCount);
const visible = useTodos((s) => s.filtered);
```

**Computed chaining** — computed values can reference other computed values:

```ts
const useStore = create({
  state: { price: 100, taxRate: 0.1 },
  computed: {
    tax: (state) => state.price * state.taxRate,
    total: (state) => state.price + state.tax, // uses computed "tax"
  },
});

useStore.getState().total; // 110
```

> **Note:** If a computed key has the same name as a state key, a warning is logged. The computed value will take priority in the exposed state.

---

### Queries

Data fetching with automatic caching, loading/error states, and deduplication.

```ts
const useStore = create({
  state: { selectedId: null as number | null },
  queries: {
    users: {
      fn: async () => {
        const res = await fetch('/api/users');
        return res.json() as Promise<User[]>;
      },
      staleTime: 30_000,
    },
    userById: {
      fn: async (id: number) => {
        const res = await fetch(`/api/users/${id}`);
        return res.json() as Promise<User>;
      },
      staleTime: 10_000,
      maxCacheSize: 100,
    },
  },
});
```

Use in components — each query is a React hook:

```tsx
function UserList() {
  const { data, loading, error, refetch } = useStore.queries.users();

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <ul>
      {data?.map(u => <li key={u.id}>{u.name}</li>)}
      <button onClick={refetch}>Refresh</button>
    </ul>
  );
}

// Per-args query — each id gets its own cache entry
function UserDetail({ id }: { id: number }) {
  const { data, loading } = useStore.queries.userById(id);
  // ...
}
```

**Query config options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `fn` | `(...args) => Promise<T>` | — | Fetch function (required) |
| `staleTime` | `number` | `0` | Milliseconds before data is considered stale |
| `refetchInterval` | `number` | — | Auto-refetch interval in milliseconds |
| `maxCacheSize` | `number` | `50` | Max cache entries before LRU eviction |

**Query result:**

| Field | Type | Description |
|---|---|---|
| `data` | `T \| undefined` | Fetched data |
| `loading` | `boolean` | `true` while fetching |
| `error` | `Error \| null` | Error from last fetch |
| `refetch` | `() => void` | Force refetch (ignores staleTime) |

**Built-in behaviors:**
- Auto-fetches on mount and when args change
- Per-args caching — each unique argument set gets its own cache entry
- Request deduplication — concurrent mounts with same args trigger only one fetch
- Race condition safety — only the latest request is applied
- LRU eviction — entries with no active listeners are evicted when cache exceeds `maxCacheSize`

---

### Prefetching & Cache Control

Imperative methods attached to each query hook. Work outside React.

```ts
// Prefetch — populate cache before components mount
useStore.queries.users.prefetch();
useStore.queries.userById.prefetch(5);

// Invalidate — mark stale, next mount will refetch
useStore.queries.users.invalidate();       // specific args
useStore.queries.users.invalidateAll();    // all cached entries

// Read cache
const users = useStore.queries.users.getQueryData([]);

// Write cache (value or updater function)
useStore.queries.users.setQueryData([], (prev) =>
  prev?.map(u => u.id === 1 ? { ...u, name: 'Updated' } : u)
);
```

---

### Optimistic Updates

Apply instant UI updates and automatically rollback if the mutation fails.

```ts
await useStore.queries.users.optimisticUpdate({
  args: [],                                          // query args to update
  updater: (prev) => [...(prev ?? []), newUser],     // apply optimistic data
  mutationFn: () => fetch('/api/users', {            // actual API call
    method: 'POST',
    body: JSON.stringify(newUser),
  }),
  onSuccess: (result) => { /* mutation succeeded */ },
  onError: (error, previousData) => { /* rolled back to previousData */ },
  onSettled: () => { /* always runs */ },
});
```

If `mutationFn` throws, the cache is automatically rolled back to the previous data.

---

### Mutations

Write operations with per-component-instance state and lifecycle callbacks.

```ts
const useStore = create({
  state: { ... },
  queries: {
    todos: { fn: async () => fetchTodos() },
  },
  mutations: {
    addTodo: {
      fn: async (text: string) => {
        const res = await fetch('/api/todos', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        return res.json() as Promise<Todo>;
      },
      onSuccess: (data) => {
        useStore.queries.todos.invalidateAll(); // refetch after mutation
      },
      onError: (error) => { console.error(error); },
      onSettled: (data, error) => { /* always runs */ },
    },
  },
});
```

Use in components — each mutation returns independent per-instance state:

```tsx
function AddTodo() {
  const { mutate, mutateAsync, data, loading, error, reset } = useStore.mutations.addTodo();

  return (
    <div>
      <button onClick={() => mutate('New todo')} disabled={loading}>
        {loading ? 'Adding...' : 'Add Todo'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {data && <p>Created: {data.text}</p>}
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

**Mutation config:**

| Option | Type | Description |
|---|---|---|
| `fn` | `(...args) => Promise<T>` | Mutation function (required) |
| `onSuccess` | `(data: T) => void` | Called on success |
| `onError` | `(error: Error) => void` | Called on failure |
| `onSettled` | `(data \| undefined, error \| null) => void` | Called after success or failure |

**Mutation result:**

| Field | Type | Description |
|---|---|---|
| `mutate` | `(...args) => void` | Fire and forget (errors stored in state) |
| `mutateAsync` | `(...args) => Promise<T>` | Returns a Promise |
| `data` | `T \| undefined` | Last successful result |
| `loading` | `boolean` | `true` while running |
| `error` | `Error \| null` | Error from last run |
| `reset` | `() => void` | Clear data/error/loading |

---

### Infinite Queries

Cursor-based pagination that accumulates pages automatically.

```ts
const useStore = create({
  queries: {
    feed: {
      fn: async (cursor?: string) => {
        const res = await fetch(`/api/feed?cursor=${cursor ?? ''}`);
        return res.json() as Promise<{
          items: Post[];
          nextCursor: string | null;
        }>;
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      infinite: true as const,
      staleTime: 30_000,
    },
  },
});
```

Use in components:

```tsx
function Feed() {
  const {
    data,                  // { pages: Page[], pageParams: unknown[] }
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useStore.queries.feed();

  const allItems = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <div>
      {loading && !data && <p>Loading...</p>}
      {allItems.map(item => <div key={item.id}>{item.title}</div>)}
      {hasNextPage && (
        <button onClick={fetchNextPage} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

**Infinite query config** (extends regular query config):

| Option | Type | Description |
|---|---|---|
| `infinite` | `true` | Marks this as an infinite query (required) |
| `getNextPageParam` | `(lastPage, allPages) => unknown \| null` | Return next cursor, or null/undefined to stop (required) |
| `getPreviousPageParam` | `(firstPage, allPages) => unknown \| null` | Return previous cursor for bidirectional pagination (optional) |

**Infinite query result:**

| Field | Type | Description |
|---|---|---|
| `data` | `InfiniteData<T> \| undefined` | `{ pages: T[], pageParams: unknown[] }` |
| `loading` | `boolean` | `true` during initial fetch |
| `error` | `Error \| null` | Error from last fetch |
| `fetchNextPage` | `() => void` | Fetch and append next page |
| `fetchPreviousPage` | `() => void` | Fetch and prepend previous page |
| `hasNextPage` | `boolean` | `true` if `getNextPageParam` returns non-null |
| `hasPreviousPage` | `boolean` | `true` if `getPreviousPageParam` returns non-null |
| `isFetchingNextPage` | `boolean` | Loading state for next page |
| `isFetchingPreviousPage` | `boolean` | Loading state for previous page |
| `refetch` | `() => void` | Re-fetches first page only |

Infinite queries also support `prefetch`, `invalidate`, `invalidateAll`, `setQueryData`, and `getQueryData`.

---

### Persist

Save and restore state to storage automatically. Persists after every state change and hydrates on initialization.

```ts
const useSettings = create({
  state: {
    theme: 'light' as 'light' | 'dark',
    fontSize: 14,
    sidebarOpen: true,
  },
  actions: {
    setTheme(state, theme: 'light' | 'dark') { state.theme = theme; },
    setFontSize(state, size: number) { state.fontSize = size; },
  },
  persist: {
    name: 'app-settings',
  },
});
```

**Persist config:**

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Storage key (required) |
| `storage` | `StateStorage` | `localStorage` | Custom storage (`getItem`, `setItem`, `removeItem`) |
| `partialize` | `(state) => Partial<S>` | identity | Select which keys to persist |
| `version` | `number` | `0` | Schema version for migrations |
| `migrate` | `(persisted, version) => S` | — | Migration function when version differs |
| `merge` | `(persisted, current) => S` | shallow merge | Custom merge strategy on hydration |
| `onRehydrationFinished` | `(state) => void` | — | Callback after hydration completes |

**Advanced example:**

```ts
const useStore = create({
  state: { items: [] as Todo[], filter: 'all', secret: 'hidden' },
  persist: {
    name: 'todo-store',
    partialize: (state) => ({ items: state.items, filter: state.filter }), // skip secret
    version: 2,
    migrate: (persisted, version) => {
      if (version < 2) return { ...persisted, filter: persisted.filter ?? 'all' };
      return persisted;
    },
    storage: sessionStorage,
  },
});
```

SSR-safe — uses a no-op storage when `window` is undefined.

---

### Subscribe with Selector

The `subscribe` method supports both simple listeners and selector-based subscriptions.

```ts
// Simple — fires on every state change
const unsub = useStore.subscribe(() => {
  console.log('State changed:', useStore.getState());
});

// Selector — fires only when the selected value changes
useStore.subscribe(
  (state) => state.count,
  (current, previous) => {
    console.log(`count: ${previous} -> ${current}`);
  },
);

// Custom equality — useful for object/array selectors
useStore.subscribe(
  (state) => ({ a: state.a, b: state.b }),
  (current, previous) => { /* fires when a or b changes */ },
  { equalityFn: (a, b) => a.a === b.a && a.b === b.b },
);

// Fire immediately with current value
useStore.subscribe(
  (state) => state.count,
  (current) => { console.log('Current:', current); },
  { fireImmediately: true },
);
```

All variants return an `unsubscribe` function.

---

### Using Outside React

```ts
// Read state (includes computed)
const { items, activeCount } = useTodos.getState();

// Update state — Immer draft, partial object, or full replacement
useTodos.setState((s) => { s.loading = true; });
useTodos.setState({ loading: false });

// Subscribe
const unsub = useTodos.subscribe(() => {
  console.log(useTodos.getState());
});
unsub();

// Call actions/effects directly
useTodos.actions.add('New item');
useTodos.effects.fetchTodos();
```

---

### Multiple Stores

Create as many independent stores as you need.

```ts
const useAuth = create({
  state: { user: null as User | null, token: '' },
  effects: {
    async login({ set }, email: string, password: string) {
      const { user, token } = await api.login(email, password);
      set((s) => { s.user = user; s.token = token; });
    },
  },
  persist: { name: 'auth', partialize: (s) => ({ token: s.token }) },
});

const useCart = create({
  state: { items: [] as CartItem[] },
  actions: {
    addItem(state, item: CartItem) { state.items.push(item); },
    clear(state) { state.items = []; },
  },
  computed: {
    total: (state) => state.items.reduce((sum, i) => sum + i.price, 0),
  },
  persist: { name: 'cart' },
});
```

---

## Standalone Hooks

For advanced use cases, you can create query/mutation/infinite-query hooks independently:

```ts
import { createQueryHook, createMutationHook, createInfiniteQueryHook } from 'zustand-immer-lite';

const useUsers = createQueryHook({
  fn: async () => fetch('/api/users').then(r => r.json()),
  staleTime: 30_000,
});

const useCreateUser = createMutationHook({
  fn: async (name: string) => fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then(r => r.json()),
  onSuccess: () => { useUsers.invalidateAll(); },
});

const useFeed = createInfiniteQueryHook({
  fn: async (cursor?: string) => fetchFeed(cursor),
  getNextPageParam: (page) => page.nextCursor,
  infinite: true,
});
```

---

## Comparison

| Feature | zustand-immer-lite | Redux Toolkit | Zustand | TanStack Query |
|---|---|---|---|---|
| Bundle size | ~3KB | ~40KB | ~2KB | ~40KB |
| Provider required | No | Yes | No | Yes |
| Immer built-in | Yes | Yes | No | — |
| Computed (dep tracking) | Yes | No | No | — |
| Async effects | Built-in | createAsyncThunk | Manual | — |
| Query caching (LRU) | Built-in | — | — | Built-in |
| Infinite queries | Built-in | — | — | Built-in |
| Mutations | Built-in | Manual | Manual | Built-in |
| Optimistic updates | Built-in | Manual | Manual | Built-in |
| Prefetching | Built-in | — | — | Built-in |
| Persist | Built-in | Manual | Middleware | — |
| Subscribe w/ selector | Built-in | — | Middleware | — |
| Race condition handling | Yes | — | — | Yes |
| Request deduplication | Yes | — | — | Yes |

---

## Exports

```ts
// Core
export { create } from 'zustand-immer-lite';

// Standalone hook factories
export { createQueryHook } from 'zustand-immer-lite';
export { createMutationHook } from 'zustand-immer-lite';
export { createInfiniteQueryHook } from 'zustand-immer-lite';

// No-op identity (Immer is already built-in)
export { immer } from 'zustand-immer-lite';

// Types
export type {
  SetState, EffectHelpers, UseStore,
  QueryConfig, QueryResult, QueryHookMethods, QueryHook,
  MutationConfig, MutationResult, InferMutations,
  InfiniteData, InfiniteQueryConfig, InfiniteQueryResult,
  InfiniteQueryHookMethods, InfiniteQueryHook,
  StateStorage, PersistConfig, SubscribeWithSelector,
} from 'zustand-immer-lite';
```

## License

MIT
