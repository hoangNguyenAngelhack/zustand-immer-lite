import { create, type EffectHelpers } from '../../src';
import type { Draft } from 'immer';

export interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

type TodoState = {
  items: Todo[];
  loading: boolean;
  error: string | null;
  filter: 'all' | 'active' | 'completed';
};

let nextId = 100;

export const useTodos = create({
  state: {
    items: [] as Todo[],
    loading: false,
    error: null as string | null,
    filter: 'all' as 'all' | 'active' | 'completed',
  },
  actions: {
    toggle(state: Draft<TodoState>, id: number) {
      const todo = state.items.find((t) => t.id === id);
      if (todo) todo.completed = !todo.completed;
    },
    remove(state: Draft<TodoState>, id: number) {
      state.items = state.items.filter((t) => t.id !== id);
    },
    clearCompleted(state: Draft<TodoState>) {
      state.items = state.items.filter((t) => !t.completed);
    },
    setFilter(state: Draft<TodoState>, filter: 'all' | 'active' | 'completed') {
      state.filter = filter;
    },
  },
  computed: {
    activeCount: (state) => state.items.filter((t: Todo) => !t.completed).length,
    completedCount: (state) => state.items.filter((t: Todo) => t.completed).length,
    filtered: (state) => {
      if (state.filter === 'all') return state.items;
      if (state.filter === 'active') return state.items.filter((t: Todo) => !t.completed);
      return state.items.filter((t: Todo) => t.completed);
    },
  },
  effects: {
    async fetchTodos({ set }: EffectHelpers<TodoState>) {
      set((s) => { s.loading = true; s.error = null; });
      try {
        await new Promise((r) => setTimeout(r, 500));
        const data: Todo[] = [
          { id: 1, text: 'Learn zustand-immer-lite', completed: true },
          { id: 2, text: 'Build an app', completed: false },
          { id: 3, text: 'Ship it!', completed: false },
        ];
        set((s) => { s.items = data; s.loading = false; });
      } catch (e: any) {
        set((s) => { s.error = e.message; s.loading = false; });
      }
    },
  },
  mutations: {
    saveTodo: {
      fn: async (text: string) => {
        await new Promise((r) => setTimeout(r, 300));
        return { id: nextId++, text, completed: false } as Todo;
      },
      onSuccess: (todo: Todo) => {
        useTodos.setState((s) => { s.items.push(todo); });
      },
    },
  },
  persist: {
    name: 'todo-store',
    partialize: (state) => ({ items: state.items, filter: state.filter }),
  },
});

// Subscribe with selector — log filter changes
useTodos.subscribe(
  (state) => state.filter,
  (current, previous) => {
    console.log(`[todos] filter: ${previous} → ${current}`);
  },
);
