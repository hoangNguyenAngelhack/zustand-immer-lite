import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createMutationHook } from '../src/mutation';
import { create } from '../src/create';

describe('createMutationHook', () => {
  it('should handle basic mutation lifecycle', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1, name: 'created' });
    const useMutation = createMutationHook({ fn });

    function TestComponent() {
      const { mutate, data, loading, error } = useMutation();
      return (
        <div>
          <span data-testid="v">
            {loading ? 'Loading' : error ? `Error: ${error.message}` : data ? JSON.stringify(data) : 'Idle'}
          </span>
          <button data-testid="btn" onClick={() => mutate('test')}>Go</button>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.getByTestId('v').textContent).toBe('Idle');

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('{"id":1,"name":"created"}');
    });
    expect(fn).toHaveBeenCalledWith('test');
  });

  it('should return data via mutateAsync', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const useMutation = createMutationHook({ fn });

    let result: number | undefined;

    function TestComponent() {
      const { mutateAsync } = useMutation();
      return (
        <button data-testid="btn" onClick={async () => { result = await mutateAsync(); }}>Go</button>
      );
    }

    render(<TestComponent />);

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result).toBe(42);
  });

  it('should handle mutation errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Server error'));
    const useMutation = createMutationHook({ fn });

    function TestComponent() {
      const { mutate, loading, error } = useMutation();
      return (
        <div>
          <span data-testid="v">
            {loading ? 'Loading' : error ? error.message : 'Idle'}
          </span>
          <button data-testid="btn" onClick={() => mutate()}>Go</button>
        </div>
      );
    }

    render(<TestComponent />);

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('Server error');
    });
  });

  it('should call onSuccess callback', async () => {
    const onSuccess = vi.fn();
    const fn = vi.fn().mockResolvedValue('result');
    const useMutation = createMutationHook({ fn, onSuccess });

    function TestComponent() {
      const { mutate } = useMutation();
      return <button data-testid="btn" onClick={() => mutate()}>Go</button>;
    }

    render(<TestComponent />);

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onSuccess).toHaveBeenCalledWith('result');
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const useMutation = createMutationHook({ fn, onError });

    function TestComponent() {
      const { mutate } = useMutation();
      return <button data-testid="btn" onClick={() => mutate()}>Go</button>;
    }

    render(<TestComponent />);

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('fail');
  });

  it('should call onSettled on both success and failure', async () => {
    const onSettled = vi.fn();

    // Success case
    const fn1 = vi.fn().mockResolvedValue('data');
    const useMutation1 = createMutationHook({ fn: fn1, onSettled });

    function Success() {
      const { mutate } = useMutation1();
      return <button data-testid="btn1" onClick={() => mutate()}>Go</button>;
    }

    render(<Success />);
    await act(async () => {
      screen.getByTestId('btn1').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onSettled).toHaveBeenCalledWith('data', null);

    // Error case
    const onSettled2 = vi.fn();
    const fn2 = vi.fn().mockRejectedValue(new Error('fail'));
    const useMutation2 = createMutationHook({ fn: fn2, onSettled: onSettled2 });

    function Failure() {
      const { mutate } = useMutation2();
      return <button data-testid="btn2" onClick={() => mutate()}>Go</button>;
    }

    render(<Failure />);
    await act(async () => {
      screen.getByTestId('btn2').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(onSettled2).toHaveBeenCalledTimes(1);
    expect(onSettled2.mock.calls[0][0]).toBeUndefined();
    expect(onSettled2.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('should reset state', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const useMutation = createMutationHook({ fn });

    function TestComponent() {
      const { mutate, data, reset } = useMutation();
      return (
        <div>
          <span data-testid="v">{data ?? 'empty'}</span>
          <button data-testid="mutate" onClick={() => mutate()}>Go</button>
          <button data-testid="reset" onClick={reset}>Reset</button>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.getByTestId('v').textContent).toBe('empty');

    await act(async () => {
      screen.getByTestId('mutate').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('data'));

    act(() => {
      screen.getByTestId('reset').click();
    });

    await waitFor(() => expect(screen.getByTestId('v').textContent).toBe('empty'));
  });
});

describe('mutations in create()', () => {
  it('should bind mutations to store', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 });
    const useStore = create({
      state: { x: 0 },
      mutations: {
        addItem: { fn },
      },
    });

    function TestComponent() {
      const { mutate, data, loading } = useStore.mutations.addItem();
      return (
        <div>
          <span data-testid="v">{loading ? 'Loading' : data ? JSON.stringify(data) : 'Idle'}</span>
          <button data-testid="btn" onClick={() => mutate('test')}>Go</button>
        </div>
      );
    }

    render(<TestComponent />);
    expect(screen.getByTestId('v').textContent).toBe('Idle');

    await act(async () => {
      screen.getByTestId('btn').click();
      await new Promise((r) => setTimeout(r, 50));
    });

    await waitFor(() => {
      expect(screen.getByTestId('v').textContent).toBe('{"id":1}');
    });
  });
});
