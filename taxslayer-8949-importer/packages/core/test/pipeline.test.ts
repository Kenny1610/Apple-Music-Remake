import { describe, expect, it } from 'vitest';
import { sniff } from '../src/csv/sniff';
import { suggestMapping } from '../src/mapping/suggest';
import { hasBlockingErrors } from '../src/normalize/validate';
import { buildBatch, reconcileBatch } from '../src/pipeline';
import { summarize } from '../src/totals/summarize';
import { loadFixture, makeTestId, parseCsv } from './helpers';

describe('Fidelity-style 1099-B CSV (preamble, total row, wash sale, Various)', () => {
  const table = parseCsv(loadFixture('fidelity-style.csv'));
  const sniffed = sniff(table);

  it('skips the preamble and finds the real header row', () => {
    expect(sniffed.headers).toEqual([
      'Symbol/Description',
      'Date Acquired',
      'Date Sold',
      'Quantity',
      'Proceeds',
      'Cost Basis',
      'Wash Sale Loss Disallowed',
      'Gain/Loss',
    ]);
    expect(sniffed.rows).toHaveLength(5); // total row removed
  });

  it('captures the source Total row for reconciliation', () => {
    expect(sniffed.sourceTotals).toEqual({ proceeds: 5814855, costBasis: 4972535 });
  });

  const mapping = suggestMapping(sniffed.headers);

  it('auto-suggests the full column mapping', () => {
    expect(mapping.fields.description).toBe('Symbol/Description');
    expect(mapping.fields.dateAcquired).toBe('Date Acquired');
    expect(mapping.fields.dateSold).toBe('Date Sold');
    expect(mapping.fields.proceeds).toBe('Proceeds');
    expect(mapping.fields.costBasis).toBe('Cost Basis');
    expect(mapping.fields.adjustmentAmount).toBe('Wash Sale Loss Disallowed');
    expect(mapping.fields.gainLoss).toBe('Gain/Loss');
    expect(mapping.descriptionMode).toBe('single-column');
  });

  const batch = buildBatch({
    label: 'Fidelity 1099-B',
    sourceFileName: 'fidelity-style.csv',
    source: 'csv',
    basisBox: 'A',
    rows: sniffed.rows,
    mapping,
    makeId: makeTestId,
    ...(sniffed.sourceTotals ? { sourceTotals: sniffed.sourceTotals } : {}),
  });

  it('normalizes every row without blocking errors', () => {
    expect(batch.transactions).toHaveLength(5);
    expect(hasBlockingErrors(batch.transactions)).toBe(false);
  });

  it('computes terms from dates (anniversary rule) and flags Various', () => {
    const [aapl, msft, tsla, ford, nvda] = batch.transactions;
    expect(aapl!.term).toBe('long'); // 01/15/2024 → 03/10/2025
    expect(msft!.term).toBe('short'); // 06/20/2024 → 02/14/2025
    expect(tsla!.term).toBe('short');
    expect(ford!.term).toBeNull(); // acquired "Various"
    expect(ford!.dateAcquired).toEqual({ kind: 'various' });
    expect(nvda!.term).toBe('long');
  });

  it('applies the wash-sale adjustment and agrees with the broker gain column', () => {
    const tsla = batch.transactions[2]!;
    expect(tsla.adjustmentAmount).toBe(33725);
    // a wash-sale-disallowed column with no code column implies code W
    expect(tsla.adjustmentCodes).toEqual(['W']);
    // rows without a wash-sale amount get no implied code
    expect(batch.transactions[0]!.adjustmentCodes).toEqual([]);
    // computed gain −1,337.25 + 337.25 = −1,000.00 matches broker → no mismatch warning
    expect(tsla.issues.find((i) => i.code === 'GAIN_MISMATCH')).toBeUndefined();
  });

  it('reconciles against the source Total row', () => {
    const rec = reconcileBatch(batch);
    expect(rec).not.toBeNull();
    expect(rec!.ok).toBe(true);
  });

  it('produces the exact six-bucket totals after the Various row is resolved short', () => {
    const ford = batch.transactions[3]!;
    ford.termOverride = 'short';

    const totals = summarize([batch], 'cents');
    const boxA = totals.find((t) => t.category === 'A')!;
    const boxD = totals.find((t) => t.category === 'D')!;

    // Short-term Box A: MSFT + TSLA + Ford (hand-computed)
    expect(boxA.count).toBe(3);
    expect(boxA.proceeds).toBe(2103050 + 611275 + 241000);
    expect(boxA.costBasis).toBe(1987525 + 745000 + 289000);
    expect(boxA.adjustment).toBe(33725);
    expect(boxA.gainLoss).toBe(115525 - 100000 - 48000);

    // Long-term Box D: AAPL + NVDA
    expect(boxD.count).toBe(2);
    expect(boxD.proceeds).toBe(1985000 + 874530);
    expect(boxD.costBasis).toBe(1720000 + 231010);
    expect(boxD.adjustment).toBe(0);
    expect(boxD.gainLoss).toBe(265000 + 643520);

    // invariant: gain = proceeds − basis + adjustment per bucket
    for (const t of totals) {
      expect(t.gainLoss).toBe(t.proceeds - t.costBasis + t.adjustment);
    }
    // other buckets empty
    for (const c of ['B', 'C', 'E', 'F'] as const) {
      expect(totals.find((t) => t.category === c)!.count).toBe(0);
    }
  });

  it('whole-dollar mode: totals are sums of per-row rounded values', () => {
    const ford = batch.transactions[3]!;
    ford.termOverride = 'short';
    const totals = summarize([batch], 'whole-dollar');
    const boxA = totals.find((t) => t.category === 'A')!;
    // MSFT 21,030.50→21,031 / 19,875.25→19,875; TSLA 6,112.75→6,113 / 7,450 / adj 337.25→337; Ford 2,410 / 2,890
    expect(boxA.proceeds).toBe(2103100 + 611300 + 241000);
    expect(boxA.costBasis).toBe(1987500 + 745000 + 289000);
    expect(boxA.adjustment).toBe(33700);
    expect(boxA.gainLoss).toBe(boxA.proceeds - boxA.costBasis + boxA.adjustment);
  });
});

