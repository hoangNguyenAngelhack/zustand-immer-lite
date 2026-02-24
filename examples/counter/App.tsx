import React from 'react';
import { useCounter } from './store';

export default function Counter() {
  const count = useCounter((s) => s.count);
  const { increment, decrement, addBy, reset } = useCounter.actions;

  return (
    <div>
      <h2>Counter: {count}</h2>
      <button onClick={increment}>+1</button>
      <button onClick={decrement}>-1</button>
      <button onClick={() => addBy(10)}>+10</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
