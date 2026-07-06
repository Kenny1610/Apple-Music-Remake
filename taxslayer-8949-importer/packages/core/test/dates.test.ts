import { describe, expect, it } from 'vitest';
import { formatTxDate, parseDateColumn, parseTxDate } from '../src/normalize/dates';

describe('parseTxDate', () => {
  it('parses common US broker formats', () => {
    expect(parseTxDate('03/10/2025').date).toEqual({ kind: 'date', iso: '2025-03-10' });
    expect(parseTxDate('3/1/25').date).toEqual({ kind: 'date', iso: '2025-03-01' });
    expect(parseTxDate('12/15/23').date).toEqual({ kind: 'date', iso: '2023-12-15' });
    expect(parseTxDate('2024-06-15').date).toEqual({ kind: 'date', iso: '2024-06-15' });
    expect(parseTxDate('15-Mar-2025').date).toEqual({ kind: 'date', iso: '2025-03-15' });
    expect(parseTxDate('Mar 5, 2025').date).toEqual({ kind: 'date', iso: '2025-03-05' });
    expect(parseTxDate('20250315').date).toEqual({ kind: 'date', iso: '2025-03-15' });
  });

  it('strips ISO and US time suffixes (crypto exports)', () => {
    expect(parseTxDate('2025-02-01T14:22:05Z').date).toEqual({ kind: 'date', iso: '2025-02-01' });
    expect(parseTxDate('03/01/2025 14:22:05').date).toEqual({ kind: 'date', iso: '2025-03-01' });
  });

  it('treats Various and Inherited as first-class values', () => {
    expect(parseTxDate('Various').date).toEqual({ kind: 'various' });
    expect(parseTxDate('VARIOUS').date).toEqual({ kind: 'various' });
    expect(parseTxDate('var').date).toEqual({ kind: 'various' });
    expect(parseTxDate('Inherited').date).toEqual({ kind: 'inherited' });
    expect(parseTxDate('INHERIT').date).toEqual({ kind: 'inherited' });
  });

  it('returns unknown for blank or garbage', () => {
    expect(parseTxDate('').date).toEqual({ kind: 'unknown' });
    expect(parseTxDate('  ').date).toEqual({ kind: 'unknown' });
    expect(parseTxDate('N/A').date).toEqual({ kind: 'unknown' });
    expect(parseTxDate('not a date').date).toEqual({ kind: 'unknown' });
    expect(parseTxDate('13/45/2025').date).toEqual({ kind: 'unknown' });
  });

  it('never misreads a two-digit year as an ancient year', () => {
    // "3/1/25" must be 2025, not year 0025 via a lenient yyyy parse
    const parsed = parseTxDate('3/1/25');
    expect(parsed.date).toEqual({ kind: 'date', iso: '2025-03-01' });
  });

  it('honors a format hint before trying others', () => {
    const { date } = parseTxDate('01/02/2025', 'MM/dd/yyyy');
    expect(date).toEqual({ kind: 'date', iso: '2025-01-02' });
  });
});

describe('parseDateColumn', () => {
  it('locks the first matching format for the whole column', () => {
    const { dates, lockedFormat } = parseDateColumn(['03/10/2025', '01/02/2025', 'Various']);
    expect(lockedFormat).toBe('MM/dd/yyyy');
    expect(dates[0]).toEqual({ kind: 'date', iso: '2025-03-10' });
    expect(dates[1]).toEqual({ kind: 'date', iso: '2025-01-02' });
    expect(dates[2]).toEqual({ kind: 'various' });
  });

  it('handles an all-special column without a lock', () => {
    const { dates, lockedFormat } = parseDateColumn(['Various', '', 'Inherited']);
    expect(lockedFormat).toBeUndefined();
    expect(dates).toEqual([{ kind: 'various' }, { kind: 'unknown' }, { kind: 'inherited' }]);
  });
});

describe('formatTxDate', () => {
  it('renders for the 8949 statement', () => {
    expect(formatTxDate({ kind: 'date', iso: '2025-03-10' })).toBe('03/10/2025');
    expect(formatTxDate({ kind: 'various' })).toBe('Various');
    expect(formatTxDate({ kind: 'inherited' })).toBe('INHERITED');
    expect(formatTxDate({ kind: 'unknown' })).toBe('');
  });
});
