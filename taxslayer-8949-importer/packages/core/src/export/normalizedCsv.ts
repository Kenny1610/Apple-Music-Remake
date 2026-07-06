import { categoryFor } from '../categorize/buckets';
import { formatTxDate } from '../normalize/dates';
import { formatCents } from '../normalize/money';
import { applyRounding } from '../totals/rounding';
import type { ImportBatch, RoundingMode } from '../types';
import { effectiveTerm } from '../types';

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export all batches as one normalized CSV, in Form 8949 column order, with
 * batch/category context. Uses the same rounding transform as the totals
 * and the statement PDF, so every artifact agrees.
 */
export function toNormalizedCsv(batches: ImportBatch[], mode: RoundingMode): string {
  const header = [
    'Batch',
    'Box',
    'Category',
    'Term',
    'Description',
    'Date Acquired',
    'Date Sold',
    'Proceeds',
    'Cost Basis',
    'Adjustment Codes',
    'Adjustment Amount',
    'Gain/Loss',
    'Excluded',
  ];
  const lines = [header.join(',')];

  for (const batch of batches) {
    for (const tx of batch.transactions) {
      const term = effectiveTerm(tx);
      const amounts = applyRounding(tx, mode);
      const row = [
        batch.label,
        batch.basisBox,
        term ? categoryFor(term, batch.basisBox) : '',
        term ?? 'unresolved',
        tx.description,
        formatTxDate(tx.dateAcquired),
        formatTxDate(tx.dateSold),
        formatCents(amounts.proceeds),
        formatCents(amounts.costBasis),
        tx.adjustmentCodes.join(' '),
        formatCents(amounts.adjustment),
        formatCents(amounts.gainLoss),
        tx.excluded ? 'yes' : '',
      ];
      lines.push(row.map(csvEscape).join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
