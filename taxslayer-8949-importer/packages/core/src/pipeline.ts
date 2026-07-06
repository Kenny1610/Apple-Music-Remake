import { applyMapping } from './mapping/applyMapping';
import { parseDateColumn } from './normalize/dates';
import { normalizeRow } from './normalize/normalizeRow';
import type {
  BasisBox,
  BatchSource,
  Cents,
  ColumnMapping,
  ImportBatch,
  NormalizedTransaction,
  RawRow,
} from './types';

export interface BuildBatchInput {
  label: string;
  sourceFileName: string;
  source: BatchSource;
  basisBox: BasisBox;
  rows: RawRow[];
  mapping: ColumnMapping;
  makeId: () => string;
  mappingPresetId?: string;
  sourceTotals?: { proceeds: Cents | null; costBasis: Cents | null };
  /** Pre-resolved term for every row (PDF sections carry their term). */
  forcedTerm?: 'short' | 'long';
}

/**
 * The full ingest pipeline for one file/section: mapping → column-level date
 * format locking → per-row normalization. Shared by CSV and PDF imports.
 */
export function buildBatch(input: BuildBatchInput): ImportBatch {
  const mapped = applyMapping(input.rows, input.mapping);

  // Lock the date format per column across the whole batch.
  const soldLock = parseDateColumn(mapped.map((m) => m.dateSold)).lockedFormat;
  const acquiredLock = parseDateColumn(mapped.map((m) => m.dateAcquired)).lockedFormat;
  const dateFormatHint = soldLock ?? acquiredLock;

  const transactions: NormalizedTransaction[] = mapped.map((m) => {
    const tx = normalizeRow(m, {
      makeId: input.makeId,
      ...(dateFormatHint ? { dateFormatHint } : {}),
    });
    if (input.forcedTerm && tx.term === null) {
      tx.term = input.forcedTerm;
      tx.issues = tx.issues.filter((i) => i.code !== 'TERM_UNKNOWN');
    }
    return tx;
  });

  const batch: ImportBatch = {
    id: input.makeId(),
    label: input.label,
    sourceFileName: input.sourceFileName,
    source: input.source,
    basisBox: input.basisBox,
    transactions,
  };
  if (input.mappingPresetId) batch.mappingPresetId = input.mappingPresetId;
  if (input.sourceTotals) batch.sourceTotals = input.sourceTotals;
  return batch;
}

/**
 * Reconciliation check: compare computed batch totals (exact cents) against
 * totals printed in the source document, with a small per-row tolerance for
 * source documents that round per row.
 */
export function reconcileBatch(batch: ImportBatch): {
  ok: boolean;
  proceedsDelta: Cents;
  basisDelta: Cents;
} | null {
  if (!batch.sourceTotals) return null;
  const included = batch.transactions.filter((t) => !t.excluded);
  const proceeds = included.reduce((sum, t) => sum + t.proceeds, 0);
  const basis = included.reduce((sum, t) => sum + t.costBasis, 0);
  const tolerance = Math.max(2, included.length * 1); // ≤1¢ per row of rounding drift

  const proceedsDelta =
    batch.sourceTotals.proceeds === null ? 0 : proceeds - batch.sourceTotals.proceeds;
  // Source "cost basis" candidate may actually be another column; only treat
  // it as a mismatch when both totals are present.
  const basisDelta =
    batch.sourceTotals.costBasis === null ? 0 : basis - batch.sourceTotals.costBasis;

  return {
    ok: Math.abs(proceedsDelta) <= tolerance && Math.abs(basisDelta) <= tolerance,
    proceedsDelta,
    basisDelta,
  };
}
