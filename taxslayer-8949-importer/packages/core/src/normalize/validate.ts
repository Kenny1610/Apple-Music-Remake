import type { NormalizedTransaction, RowIssue } from '../types';

interface RawContext {
  proceedsMissing: boolean;
  basisMissing: boolean;
  rawProceeds: string;
  rawBasis: string;
  rawDateAcquired: string;
  rawDateSold: string;
}

/** Row-level validation. Errors block export; warnings don't. */
export function validateRow(tx: NormalizedTransaction, raw: RawContext): RowIssue[] {
  const issues: RowIssue[] = [];

  if (tx.description === '') {
    issues.push({
      field: 'description',
      severity: 'error',
      code: 'MISSING_DESCRIPTION',
      message: 'Description is required on Form 8949 (e.g. "100 sh. XYZ Co." or "0.5 BTC")',
    });
  }

  if (raw.proceedsMissing) {
    const hadText = raw.rawProceeds.trim() !== '';
    issues.push({
      field: 'proceeds',
      severity: 'error',
      code: hadText ? 'BAD_AMOUNT' : 'MISSING_PROCEEDS',
      message: hadText
        ? `Could not read proceeds value "${raw.rawProceeds.trim()}"`
        : 'Proceeds amount is missing',
    });
  }

  if (raw.basisMissing) {
    const hadText = raw.rawBasis.trim() !== '';
    issues.push({
      field: 'costBasis',
      severity: 'error',
      code: hadText ? 'BAD_AMOUNT' : 'MISSING_BASIS',
      message: hadText
        ? `Could not read cost basis value "${raw.rawBasis.trim()}"`
        : 'Cost basis is missing — enter 0 if the basis is truly zero',
    });
  }

  if (tx.dateSold.kind === 'unknown') {
    const hadText = raw.rawDateSold.trim() !== '';
    issues.push({
      field: 'dateSold',
      severity: 'error',
      code: 'BAD_DATE',
      message: hadText
        ? `Could not read date sold "${raw.rawDateSold.trim()}"`
        : 'Date sold is missing',
    });
  }

  if (tx.dateAcquired.kind === 'unknown' && raw.rawDateAcquired.trim() !== '') {
    issues.push({
      field: 'dateAcquired',
      severity: 'warning',
      code: 'BAD_DATE',
      message: `Could not read date acquired "${raw.rawDateAcquired.trim()}" — treated as blank`,
    });
  }

  if (
    tx.dateAcquired.kind === 'date' &&
    tx.dateSold.kind === 'date' &&
    tx.dateSold.iso < tx.dateAcquired.iso
  ) {
    issues.push({
      field: 'row',
      severity: 'error',
      code: 'SOLD_BEFORE_ACQUIRED',
      message: `Sold ${tx.dateSold.iso} before acquired ${tx.dateAcquired.iso} — check the dates (short sales should use the closing date)`,
    });
  }

  if (tx.term === null && tx.dateSold.kind !== 'unknown') {
    issues.push({
      field: 'row',
      severity: 'warning',
      code: 'TERM_UNKNOWN',
      message:
        'Holding period (short/long-term) could not be determined — resolve it on the Categorize step',
    });
  }

  return issues;
}

export function hasBlockingErrors(txs: NormalizedTransaction[]): boolean {
  return txs.some((tx) => !tx.excluded && tx.issues.some((i) => i.severity === 'error'));
}

export function issueCounts(txs: NormalizedTransaction[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const tx of txs) {
    if (tx.excluded) continue;
    for (const issue of tx.issues) {
      if (issue.severity === 'error') errors++;
      else warnings++;
    }
  }
  return { errors, warnings };
}
