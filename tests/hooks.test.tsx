import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { create } from '../src/create';

describe('useStore hook', () => {
  it('should read full state', () => {
    const useCounter = create({
      state: { count: 5 },
    });

    function Display() {
      const state = useCounter();
      return <span data-testid="v">{state.count}</span>;
    }

    render(<Display />);
    expect(screen.getByTestId('v').textContent).toBe('5');
  });

  it('should read state with selector', () => {
    const useCounter = create({
      state: { count: 10, name: 'test' },
    });

    function Display() {
      const count = useCounter((s) => s.count);
      return <span data-testid="v">{count}</span>;
    }

    render(<Display />);
    expect(screen.getByTestId('v').textContent).toBe('10');
  });

  it('should re-render on state change', () => {
    const useCounter = create({
      state: { count: 0 },
      actions: {
        inc(state) { state.count += 1; },
      },
    });

    function Counter() {
      const count = useCounter((s) => s.count);
      return <span data-testid="v">{count}</span>;
    }

    render(<Counter />);
    expect(screen.getByTestId('v').textContent).toBe('0');

    act(() => { useCounter.actions.inc(); });
    expect(screen.getByTestId('v').textContent).toBe('1');
  });

  it('should work with actions called from component', () => {
    const useCounter = create({
      state: { count: 0 },
      actions: {
        inc(state) { state.count += 1; },
        add(state, n: number) { state.count += n; },
      },
    });

    function Counter() {
      const count = useCounter((s) => s.count);
      const { inc, add } = useCounter.actions;

      return (
        <div>
          <span data-testid="v">{count}</span>
          <button data-testid="inc" onClick={inc}>+1</button>
          <button data-testid="add" onClick={() => add(10)}>+10</button>
        </div>
      );
    }

    render(<Counter />);
    expect(screen.getByTestId('v').textContent).toBe('0');

    fireEvent.click(screen.getByTestId('inc'));
    expect(screen.getByTestId('v').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('add'));
    expect(screen.getByTestId('v').textContent).toBe('11');
  });

  it('should work with async effects from component', async () => {
    const useData = create({
      state: { result: '', loading: false },
      effects: {
        async fetchData({ set }, query: string) {
          set((s) => { s.loading = true; });
          await new Promise((r) => setTimeout(r, 10));
          set((s) => { s.result = `Got: ${query}`; s.loading = false; });
        },
      },
    });

    function DataView() {
      const { result, loading } = useData();
      if (loading) return <span data-testid="v">Loading...</span>;
      return <span data-testid="v">{result || 'Empty'}</span>;
    }

    render(<DataView />);
    expect(screen.getByTestId('v').textContent).toBe('Empty');

    await act(async () => {
      await useData.effects.fetchData('hello');
    });

    expect(screen.getByTestId('v').textContent).toBe('Got: hello');
  });
});
