import type { ImportBatch, NormalizedTransaction } from '@tsp8949/core';
import { summarize } from '@tsp8949/core';
import { describe, expect, it } from 'vitest';
import { SIZE_SPLIT_THRESHOLD, generateStatements } from '../src/pdf/form8949Pdf';
import { ROWS_PER_PAGE, planStatementPages, splitPlan } from '../src/pdf/paginate';

let n = 0;
function tx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  n++;
  return {
    id: `t${n}`,
    sourceRowIndex: n,
    description: `${100 + (n % 400)} sh SECURITY ${n} INC COMMON STOCK`,
    dateAcquired: { kind: 'date', iso: '2024-01-15' },
    dateSold: { kind: 'date', iso: '2024-11-20' },
    proceeds: 100000 + n * 37,
    costBasis: 90000 + n * 11,
    adjustmentAmount: 0,
    adjustmentCodes: [],
    term: 'short',
    termOverride: null,
    excluded: false,
    issues: [],
    ...overrides,
  };
}

function batchOf(
  transactions: NormalizedTransaction[],
  basisBox: 'A' | 'B' | 'C' = 'A',
): ImportBatch {
  return {
    id: `b-${basisBox}-${transactions.length}`,
    label: 'Test batch',
    sourceFileName: 'test.csv',
    source: 'csv',
    basisBox,
    transactions,
  };
}

const META = { clientName: 'Smith, Jane', tin: '123-45-6789', taxYear: 2025 };

describe('planStatementPages', () => {
  it('ends each category with a bold TOTALS row matching summarize()', () => {
    const batch = batchOf([tx(), tx(), tx({ term: 'long' })]);
    const totals = summarize([batch], 'whole-dollar');
    const pages = planStatementPages([batch], 'whole-dollar', totals);
    expect(pages).toHaveLength(2); // Box A page + Box D page
    const boxAPage = pages[0]!;
    expect(boxAPage.category).toBe('A');
    const totalsRow = boxAPage.rows[boxAPage.rows.length - 1]!;
    expect(totalsRow.bold).toBe(true);
    expect(totalsRow.description).toContain('2 transactions');
    // excluded rows and unresolved terms are not the PDF's problem: the
    // screens gate on those before export
  });

  it('paginates a category across pages with continuation numbering', () => {
    const batch = batchOf(Array.from({ length: ROWS_PER_PAGE + 10 }, () => tx()));
    const totals = summarize([batch], 'cents');
    const pages = planStatementPages([batch], 'cents', totals);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.categoryPage).toBe(1);
    expect(pages[1]!.categoryPage).toBe(2);
    expect(pages[1]!.categoryPageCount).toBe(2);
    // 61 rows total (60 tx + totals): 50 on page 1, 11 on page 2
    expect(pages[0]!.rows).toHaveLength(ROWS_PER_PAGE);
    expect(pages[1]!.rows).toHaveLength(11);
  });
});

describe('splitPlan', () => {
  it('returns one chunk when no split is needed', () => {
    const batch = batchOf([tx()]);
    const totals = summarize([batch], 'cents');
    const pages = planStatementPages([batch], 'cents', totals);
    expect(splitPlan(pages, 1)).toHaveLength(1);
  });

  it('prefers cutting at category boundaries', () => {
    const shortBatch = batchOf(Array.from({ length: ROWS_PER_PAGE * 2 }, () => tx()));
    const longBatch = batchOf(
      Array.from({ length: ROWS_PER_PAGE * 2 }, () => tx({ term: 'long' })),
      'C',
    );
    const totals = summarize([shortBatch, longBatch], 'cents');
    const pages = planStatementPages([shortBatch, longBatch], 'cents', totals);
    const chunks = splitPlan(pages, 2);
    expect(chunks).toHaveLength(2);
    // every chunk boundary coincides with a category change
    const lastOfFirst = chunks[0]![chunks[0]!.length - 1]!;
    const firstOfSecond = chunks[1]![0]!;
    expect(lastOfFirst.category).not.toBe(firstOfSecond.category);
  });
});

describe('generateStatements', () => {
  it('produces a valid single PDF for a normal return', async () => {
    const batch = batchOf([tx(), tx(), tx({ term: 'long' })]);
    const totals = summarize([batch], 'whole-dollar');
    const files = await generateStatements([batch], 'whole-dollar', totals, META);
    expect(files).toHaveLength(1);
    expect(files[0]!.fileName).toBe('Smith_2025_8949_Statement.pdf');
    // %PDF magic
    expect(String.fromCharCode(...files[0]!.bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('keeps 10,000 transactions comfortably under the 2 MB limit', async () => {
    const transactions = Array.from({ length: 10_000 }, (_, i) =>
      tx({ term: i % 3 === 0 ? 'long' : 'short' }),
    );
    const batch = batchOf(transactions);
    const totals = summarize([batch], 'whole-dollar');
    const files = await generateStatements([batch], 'whole-dollar', totals, META);
    expect(files).toHaveLength(1);
    expect(files[0]!.bytes.length).toBeLessThan(SIZE_SPLIT_THRESHOLD);
    // sanity: it's a real multi-page document, ~200 pages of content
    expect(files[0]!.bytes.length).toBeGreaterThan(100_000);
  }, 60_000);

  it('refuses to generate an empty statement', async () => {
    await expect(generateStatements([], 'cents', summarize([], 'cents'), META)).rejects.toThrow(
      /nothing to generate/i,
    );
  });
});
