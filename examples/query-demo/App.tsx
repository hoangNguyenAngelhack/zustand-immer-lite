import React, { useState } from 'react';
import { useApp, type FeedPage } from './store';

function UserList() {
  const { data: users, loading, error, refetch } = useApp.queries.allUsers();
  const { selectUser } = useApp.actions;
  const selectedId = useApp((s) => s.selectedUserId);

  return (
    <div>
      <h3>Users {loading && '(loading...)'}</h3>
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      <ul>
        {users?.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => selectUser(u.id)}
              style={{
                background: selectedId === u.id ? '#333' : 'white',
                color: selectedId === u.id ? 'white' : '#333',
              }}
            >
              {u.name}
            </button>
            <span style={{ color: '#888', marginLeft: 8 }}>{u.email}</span>
          </li>
        ))}
      </ul>
      <button onClick={refetch}>Refetch Users</button>
    </div>
  );
}

function OptimisticRename() {
  const [name, setName] = useState('');
  const selectedId = useApp((s) => s.selectedUserId);

  const handleRename = async () => {
    if (!selectedId || !name.trim()) return;

    // Optimistic update — UI updates instantly, rolls back on failure
    await (useApp.queries.allUsers as any).optimisticUpdate({
      args: [],
      updater: (prev: any[]) =>
        prev?.map((u: any) => u.id === selectedId ? { ...u, name: name.trim() } : u),
      mutationFn: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { id: selectedId, name: name.trim() };
      },
    });
    setName('');
  };

  if (!selectedId) return null;

  return (
    <div style={{ margin: '8px 0' }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New name (optimistic)"
      />
      <button onClick={handleRename}>Rename</button>
    </div>
  );
}

function RenameWithMutation() {
  const [name, setName] = useState('');
  const selectedId = useApp((s) => s.selectedUserId);
  const { mutate, loading } = useApp.mutations.renameUser();

  const handleRename = () => {
    if (!selectedId || !name.trim()) return;
    mutate(selectedId, name.trim());
    setName('');
  };

  if (!selectedId) return null;

  return (
    <div style={{ margin: '8px 0' }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New name (mutation)"
      />
      <button onClick={handleRename} disabled={loading}>
        {loading ? 'Saving...' : 'Rename (mutation)'}
      </button>
    </div>
  );
}

function UserDetail() {
  const hasSelection = useApp((s) => s.hasSelection);
  const selectedId = useApp((s) => s.selectedUserId);

  if (!hasSelection) return <p style={{ color: '#888' }}>Select a user to see details.</p>;

  return <UserDetailInner id={selectedId!} />;
}

function UserDetailInner({ id }: { id: number }) {
  const { data: user, loading: userLoading, error: userError } = useApp.queries.userById(id);
  const { data: posts, loading: postsLoading } = useApp.queries.postsByUser(id);

  if (userLoading) return <p>Loading user...</p>;
  if (userError) return <p style={{ color: 'red' }}>Error: {userError.message}</p>;
  if (!user) return null;

  return (
    <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: 8, marginTop: 12 }}>
      <h3>{user.name}</h3>
      <p style={{ color: '#888' }}>ID: {user.id} | Email: {user.email}</p>
      <h4 style={{ marginTop: 12 }}>Posts {postsLoading && '(loading...)'}</h4>
      {posts && posts.length > 0 ? (
        <ul>
          {posts.map((p) => (
            <li key={p.id} style={{ borderBottom: 'none', padding: '0.3rem 0' }}>
              {p.title}
            </li>
          ))}
        </ul>
      ) : (
        !postsLoading && <p style={{ color: '#888' }}>No posts.</p>
      )}
    </div>
  );
}

function InfiniteFeed() {
  const result = (useApp.queries.feed as any)();
  const {
    data,
    loading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = result;

  const allItems = data?.pages.flatMap((p: FeedPage) => p.items) ?? [];

  return (
    <div style={{ marginTop: 24 }}>
      <h3>Infinite Feed</h3>
      {loading && <p>Loading first page...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      <ul>
        {allItems.map((item: any) => (
          <li key={item.id} style={{ padding: '4px 0' }}>
            {item.title}
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <button onClick={fetchNextPage} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}
      {!hasNextPage && allItems.length > 0 && (
        <p style={{ color: '#888' }}>No more items.</p>
      )}
    </div>
  );
}

export default function QueryDemo() {
  return (
    <div>
      <h2>Query Demo</h2>
      <UserList />
      <OptimisticRename />
      <RenameWithMutation />
      <UserDetail />
      <InfiniteFeed />
    </div>
  );
}
