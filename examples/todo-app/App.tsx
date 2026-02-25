import React, { useState, useEffect } from 'react';
import { useTodos } from './store';

type Filter = 'all' | 'active' | 'completed';

function TodoInput() {
  const [text, setText] = useState('');
  const { mutate, loading } = useTodos.mutations.saveTodo();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      mutate(trimmed); // mutation: saves to API, then adds to state via onSuccess
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs to be done?"
        disabled={loading}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Add'}
      </button>
    </form>
  );
}

function TodoItem({ id, text, completed }: { id: number; text: string; completed: boolean }) {
  const { toggle, remove } = useTodos.actions;

  return (
    <li style={{ textDecoration: completed ? 'line-through' : 'none' }}>
      <input type="checkbox" checked={completed} onChange={() => toggle(id)} />
      <span>{text}</span>
      <button onClick={() => remove(id)}>x</button>
    </li>
  );
}

function TodoList() {
  const filtered = useTodos((s) => s.filtered);
  const loading = useTodos((s) => s.loading);
  const error = useTodos((s) => s.error);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (filtered.length === 0) return <p>No todos.</p>;

  return (
    <ul>
      {filtered.map((todo) => (
        <TodoItem key={todo.id} {...todo} />
      ))}
    </ul>
  );
}

function FilterButtons() {
  const current = useTodos((s) => s.filter);
  const { setFilter } = useTodos.actions;
  const filters: Filter[] = ['all', 'active', 'completed'];

  return (
    <div className="filter-bar">
      {filters.map((f) => (
        <button key={f} onClick={() => setFilter(f)} className={current === f ? 'active' : ''}>
          {f}
        </button>
      ))}
    </div>
  );
}

function Footer() {
  const activeCount = useTodos((s) => s.activeCount);
  const completedCount = useTodos((s) => s.completedCount);
  const { clearCompleted } = useTodos.actions;

  return (
    <div className="footer">
      <span>{activeCount} item{activeCount !== 1 ? 's' : ''} left</span>
      {completedCount > 0 && (
        <button onClick={clearCompleted}>Clear completed ({completedCount})</button>
      )}
    </div>
  );
}

function TodoApp() {
  const { fetchTodos } = useTodos.effects;

  useEffect(() => {
    fetchTodos();
  }, []);

  return (
    <div>
      <h2>Todo App (with mutations, persist, computed)</h2>
      <TodoInput />
      <FilterButtons />
      <TodoList />
      <Footer />
    </div>
  );
}

export default TodoApp;
