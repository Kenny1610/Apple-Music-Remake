import { describe, expect, it } from 'vitest';
import { computeTerm, parseTermIndicator } from '../src/categorize/term';
import type { TxDate } from '../src/types';

const d = (iso: string): TxDate => ({ kind: 'date', iso });

describe('computeTerm', () => {
  it('is short-term up to and including the first anniversary', () => {
    expect(computeTerm(d('2024-03-10'), d('2024-09-10'))).toBe('short');
    // selling exactly on the anniversary is still short-term
    expect(computeTerm(d('2024-03-10'), d('2025-03-10'))).toBe('short');
    // the day after the anniversary is long-term
    expect(computeTerm(d('2024-03-10'), d('2025-03-11'))).toBe('long');
    expect(computeTerm(d('2023-01-10'), d('2025-03-05'))).toBe('long');
  });

  it('handles Feb 29 acquisitions', () => {
    // Feb 29, 2024 → anniversary treated as Mar 1, 2025
    expect(computeTerm(d('2024-02-29'), d('2025-02-28'))).toBe('short');
    expect(computeTerm(d('2024-02-29'), d('2025-03-01'))).toBe('short');
    expect(computeTerm(d('2024-02-29'), d('2025-03-02'))).toBe('long');
  });

  it('inherited property is always long-term', () => {
    expect(computeTerm({ kind: 'inherited' }, d('2025-01-05'))).toBe('long');
  });

  it('returns null when a date is unknown or various', () => {
    expect(computeTerm({ kind: 'various' }, d('2025-01-05'))).toBeNull();
    expect(computeTerm({ kind: 'unknown' }, d('2025-01-05'))).toBeNull();
    expect(computeTerm(d('2024-01-05'), { kind: 'unknown' })).toBeNull();
  });
});

describe('parseTermIndicator', () => {
  it('recognizes short/long variants', () => {
    for (const s of ['S', 'ST', 'Short', 'SHORT TERM', 'short-term']) {
      expect(parseTermIndicator(s)).toBe('short');
    }
    for (const s of ['L', 'LT', 'Long', 'LONG TERM', 'Long-term']) {
      expect(parseTermIndicator(s)).toBe('long');
    }
  });

  it('returns null for anything else', () => {
    expect(parseTermIndicator('')).toBeNull();
    expect(parseTermIndicator('X')).toBeNull();
    expect(parseTermIndicator(undefined)).toBeNull();
  });
});
