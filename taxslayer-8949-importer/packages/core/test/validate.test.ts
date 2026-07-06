import { describe, expect, it } from 'vitest';
import { normalizeRow } from '../src/normalize/normalizeRow';
import { hasBlockingErrors, issueCounts } from '../src/normalize/validate';
import type { MappedTransaction } from '../src/types';
import { makeTestId } from './helpers';

function row(overrides: Partial<MappedTransaction>): MappedTransaction {
  return {
    sourceRowIndex: 1,
    description: '10 sh TEST',
    dateAcquired: '01/01/2024',
    dateSold: '06/01/2024',
    proceeds: '1,000.00',
    costBasis: '800.00',
    ...overrides,
  };
}

const normalize = (r: MappedTransaction) => normalizeRow(r, { makeId: makeTestId });

describe('normalizeRow validation', () => {
  it('accepts a clean row with no issues', () => {
    const tx = normalize(row({}));
    expect(tx.issues).toEqual([]);
    expect(tx.term).toBe('short');
    expect(tx.proceeds).toBe(100000);
  });

  it('errors on missing description, proceeds, basis, and date sold', () => {
    const tx = normalize(row({ description: '', proceeds: '', costBasis: '', dateSold: '' }));
    const codes = tx.issues.map((i) => i.code).sort();
    expect(codes).toEqual(
      ['MISSING_BASIS', 'MISSING_DESCRIPTION', 'MISSING_PROCEEDS', 'BAD_DATE'].sort(),
    );
    expect(hasBlockingErrors([tx])).toBe(true);
  });

  it('distinguishes unreadable amounts from missing ones', () => {
    const tx = normalize(row({ proceeds: 'twelve dollars' }));
    expect(tx.issues.some((i) => i.code === 'BAD_AMOUNT' && i.field === 'proceeds')).toBe(true);
  });

  it('errors when sold before acquired', () => {
    const tx = normalize(row({ dateAcquired: '06/01/2024', dateSold: '01/01/2024' }));
    expect(tx.issues.some((i) => i.code === 'SOLD_BEFORE_ACQUIRED')).toBe(true);
  });

  it('warns TERM_UNKNOWN for Various acquired with no indicator', () => {
    const tx = normalize(row({ dateAcquired: 'Various' }));
    expect(tx.term).toBeNull();
    expect(tx.issues.some((i) => i.code === 'TERM_UNKNOWN' && i.severity === 'warning')).toBe(true);
    expect(hasBlockingErrors([tx])).toBe(false);
  });

  it('resolves term from the indicator when dates cannot', () => {
    const tx = normalize(row({ dateAcquired: 'Various', termIndicator: 'Long' }));
    expect(tx.term).toBe('long');
    expect(tx.issues.some((i) => i.code === 'TERM_UNKNOWN')).toBe(false);
  });

  it('warns on unrecognized adjustment codes and gain mismatches', () => {
    const tx = normalize(row({ adjustmentCode: 'Q9', gainLoss: '500.00' }));
    expect(tx.issues.some((i) => i.code === 'BAD_ADJ_CODE')).toBe(true);
    // computed gain is 200.00; broker says 500.00
    expect(tx.issues.some((i) => i.code === 'GAIN_MISMATCH')).toBe(true);
  });

  it('excluded rows do not count toward blocking errors', () => {
    const tx = normalize(row({ proceeds: '' }));
    tx.excluded = true;
    expect(hasBlockingErrors([tx])).toBe(false);
    expect(issueCounts([tx])).toEqual({ errors: 0, warnings: 0 });
  });
});
