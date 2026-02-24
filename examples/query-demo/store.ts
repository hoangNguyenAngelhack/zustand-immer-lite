import { create } from '../../src';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
}

// Fake API data
const fakeUsers: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' },
];

const fakePosts: Post[] = [
  { id: 1, userId: 1, title: 'Getting started with zustand-immer-lite' },
  { id: 2, userId: 1, title: 'Advanced computed patterns' },
  { id: 3, userId: 2, title: 'Query caching explained' },
  { id: 4, userId: 3, title: 'Building a dashboard' },
];

export const useApp = create({
  state: { selectedUserId: null as number | null },
  actions: {
    selectUser(state, id: number | null) { state.selectedUserId = id; },
  },
  computed: {
    hasSelection: (state) => state.selectedUserId !== null,
  },
  queries: {
    allUsers: {
      fn: async () => {
        await new Promise((r) => setTimeout(r, 800));
        return fakeUsers;
      },
      staleTime: 30_000,
    },
    userById: {
      fn: async (id: number) => {
        await new Promise((r) => setTimeout(r, 500));
        const user = fakeUsers.find((u) => u.id === id);
        if (!user) throw new Error(`User ${id} not found`);
        return user;
      },
      staleTime: 10_000,
    },
    postsByUser: {
      fn: async (userId: number) => {
        await new Promise((r) => setTimeout(r, 400));
        return fakePosts.filter((p) => p.userId === userId);
      },
      staleTime: 15_000,
      maxCacheSize: 10,
    },
  },
});
