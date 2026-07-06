import { describe, expect, it } from 'vitest';
import { formatCents, formatWholeDollars, parseCents } from '../src/normalize/money';

describe('parseCents', () => {
  const cases: [string, number | null][] = [
    ['1234.56', 123456],
    ['$1,234.56', 123456],
    ['(1,234.56)', -123456],
    ['($1,234.56)', -123456],
    ['-1234.56', -123456],
    ['1234.56-', -123456],
    ['0', 0],
    ['0.00', 0],
    ['1234', 123400],
    ['12.5', 1250],
    ['12.567', 1257], // third decimal rounds half-up
    ['12.564', 1256],
    ['.56', null], // ambiguous bare fraction — reject
    ['', null],
    ['   ', null],
    ['-', null],
    ['--', null],
    ['N/A', null],
    ['n/a', null],
    ['abc', null],
    ['$ 48,500.00', 4850000],
    ['48500.00', 4850000],
    ['(480.00)', -48000],
    ['12.34.56', null],
  ];

  for (const [input, expected] of cases) {
    it(`parses ${JSON.stringify(input)} → ${expected}`, () => {
      expect(parseCents(input)).toBe(expected);
    });
  }

  it('never uses float multiplication (classic 0.1+0.2 traps)', () => {
    expect(parseCents('0.29')).toBe(29);
    expect(parseCents('1.15')).toBe(115);
    expect(parseCents('2.55')).toBe(255);
    expect(parseCents('19850.00')).toBe(1985000);
  });
});

describe('formatCents', () => {
  it('formats with thousands separators and two decimals', () => {
    expect(formatCents(123456)).toBe('1,234.56');
    expect(formatCents(-123456)).toBe('-1,234.56');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-5)).toBe('-0.05');
    expect(formatCents(100000000)).toBe('1,000,000.00');
  });
});

describe('formatWholeDollars', () => {
  it('renders already-rounded cents as whole dollars', () => {
    expect(formatWholeDollars(123400)).toBe('1,234');
    expect(formatWholeDollars(-48000)).toBe('-480');
    expect(formatWholeDollars(0)).toBe('0');
  });
});
