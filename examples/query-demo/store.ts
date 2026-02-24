import { create } from '../../src';

interface User {
  id: number;
  name: string;
  email: string;
}

// Fake API
const fakeUsers: User[] = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' },
];

export const useUsers = create({
  state: { selectedId: null as number | null },
  actions: {
    select(state, id: number | null) { state.selectedId = id; },
  },
  queries: {
    allUsers: {
      fn: async () => {
        // Simulate network delay
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
  },
});
