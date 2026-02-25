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

export interface FeedPage {
  items: Post[];
  nextCursor: string | null;
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
  { id: 5, userId: 1, title: 'Infinite queries deep dive' },
  { id: 6, userId: 2, title: 'Optimistic updates guide' },
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
    // Regular query with prefetch support
    allUsers: {
      fn: async () => {
        await new Promise((r) => setTimeout(r, 800));
        return fakeUsers;
      },
      staleTime: 30_000,
    },
    // Per-args query
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
    // Infinite query — paginated feed
    feed: {
      fn: async (cursor?: string) => {
        await new Promise((r) => setTimeout(r, 600));
        const pageSize = 2;
        const startIndex = cursor ? parseInt(cursor, 10) : 0;
        const items = fakePosts.slice(startIndex, startIndex + pageSize);
        const nextIndex = startIndex + pageSize;
        return {
          items,
          nextCursor: nextIndex < fakePosts.length ? String(nextIndex) : null,
        } as FeedPage;
      },
      getNextPageParam: (lastPage: FeedPage) => lastPage.nextCursor,
      infinite: true as const,
      staleTime: 30_000,
    },
  },
  mutations: {
    // Mutation to rename a user
    renameUser: {
      fn: async (id: number, newName: string) => {
        await new Promise((r) => setTimeout(r, 300));
        const user = fakeUsers.find((u) => u.id === id);
        if (user) user.name = newName; // mutate fake data
        return { id, name: newName };
      },
      onSuccess: () => {
        // Invalidate queries so they refetch with new data
        (useApp.queries.allUsers as any).invalidateAll();
      },
    },
  },
});

// Prefetch users on module load — data is ready before components mount
(useApp.queries.allUsers as any).prefetch();
