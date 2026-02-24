import React from 'react';
import { useUsers } from './store';

function UserList() {
  const { data: users, loading, error, refetch } = useUsers.queries.allUsers();
  const { select } = useUsers.actions;

  return (
    <div>
      <h3>Users {loading && '(loading...)'}</h3>
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      <ul>
        {users?.map((u) => (
          <li key={u.id}>
            <button onClick={() => select(u.id)}>{u.name}</button>
            <span style={{ color: '#888', marginLeft: 8 }}>{u.email}</span>
          </li>
        ))}
      </ul>
      <button onClick={refetch}>Refetch</button>
    </div>
  );
}

function UserDetail() {
  const selectedId = useUsers((s) => s.selectedId);

  if (!selectedId) return <p>Select a user to see details.</p>;

  return <UserDetailInner id={selectedId} />;
}

function UserDetailInner({ id }: { id: number }) {
  const { data: user, loading, error } = useUsers.queries.userById(id);

  if (loading) return <p>Loading user...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error.message}</p>;
  if (!user) return null;

  return (
    <div style={{ border: '1px solid #ccc', padding: '12px', borderRadius: 8 }}>
      <h3>{user.name}</h3>
      <p>ID: {user.id}</p>
      <p>Email: {user.email}</p>
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
