import React from 'react';
import ReactDOM from 'react-dom/client';
import CounterApp from './counter/App';
import TodoApp from './todo-app/App';
import QueryDemo from './query-demo/App';

function Root() {
  return (
    <div className="app-container">
      <h1>redux-simple examples</h1>
      <div className="card">
        <CounterApp />
      </div>
      <hr />
      <div className="card">
        <TodoApp />
      </div>
      <hr />
      <div className="card">
        <QueryDemo />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
