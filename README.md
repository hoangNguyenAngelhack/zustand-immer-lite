# zustand-immer-lite

Zustand-like state management for React with built-in Immer and async support.

- **~3KB** gzipped, zero config
- **No Provider** — just `create()` and use
- **Immer built-in** — mutate state directly in actions
- **Async effects** — call APIs with `set`/`get` helpers
- **Computed state** — derived values with Proxy-based dependency tracking
- **Queries** — TanStack Query-like data fetching with caching & race condition handling
- **Infinite queries** — paginated/cursor-based fetching with `fetchNextPage`/`fetchPreviousPage`
- **Mutations** — write operations with `onSuccess`/`onError`/`onSettled` callbacks
- **Optimistic updates** — instant UI updates with automatic rollback on failure
- **Prefetching** — populate cache before components mount
- **Persist** — save/restore state to localStorage or custom storage
- **Subscribe with selector** — listen to specific state slices with equality checks
- **TypeScript-first** — full type inference

## Install

```bash
npm install zustand-immer-lite
```

Peer dependencies: `react >= 18`

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
});

function Counter() {
  const count = useCounter((s) => s.count);
  const { increment, addBy } = useCounter.actions;

  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+1</button>
      <button onClick={() => addBy(10)}>+10</button>
    </div>
  );
}
```

No `<Provider>`, no `useDispatch`, no action types.

## API

### `create(config)`

Creates a store hook.

```ts
const useStore = create({
  state: { ... },       // initial state
  actions: { ... },     // sync actions (optional)
  effects: { ... },     // async effects (optional)
  computed: { ... },    // derived state (optional)
  queries: { ... },     // data fetching (optional)
  mutations: { ... },   // write operations (optional)
  persist: { ... },     // state persistence (optional)
});
```

**Returns** a hook with attached properties:

| Property | Description |
|---|---|
| `useStore()` | Returns full state (including computed) |
| `useStore(selector)` | Returns selected slice of state |
| `useStore.actions` | Bound sync actions |
| `useStore.effects` | Bound async effects |
| `useStore.queries` | Bound query hooks |
| `useStore.mutations` | Bound mutation hooks |
| `useStore.getState()` | Read state outside React |
| `useStore.setState(updater)` | Update state outside React |
| `useStore.subscribe(listener)` | Subscribe to state changes |
| `useStore.subscribe(selector, callback, options?)` | Subscribe to specific state slices |

### Actions

Sync functions that receive an Immer draft. Mutate directly — Immer handles immutability.

```ts
const useStore = create({
  state: { items: [] as string[] },
  actions: {
    add(state, item: string) {
      state.items.push(item);  // mutate directly, Immer makes it immutable
    },
    clear(state) {
      state.items = [];
    },
  },
});

