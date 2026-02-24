# zustand-immer-lite

Zustand-like state management for React with built-in Immer and async support.

- **~3KB** gzipped, zero config
- **No Provider** — just `create()` and use
- **Immer built-in** — mutate state directly in actions
- **Async effects** — call APIs with `set`/`get` helpers
- **Computed state** — derived values with Proxy-based dependency tracking
- **Queries** — TanStack Query-like data fetching with caching & race condition handling
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
| `useStore.getState()` | Read state outside React |
| `useStore.setState(updater)` | Update state outside React |
| `useStore.subscribe(listener)` | Subscribe to state changes |

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
  actions: {
    add(state, text: string) {
      state.items.push({ id: Date.now(), text, done: false });
    },
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
    async deleteTodo({ set, get }, id: number) {
      await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      set((s) => {
        s.items = s.items.filter((t) => t.id !== id);
      });
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
  actions: {
    add(state, text: string) {
      state.items.push({ id: Date.now(), text, done: false });
    },
    setFilter(state, filter: string) {
      state.filter = filter;
    },
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

// In components — computed values work like regular state
const count = useTodos((s) => s.activeCount);      // number
const visible = useTodos((s) => s.filtered);        // Todo[]

// Outside React
const { activeCount, filtered } = useTodos.getState();
```

Computed features:
- **Dependency tracking** — uses `Proxy` to detect which state keys each computed reads. Only recomputes when those keys change, not on every state mutation
- **Computed chaining** — computed values can reference other computed values (order matters: declared first = available to later ones)
- **Key collision warning** — warns in console if a computed key has the same name as a state key

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
  actions: {
    select(state, id: number) { state.selectedId = id; },
  },
  queries: {
    users: {
      fn: async () => {
        const res = await fetch('/api/users');
        return res.json() as Promise<User[]>;
      },
      staleTime: 30_000,        // cache for 30s (optional, default 0)
      refetchInterval: 60_000,  // auto-refetch every 60s (optional)
      maxCacheSize: 100,        // max cache entries (optional, default 50)
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

// Queries with parameters — auto-cached per args
function UserDetail({ id }: { id: number }) {
  const { data: user, loading } = useStore.queries.userById(id);

  if (loading) return <p>Loading...</p>;
  return <h2>{user?.name}</h2>;
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
- **LRU cache eviction** — old entries with no active listeners are evicted when `maxCacheSize` is exceeded (default 50)

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
unsub(); // unsubscribe
```

### Multiple Stores

Create as many stores as you need. Each is independent.

```ts
const useAuth = create({
  state: { user: null as User | null, token: '' },
  actions: {
    setUser(state, user: User) { state.user = user; },
    logout(state) { state.user = null; state.token = ''; },
  },
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
});

const useCart = create({
  state: { items: [] as CartItem[] },
  actions: {
    addItem(state, item: CartItem) { state.items.push(item); },
    removeItem(state, id: string) {
      state.items = state.items.filter((i) => i.id !== id);
    },
  },
  computed: {
    total: (state) => state.items.reduce((sum, i) => sum + i.price, 0),
    count: (state) => state.items.length,
  },
});
```

## TypeScript

Type inference works automatically for simple state:

```ts
const useCounter = create({
  state: { count: 0 },
  actions: {
    increment(state) { state.count += 1; },      // state is auto-typed
    addBy(state, n: number) { state.count += n; }, // n is typed
  },
  computed: {
    doubled: (state) => state.count * 2,  // return type inferred as number
  },
});

const count = useCounter((s) => s.count);    // number
const doubled = useCounter((s) => s.doubled); // number
```

For complex state with arrays/objects, annotate the `state` param with `Draft<YourState>`:

```ts
import type { Draft } from 'immer';
import { create, type EffectHelpers } from 'zustand-immer-lite';

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
  effects: {
    async fetch({ set }: EffectHelpers<TodoState>) {
      set((s) => { s.loading = true; });
      // ...
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
| Race condition handling | Yes | - | - | Yes |
| Boilerplate | Minimal | Medium | Minimal | Minimal |

## License

MIT
