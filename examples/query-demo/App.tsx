import React from 'react';
import { useApp } from './store';

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

export default function QueryDemo() {
  return (
    <div>
      <h2>Query Demo</h2>
      <UserList />
      <UserDetail />
    </div>
  );
}
