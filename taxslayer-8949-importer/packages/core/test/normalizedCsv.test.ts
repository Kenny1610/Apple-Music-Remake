import { describe, expect, it } from 'vitest';
import { toNormalizedCsv } from '../src/export/normalizedCsv';
import type { ImportBatch } from '../src/types';

const batch: ImportBatch = {
  id: 'b1',
  label: 'Broker, "Inc"',
  sourceFileName: 'x.csv',
  source: 'csv',
  basisBox: 'A',
  transactions: [
    {
      id: 't1',
      sourceRowIndex: 1,
      description: '100 AAPL, common',
      dateAcquired: { kind: 'various' },
      dateSold: { kind: 'date', iso: '2025-03-10' },
      proceeds: 1985000,
      costBasis: 1720000,
      adjustmentAmount: 0,
      adjustmentCodes: [],
      term: null,
      termOverride: 'short',
      excluded: false,
      issues: [],
    },
  ],
};

describe('toNormalizedCsv', () => {
  it('emits header + escaped rows with derived category and gain', () => {
    const csv = toNormalizedCsv([batch], 'cents');
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Description,Date Acquired,Date Sold');
    // embedded commas/quotes escaped
    expect(lines[1]).toContain('"Broker, ""Inc"""');
    expect(lines[1]).toContain('"100 AAPL, common"');
    expect(lines[1]).toContain('Various');
    // override short + box A → category A, gain 2,650.00
    expect(lines[1]).toContain(',A,short,');
    expect(lines[1]).toContain('2,650.00');
  });
});
