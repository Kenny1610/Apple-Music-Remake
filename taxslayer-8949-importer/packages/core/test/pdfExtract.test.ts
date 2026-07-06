import { describe, expect, it } from 'vitest';
import { suggestMapping } from '../src/mapping/suggest';
import { detect1099b } from '../src/pdfExtract/detect1099b';
import type { PositionedText } from '../src/pdfExtract/reconstructTable';
import { buildBatch } from '../src/pipeline';
import { summarize } from '../src/totals/summarize';
import { makeTestId } from './helpers';

/** Build a header line at the standard consolidated-1099 column positions. */
function headerItems(page: number, y: number): PositionedText[] {
  return [
    { text: 'Description', x: 40, y, width: 60, page },
    { text: 'Date Acquired', x: 140, y, width: 70, page },
    { text: 'Date Sold', x: 240, y, width: 50, page },
    { text: 'Proceeds', x: 330, y, width: 50, page },
    { text: 'Cost Basis', x: 420, y, width: 55, page },
    { text: 'Wash Sale Loss Disallowed', x: 500, y, width: 80, page },
    { text: 'Gain/Loss', x: 600, y, width: 60, page },
  ];
}

function dataRow(
  page: number,
  y: number,
  cells: [string, string, string, string, string, string, string],
): PositionedText[] {
  const xs = [40, 150, 240, 330, 420, 510, 600];
  const widths = [60, 45, 45, 45, 45, 40, 45];
  return cells
    .map((text, i) => ({ text, x: xs[i]!, y, width: widths[i]!, page }))
    .filter((item) => item.text !== '');
}

const FIXTURE: PositionedText[] = [
  // ---- page 1: short-term Box A section ----
  {
    text: 'SHORT-TERM TRANSACTIONS FOR WHICH BASIS IS REPORTED TO THE IRS (Box A)',
    x: 40,
    y: 750,
    width: 400,
    page: 1,
  },
  ...headerItems(1, 730),
  ...dataRow(1, 710, [
    '100 AAPL',
    '06/15/2024',
    '03/10/2025',
    '19,850.00',
    '17,200.00',
    '',
    '2,650.00',
  ]),
  // multi-line description continuation
  { text: 'APPLE INC COM', x: 40, y: 695, width: 70, page: 1 },
  ...dataRow(1, 675, [
    '25 TSLA',
    '11/03/2024',
    '01/22/2025',
    '6,112.75',
    '7,450.00',
    '337.25',
    '(1,000.00)',
  ]),
  ...dataRow(1, 655, ['Totals', '', '', '25,962.75', '24,650.00', '', '']),
  // page furniture that must be ignored
  { text: 'Page 1 of 2', x: 300, y: 30, width: 60, page: 1 },
  // ---- page 2: long-term Box E section ----
  {
    text: 'LONG-TERM TRANSACTIONS FOR WHICH BASIS IS NOT REPORTED TO THE IRS (Box E)',
    x: 40,
    y: 750,
    width: 400,
    page: 2,
  },
  ...headerItems(2, 730),
  ...dataRow(2, 710, [
    '50 XYZ CORP',
    '01/10/2020',
    '02/20/2025',
    '5,000.00',
    '2,000.00',
    '',
    '3,000.00',
  ]),
  ...dataRow(2, 690, ['Totals', '', '', '5,000.00', '2,000.00', '', '']),
];

describe('detect1099b', () => {
  const result = detect1099b(FIXTURE);

  it('flags empty documents as likely scanned', () => {
    expect(detect1099b([]).looksScanned).toBe(true);
    expect(result.looksScanned).toBe(false);
  });

  it('detects both sections with term and box', () => {
    expect(result.sections).toHaveLength(2);
    const [shortA, longE] = result.sections;
    expect(shortA!.term).toBe('short');
    expect(shortA!.basisBox).toBe('A');
    expect(shortA!.label).toContain('Box A');
    expect(longE!.term).toBe('long');
    expect(longE!.basisBox).toBe('B'); // long-term Box E ≡ basis box B
    expect(longE!.label).toContain('Box E');
  });

  it('extracts rows with canonical headers and merges description continuations', () => {
    const shortA = result.sections[0]!;
    expect(shortA.headers).toEqual([
      'Description',
      'Date Acquired',
      'Date Sold',
      'Proceeds',
      'Cost Basis',
      'Wash Sale Adj',
      'Gain/Loss',
    ]);
    expect(shortA.rows).toHaveLength(2);
    expect(shortA.rows[0]!.cells.Description).toBe('100 AAPL APPLE INC COM');
    expect(shortA.rows[1]!.cells['Wash Sale Adj']).toBe('337.25');
  });

  it('captures section totals for reconciliation', () => {
    expect(result.sections[0]!.sourceTotals).toEqual({ proceeds: 2596275, costBasis: 2465000 });
    expect(result.sections[1]!.sourceTotals).toEqual({ proceeds: 500000, costBasis: 200000 });
  });

  it('flows into the shared pipeline and produces correct bucket totals', () => {
    const batches = result.sections.map((section) =>
      buildBatch({
        label: section.label,
        sourceFileName: 'consolidated-1099.pdf',
        source: 'pdf',
        basisBox: section.basisBox ?? 'C',
        rows: section.rows,
        mapping: suggestMapping(section.headers),
        makeId: makeTestId,
        ...(section.term ? { forcedTerm: section.term } : {}),
        ...(section.sourceTotals ? { sourceTotals: section.sourceTotals } : {}),
      }),
    );

    const totals = summarize(batches, 'cents');
    const boxA = totals.find((t) => t.category === 'A')!;
    const boxE = totals.find((t) => t.category === 'E')!;
    expect(boxA.count).toBe(2);
    expect(boxA.proceeds).toBe(2596275);
    expect(boxA.costBasis).toBe(2465000);
    expect(boxA.adjustment).toBe(33725);
    expect(boxA.gainLoss).toBe(265000 - 100000);
    expect(boxE.count).toBe(1);
    expect(boxE.gainLoss).toBe(300000);
  });
});
