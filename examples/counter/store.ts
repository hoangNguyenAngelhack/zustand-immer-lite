import { create } from '../../src';

export const useCounter = create({
  state: { count: 0 },
  actions: {
    increment(state) { state.count += 1; },
    decrement(state) { state.count -= 1; },
    addBy(state, amount: number) { state.count += amount; },
    reset(state) { state.count = 0; },
  },
  computed: {
    doubled: (state) => state.count * 2,
    isPositive: (state) => state.count > 0,
    isNegative: (state) => state.count < 0,
    label: (state) => {
      if (state.count === 0) return 'zero';
      return state.isPositive ? 'positive' : 'negative'; // chaining computed
    },
  },
});