// Call directly — no dispatch needed
useStore.actions.add('hello');
useStore.actions.clear();
```

### Effects

Async functions for API calls. Receive `{ set, get }` helpers.

- `set(updater)` — update state (supports Immer draft, partial object, or full state)
- `get()` — read current state

```ts
const useTodos = create({
  state: {
    items: [] as Todo[],
    loading: false,
    error: null as string | null,
  },
  effects: {
    async fetchTodos({ set }) {
      set((s) => { s.loading = true; });
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
```

### Computed

Derived values that auto-recalculate when dependent state changes. Uses **Proxy-based dependency tracking** — only recomputes when the specific state keys a computed function reads have changed.

```ts
const useTodos = create({
  state: {
    items: [] as Todo[],
    filter: 'all' as 'all' | 'active' | 'completed',
  },
  computed: {
    activeCount: (state) => state.items.filter(t => !t.done).length,
    filtered: (state) => {
      if (state.filter === 'all') return state.items;
      return state.items.filter(t =>
        state.filter === 'active' ? !t.done : t.done
      );
    },
  },
});

// Computed values work like regular state
const count = useTodos((s) => s.activeCount);
const visible = useTodos((s) => s.filtered);
```

Computed chaining — computed values can reference other computed values:

```ts
const useStore = create({
  state: { price: 100, taxRate: 0.1 },
  computed: {
    tax: (state) => state.price * state.taxRate,
    total: (state) => state.price + state.tax, // references computed "tax"
  },
});

useStore.getState().total; // 110
```

### Queries

TanStack Query-like data fetching with auto loading/error/data management.

```ts
const useStore = create({
  state: { selectedId: null as number | null },
  queries: {
    users: {
      fn: async () => {
        const res = await fetch('/api/users');
        return res.json() as Promise<User[]>;
      },
      staleTime: 30_000,        // cache for 30s (default 0)
      refetchInterval: 60_000,  // auto-refetch every 60s
      maxCacheSize: 100,        // max cache entries (default 50)
    },
    userById: {
      fn: async (id: number) => {
        const res = await fetch(`/api/users/${id}`);
        return res.json() as Promise<User>;
      },
      staleTime: 10_000,
    },
  },
});
```

Use queries as hooks in components:

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
```

Query features:
- **Auto-fetch** on mount
- **Per-args caching** — each unique argument set gets its own cache
- **`staleTime`** — skip refetch if data is still fresh
- **`refetchInterval`** — auto-refetch on interval
- **`refetch()`** — manually trigger refetch (always bypasses staleTime)
- **Race condition handling** — if multiple requests are in-flight, only the latest one is applied
- **Request deduplication** — concurrent mounts with the same args only trigger one fetch
- **LRU cache eviction** — old entries with no active listeners are evicted when `maxCacheSize` is exceeded

#### Prefetching

Populate cache before components mount:

```ts
// Prefetch outside React (e.g., on route change, hover)
useStore.queries.users.prefetch();
useStore.queries.userById.prefetch(5);

// When the component mounts, data is already available — no loading state
```

#### Cache Manipulation

Read and write query cache directly:

```ts
// Read cache
const users = useStore.queries.users.getQueryData([]);

// Write cache (value or updater function)
useStore.queries.users.setQueryData([], (prev) =>
  prev?.map(u => u.id === 1 ? { ...u, name: 'Updated' } : u)
);

// Invalidate — marks cache stale, triggers refetch on next mount
useStore.queries.users.invalidate();         // specific args
useStore.queries.users.invalidateAll();      // all cached entries
```

#### Optimistic Updates

Instant UI updates with automatic rollback on failure:

```ts
await useStore.queries.users.optimisticUpdate({
  args: [],
  updater: (prev) => [...(prev ?? []), newUser],
  mutationFn: () => fetch('/api/users', { method: 'POST', body: JSON.stringify(newUser) }),
  onSuccess: (result) => { console.log('Created:', result); },
  onError: (error, previousData) => { console.error('Rolled back:', error); },
  onSettled: () => { console.log('Done'); },
});
```

### Mutations

Write operations with lifecycle callbacks. Per-component instance state (not shared like queries).

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
        // Invalidate queries to refetch fresh data
        useStore.queries.todos.invalidateAll();
      },
      onError: (error) => { console.error(error); },
      onSettled: (data, error) => { /* always runs */ },
    },
  },
});
```

Use mutations in components:

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

Mutation features:
- **`mutate(...args)`** — fire and forget (errors stored in state)
- **`mutateAsync(...args)`** — returns Promise for await
- **`reset()`** — clear data/error/loading back to initial
- **`onSuccess`/`onError`/`onSettled`** — lifecycle callbacks
- **Per-instance state** — each component using the same mutation gets independent state

### Infinite Queries

Paginated/cursor-based data fetching. Accumulates pages automatically.

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
      infinite: true,
      staleTime: 30_000,
    },
  },
});
```

Use infinite queries in components:

```tsx
function Feed() {
  const {
    data,                    // { pages: Page[], pageParams: unknown[] }
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
      {loading && <p>Loading...</p>}
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

Infinite query features:
- **`fetchNextPage()`** — fetch and append next page
- **`fetchPreviousPage()`** — fetch and prepend previous page
- **`hasNextPage`/`hasPreviousPage`** — derived from `getNextPageParam`/`getPreviousPageParam`
- **`isFetchingNextPage`/`isFetchingPreviousPage`** — loading state per direction
- **`refetch()`** — re-fetches first page only
- Supports `prefetch`, `invalidate`, `setQueryData`, `getQueryData`

### Persist

Save and restore state to storage automatically.

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
    toggleSidebar(state) { state.sidebarOpen = !state.sidebarOpen; },
  },
  persist: {
    name: 'app-settings',  // localStorage key (required)
  },
});
```

Persist options:

