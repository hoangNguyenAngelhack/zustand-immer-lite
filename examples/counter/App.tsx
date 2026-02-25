import React from 'react';
import { useCounter } from './store';

export default function Counter() {
  const count = useCounter((s) => s.count);
  const doubled = useCounter((s) => s.doubled);
  const label = useCounter((s) => s.label);
  const { increment, decrement, addBy, reset } = useCounter.actions;

  return (
    <div>
      <h2>Counter</h2>
      <p style={{ fontSize: '0.85rem', color: '#888' }}>
        Demonstrates: actions, computed (with chaining), persist, subscribe with selector
      </p>
      <div style={{ fontSize: '2rem', margin: '0.5rem 0' }}>
        {count}
        <span style={{ fontSize: '0.9rem', color: '#888', marginLeft: 8 }}>
          (doubled: {doubled}, {label})
        </span>
      </div>
      <button onClick={increment}>+1</button>
      <button onClick={decrement}>-1</button>
      <button onClick={() => addBy(10)}>+10</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
