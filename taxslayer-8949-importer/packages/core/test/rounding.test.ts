import { describe, expect, it } from 'vitest';
import { applyRounding, roundToWholeDollar } from '../src/totals/rounding';
import type { NormalizedTransaction } from '../src/types';

describe('roundToWholeDollar', () => {
  it('rounds 50¢ and up away from zero (IRS convention)', () => {
    expect(roundToWholeDollar(149)).toBe(100);
    expect(roundToWholeDollar(150)).toBe(200);
    expect(roundToWholeDollar(-149)).toBe(-100);
    expect(roundToWholeDollar(-150)).toBe(-200);
    expect(roundToWholeDollar(0)).toBe(0);
    expect(roundToWholeDollar(2103050)).toBe(2103100); // $21,030.50 → $21,031
    expect(roundToWholeDollar(1987525)).toBe(1987500); // $19,875.25 → $19,875
  });
});

function tx(proceeds: number, costBasis: number, adjustment = 0): NormalizedTransaction {
  return {
    id: 't1',
    sourceRowIndex: 0,
    description: 'test',
    dateAcquired: { kind: 'date', iso: '2024-01-01' },
    dateSold: { kind: 'date', iso: '2024-06-01' },
    proceeds,
    costBasis,
    adjustmentAmount: adjustment,
    adjustmentCodes: adjustment !== 0 ? ['W'] : [],
    term: 'short',
    termOverride: null,
    excluded: false,
    issues: [],
  };
}

describe('applyRounding', () => {
  it('cents mode passes exact values through', () => {
    const r = applyRounding(tx(611275, 745000, 33725), 'cents');
    expect(r).toEqual({
      proceeds: 611275,
      costBasis: 745000,
      adjustment: 33725,
      gainLoss: -100000,
    });
  });

  it('whole-dollar mode recomputes gain FROM the rounded values', () => {
    // $6,112.75 → $6,113; $7,450.00 → $7,450; $337.25 → $337
    const r = applyRounding(tx(611275, 745000, 33725), 'whole-dollar');
    expect(r.proceeds).toBe(611300);
    expect(r.costBasis).toBe(745000);
    expect(r.adjustment).toBe(33700);
    // gain = rounded components, NOT round(exact gain)
    expect(r.gainLoss).toBe(611300 - 745000 + 33700);
  });
});
