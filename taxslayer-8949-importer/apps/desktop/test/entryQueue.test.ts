import type { CategoryTotals } from '@tsp8949/core';
import { describe, expect, it } from 'vitest';
import { buildQueue, typeableValue } from '../src/entry/buildQueue';

function totals(
  overrides: Partial<CategoryTotals> & { category: CategoryTotals['category'] },
): CategoryTotals {
  return {
    count: 1,
    proceeds: 0,
    costBasis: 0,
    adjustment: 0,
    gainLoss: 0,
    ...overrides,
  };
}

describe('typeableValue', () => {
  it('strips commas and matches on-screen rounding semantics', () => {
    expect(typeableValue(2955400, 'whole-dollar')).toBe('29554');
    expect(typeableValue(2955325, 'cents')).toBe('29553.25');
    expect(typeableValue(-32400, 'whole-dollar')).toBe('-324');
    expect(typeableValue(-32450, 'cents')).toBe('-324.50');
    expect(typeableValue(0, 'whole-dollar')).toBe('0');
    expect(typeableValue(123456789, 'cents')).toBe('1234567.89');
  });
});

describe('buildQueue', () => {
  const boxA = totals({
    category: 'A',
    count: 3,
    proceeds: 2955400,
    costBasis: 3021500,
    adjustment: 33700,
    gainLoss: -32400,
  });
  const boxD = totals({
    category: 'D',
    count: 2,
    proceeds: 2859500,
    costBasis: 1951000,
    adjustment: 0,
    gainLoss: 908500,
  });

  it('orders values per box: proceeds, cost basis, adjustment-when-nonzero', () => {
    const queue = buildQueue([boxA, boxD], { roundingMode: 'whole-dollar' });
    expect(queue.map((q) => `${q.category}:${q.field}`)).toEqual([
      'A:proceeds',
      'A:costBasis',
      'A:adjustment',
      'D:proceeds',
      'D:costBasis',
      // D has zero adjustment → skipped; gainLoss off by default
    ]);
    expect(queue[0]!.value).toBe('29554');
    expect(queue[2]!.value).toBe('337');
    expect(queue[0]!.label).toBe('Box A (Short-term) — Proceeds');
    expect(queue[3]!.label).toBe('Box D (Long-term) — Proceeds');
  });

  it('includes gain/loss only when opted in', () => {
    const withGain = buildQueue([boxA], { roundingMode: 'whole-dollar', includeGainLoss: true });
    expect(withGain.map((q) => q.field)).toEqual([
      'proceeds',
      'costBasis',
      'adjustment',
      'gainLoss',
    ]);
    expect(withGain[3]!.value).toBe('-324');
  });

  it('cents mode keeps two decimals', () => {
    const queue = buildQueue([totals({ category: 'C', proceeds: 4850012, costBasis: 3100000 })], {
      roundingMode: 'cents',
    });
    expect(queue[0]!.value).toBe('48500.12');
    expect(queue[1]!.value).toBe('31000.00');
  });

  it('skips empty categories entirely', () => {
    const queue = buildQueue([totals({ category: 'B', count: 0 }), boxD], {
      roundingMode: 'whole-dollar',
    });
    expect(queue.every((q) => q.category === 'D')).toBe(true);
  });
});
