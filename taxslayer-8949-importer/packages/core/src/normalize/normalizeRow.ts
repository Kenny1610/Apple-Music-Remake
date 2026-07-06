import { computeTerm, parseTermIndicator } from '../categorize/term';
import type { MappedTransaction, NormalizedTransaction, RowIssue } from '../types';
import { gainLoss } from '../types';
import { parseTxDate } from './dates';
import { parseCents } from './money';
import { validateRow } from './validate';

/** Valid Form 8949 column (f) adjustment codes. */
const VALID_ADJ_CODES = new Set([
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'M',
  'N',
  'O',
  'Q',
  'R',
  'S',
  'T',
  'W',
  'X',
  'Y',
  'Z',
]);

export interface NormalizeOptions {
  /** Locked date format for the batch's date columns, if known. */
  dateFormatHint?: string;
  /** Injected id factory so core stays platform-free (crypto.randomUUID in app). */
  makeId: () => string;
}

/**
 * Turn one mapped (still-string) transaction into a NormalizedTransaction,
 * accumulating validation issues rather than throwing — the review grid
 * surfaces them for the preparer to fix.
 */
export function normalizeRow(
  row: MappedTransaction,
  opts: NormalizeOptions,
): NormalizedTransaction {
  const issues: RowIssue[] = [];

  const dateAcquired = parseTxDate(row.dateAcquired, opts.dateFormatHint).date;
  const dateSold = parseTxDate(row.dateSold, opts.dateFormatHint).date;

  const proceeds = parseCents(row.proceeds);
  const costBasis = parseCents(row.costBasis);
  const adjustmentAmount = row.adjustmentAmount ? parseCents(row.adjustmentAmount) : null;

  const adjustmentCodes = parseAdjCodes(row.adjustmentCode);
  for (const code of adjustmentCodes) {
    if (!VALID_ADJ_CODES.has(code)) {
      issues.push({
        field: 'adjustmentCode',
        severity: 'warning',
        code: 'BAD_ADJ_CODE',
        message: `"${code}" is not a recognized Form 8949 adjustment code`,
      });
    }
  }

  // Term: dates first, then an explicit indicator column as fallback.
  const termFromDates = computeTerm(dateAcquired, dateSold);
  const term = termFromDates ?? parseTermIndicator(row.termIndicator);

  const tx: NormalizedTransaction = {
    id: opts.makeId(),
    sourceRowIndex: row.sourceRowIndex,
    description: row.description.trim(),
    dateAcquired,
    dateSold,
    proceeds: proceeds ?? 0,
    costBasis: costBasis ?? 0,
    adjustmentAmount: adjustmentAmount ?? 0,
    adjustmentCodes,
    term,
    termOverride: null,
    excluded: false,
    issues,
  };

  issues.push(
    ...validateRow(tx, {
      proceedsMissing: proceeds === null,
      basisMissing: costBasis === null,
      rawProceeds: row.proceeds,
      rawBasis: row.costBasis,
      rawDateAcquired: row.dateAcquired,
      rawDateSold: row.dateSold,
    }),
  );

  // Cross-check a broker-provided gain/loss column if one was mapped; never
  // trust it, but flag disagreement beyond a $0.02 rounding tolerance.
  if (row.gainLoss != null && row.gainLoss.trim() !== '') {
    const reported = parseCents(row.gainLoss);
    if (reported !== null && Math.abs(reported - gainLoss(tx)) > 2) {
      issues.push({
        field: 'gainLoss',
        severity: 'warning',
        code: 'GAIN_MISMATCH',
        message: `Broker-reported gain/loss disagrees with proceeds − basis + adjustment (computed ${gainLoss(tx)}¢, reported ${reported}¢)`,
      });
    }
  }

  return tx;
}

function parseAdjCodes(input: string | null | undefined): string[] {
  if (input == null) return [];
  return input
    .toUpperCase()
    .split(/[\s,;/]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}