| Option | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Storage key (required) |
| `storage` | `StateStorage` | `localStorage` | Custom storage engine |
| `partialize` | `(state) => Partial<S>` | identity | Pick which keys to persist |
| `version` | `number` | `0` | Version number for migrations |
| `migrate` | `(persisted, version) => S` | — | Migration function on version mismatch |
| `merge` | `(persisted, current) => S` | shallow merge | Custom merge strategy |
| `onRehydrationFinished` | `(state) => void` | — | Callback after hydration |

```ts
const useStore = create({
  state: { count: 0, secret: 'hidden' },
  persist: {
    name: 'my-store',
    partialize: (state) => ({ count: state.count }), // only persist count
    version: 2,
    migrate: (persisted, version) => {
      if (version < 2) return { ...persisted, newField: 'default' };
      return persisted;
    },
    storage: sessionStorage, // use sessionStorage instead
  },
});
```

### Subscribe with Selector

Enhanced `subscribe` — listen to specific state slices instead of every change.

```ts
// Original: fires on every state change
useStore.subscribe(() => {
  console.log('Something changed');
});

// With selector: fires only when count changes
useStore.subscribe(
  (state) => state.count,
  (current, previous) => {
    console.log(`count: ${previous} -> ${current}`);
  },
);

// With custom equality function
useStore.subscribe(
  (state) => ({ a: state.a, b: state.b }),
  (current, previous) => { /* only fires when a or b change */ },
  { equalityFn: (a, b) => a.a === b.a && a.b === b.b },
);

// Fire immediately with current value
useStore.subscribe(
  (state) => state.count,
  (current) => { console.log('Current count:', current); },
  { fireImmediately: true },
);
```

### Using Outside React

```ts
// Read state (includes computed)
const { items, activeCount } = useTodos.getState();

// Update state
useTodos.setState((s) => { s.loading = true; });
useTodos.setState({ loading: false });  // partial update

// Subscribe to changes
const unsub = useTodos.subscribe(() => {
  console.log('State changed:', useTodos.getState());
});
unsub();
```

### Multiple Stores

Create as many stores as you need. Each is independent.

```ts
const useAuth = create({
  state: { user: null as User | null, token: '' },
  effects: {
    async login({ set }, email: string, password: string) {
      const res = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const { user, token } = await res.json();
      set((s) => { s.user = user; s.token = token; });
    },
  },
  persist: { name: 'auth', partialize: (s) => ({ token: s.token }) },
});

const useCart = create({
  state: { items: [] as CartItem[] },
  actions: {
    addItem(state, item: CartItem) { state.items.push(item); },
  },
  computed: {
    total: (state) => state.items.reduce((sum, i) => sum + i.price, 0),
  },
  persist: { name: 'cart' },
});
```

## TypeScript

Type inference works automatically for simple state:

```ts
const useCounter = create({
  state: { count: 0 },
  actions: {
    increment(state) { state.count += 1; },
    addBy(state, n: number) { state.count += n; },
  },
  computed: {
    doubled: (state) => state.count * 2,
  },
});

const count = useCounter((s) => s.count);    // number
const doubled = useCounter((s) => s.doubled); // number
```

For complex state with arrays/objects, annotate the `state` param with `Draft<YourState>`:

```ts
import type { Draft } from 'immer';

interface TodoState {
  items: Todo[];
  loading: boolean;
}

const useTodos = create({
  state: { items: [] as Todo[], loading: false },
  actions: {
    add(state: Draft<TodoState>, text: string) {
      state.items.push({ id: Date.now(), text, done: false });
    },
  },
});
```

## Comparison

| Feature | zustand-immer-lite | Redux Toolkit | Zustand | TanStack Query |
|---|---|---|---|---|
| Bundle size | ~3KB | ~40KB | ~2KB | ~40KB |
| Provider required | No | Yes | No | Yes |
| Immer built-in | Yes | Yes | No | - |
| Async support | Built-in effects | createAsyncThunk | Manual | Built-in |
| Computed state | Built-in (dep tracking) | Manual selectors | Manual | - |
| Query caching | Built-in (LRU) | - | - | Built-in |
| Infinite queries | Built-in | - | - | Built-in |
| Mutations | Built-in | Manual | Manual | Built-in |
| Optimistic updates | Built-in | Manual | Manual | Built-in |
| Prefetching | Built-in | - | - | Built-in |
| Persist | Built-in | Manual | Middleware | - |
| Subscribe selector | Built-in | - | Middleware | - |
| Race condition handling | Yes | - | - | Yes |
| Boilerplate | Minimal | Medium | Minimal | Minimal |

## License

MIT