describe('Coinbase-style crypto CSV (quantity+asset description, ISO timestamps)', () => {
  const table = parseCsv(loadFixture('coinbase-style.csv'));
  const sniffed = sniff(table);
  const mapping = suggestMapping(sniffed.headers);

  it('suggests composing the description from quantity + asset', () => {
    expect(mapping.descriptionMode).toBe('quantity-plus-asset');
    expect(mapping.fields.quantity).toBe('Quantity');
    expect(mapping.fields.assetName).toBe('Asset');
    expect(mapping.fields.dateSold).toBe('Date of Sale');
    expect(mapping.fields.proceeds).toBe('Proceeds (USD)');
    expect(mapping.fields.costBasis).toBe('Cost Basis (USD)');
  });

  const batch = buildBatch({
    label: 'Coinbase 2025',
    sourceFileName: 'coinbase-style.csv',
    source: 'csv',
    basisBox: 'C', // crypto: not reported on a 1099-B
    rows: sniffed.rows,
    mapping,
    makeId: makeTestId,
  });

  it('composes readable descriptions with trimmed quantities', () => {
    expect(batch.transactions.map((t) => t.description)).toEqual([
      '0.5 BTC',
      '10 ETH',
      '150 SOL',
      '10000 DOGE',
    ]);
  });

  it('parses ISO timestamps into dates and computes terms', () => {
    const [btc, eth, sol, doge] = batch.transactions;
    expect(btc!.dateSold).toEqual({ kind: 'date', iso: '2025-02-01' });
    expect(btc!.term).toBe('short'); // 2024-06-15 → 2025-02-01
    expect(eth!.term).toBe('long'); // 2023-01-10 → 2025-03-05
    expect(sol!.term).toBe('short');
    expect(doge!.term).toBe('short');
  });

  it('buckets into C (short) and F (long) with exact totals', () => {
    const totals = summarize([batch], 'cents');
    const boxC = totals.find((t) => t.category === 'C')!;
    const boxF = totals.find((t) => t.category === 'F')!;
    expect(boxC.count).toBe(3);
    expect(boxC.proceeds).toBe(4850000 + 2887500 + 321040);
    expect(boxC.costBasis).toBe(3100000 + 3412500 + 410090);
    expect(boxC.gainLoss).toBe(1750000 - 525000 - 89050);
    expect(boxF.count).toBe(1);
    expect(boxF.proceeds).toBe(3245075);
    expect(boxF.costBasis).toBe(1520050);
    expect(boxF.gainLoss).toBe(1725025);
  });
});

describe('Robinhood-style CSV (two-digit years, TERM column, zero-gain wash sale)', () => {
  const table = parseCsv(loadFixture('robinhood-style.csv'));
  const sniffed = sniff(table);
  const mapping = suggestMapping(sniffed.headers);

  const batch = buildBatch({
    label: 'Robinhood',
    sourceFileName: 'robinhood-style.csv',
    source: 'csv',
    basisBox: 'B',
    rows: sniffed.rows,
    mapping,
    makeId: makeTestId,
  });

  it('maps the TERM indicator column', () => {
    expect(mapping.fields.termIndicator).toBe('TERM');
  });

  it('parses two-digit years correctly', () => {
    const gme = batch.transactions[0]!;
    expect(gme.dateAcquired).toEqual({ kind: 'date', iso: '2025-03-01' });
    expect(gme.dateSold).toEqual({ kind: 'date', iso: '2025-03-08' });
  });

  it('fully-disallowed wash sale nets to zero gain and matches the broker column', () => {
    const gme = batch.transactions[0]!;
    expect(gme.adjustmentAmount).toBe(3250);
    expect(gme.issues.find((i) => i.code === 'GAIN_MISMATCH')).toBeUndefined();
    const totals = summarize([batch], 'cents');
    const boxB = totals.find((t) => t.category === 'B')!;
    const boxE = totals.find((t) => t.category === 'E')!;
    expect(boxB.count).toBe(2); // GME + PLTR short
    expect(boxE.count).toBe(1); // AMC long
    expect(boxB.gainLoss).toBe(0 + 5460);
    expect(boxE.gainLoss).toBe(-18180);
  });
});
