/**
 * Domain model for the TaxSlayer Pro 8949 Importer.
 *
 * Money is ALWAYS integer cents (`Cents`). No floating-point dollar values
 * cross a module boundary; `parseCents` in normalize/money.ts is the only
 * string→money gateway.
 */

/** Integer cents. Safe: |values| < 2^53. */
export type Cents = number;

/**
 * A transaction date. "Various" and "Inherited" are legitimate values on
 * Form 8949 (they print literally in column (b)), so they are first-class
 * variants rather than parse failures.
 */
export type TxDate =
  | { kind: 'date'; iso: string } // 'YYYY-MM-DD'
  | { kind: 'various' }
  | { kind: 'inherited' } // always long-term
  | { kind: 'unknown' }; // blank/unparseable → needs user attention

/** One parsed line of a source file, keyed by header. */
export interface RawRow {
  index: number;
  cells: Record<string, string>;
}

export type MappableField =
  | 'description'
  | 'quantity'
  | 'assetName'
  | 'dateAcquired'
  | 'dateSold'
  | 'proceeds'
  | 'costBasis'
  | 'adjustmentAmount'
  | 'adjustmentCode'
  | 'termIndicator'
  | 'gainLoss'; // imported only as a cross-check, never trusted

export const REQUIRED_FIELDS: readonly MappableField[] = [
  'dateSold',
  'proceeds',
  'costBasis',
] as const;

export type DescriptionMode = 'single-column' | 'quantity-plus-asset';

export interface ColumnMapping {
  /** field → CSV header it comes from */
  fields: Partial<Record<MappableField, string>>;
  descriptionMode: DescriptionMode;
  /** date-fns format string locked in after first successful column parse */
  dateFormatHint?: string;
}

export interface MappingPreset {
  id: string;
  /** user-editable, e.g. "Fidelity 1099-B" */
  name: string;
  /** SHA-256 of the normalized header signature */
  fingerprint: string;
  /** original headers, for display and fuzzy fallback matching */
  headers: string[];
  mapping: ColumnMapping;
  defaultBox?: BasisBox;
  lastUsed: string; // ISO timestamp
}

/** After mapping, before normalization — still raw strings. */
export interface MappedTransaction {
  sourceRowIndex: number;
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: string;
  costBasis: string;
  adjustmentAmount?: string;
  adjustmentCode?: string;
  termIndicator?: string;
  gainLoss?: string;
}

export type Term = 'short' | 'long';

/**
 * Basis-reporting box for a batch. Short-term A/B/C map to long-term D/E/F:
 *  A/D — reported on 1099-B, basis reported to IRS
 *  B/E — reported on 1099-B, basis NOT reported
 *  C/F — not reported on a 1099-B (typical for crypto)
 */
export type BasisBox = 'A' | 'B' | 'C';

export type Form8949Category = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type RowIssueCode =
  | 'BAD_DATE'
  | 'BAD_AMOUNT'
  | 'MISSING_BASIS'
  | 'MISSING_PROCEEDS'
  | 'MISSING_DESCRIPTION'
  | 'SOLD_BEFORE_ACQUIRED'
  | 'TERM_UNKNOWN'
  | 'BAD_ADJ_CODE'
  | 'GAIN_MISMATCH'
  | 'LOW_CONFIDENCE_EXTRACTION';

export interface RowIssue {
  field: MappableField | 'row';
  severity: 'error' | 'warning';
  code: RowIssueCode;
  message: string;
}

export interface NormalizedTransaction {
  /** stable id for grid editing */
  id: string;
  sourceRowIndex: number;
  description: string;
  dateAcquired: TxDate;
  dateSold: TxDate;
  proceeds: Cents;
  costBasis: Cents;
  /** 0 if none; sign per Form 8949 (wash sale code W → positive) */
  adjustmentAmount: Cents;
  /** e.g. ['W'] */
  adjustmentCodes: string[];
  /** auto-computed from dates; null = cannot determine */
  term: Term | null;
  /** user override always wins over `term` */
  termOverride: Term | null;
  /** user can drop a row (e.g. a non-taxable transfer) */
  excluded: boolean;
  issues: RowIssue[];
}

/** Where an import batch came from. */
export type BatchSource = 'csv' | 'pdf';

export interface ImportBatch {
  id: string;
  /** e.g. "Fidelity 1099-B" or "Coinbase 2025" */
  label: string;
  sourceFileName: string;
  source: BatchSource;
  basisBox: BasisBox;
  transactions: NormalizedTransaction[];
  mappingPresetId?: string;
  /**
   * Totals printed in the source document itself (a detected "Total" row in a
   * CSV or a totals line in a PDF), kept for reconciliation cross-checks.
   */
  sourceTotals?: { proceeds: Cents | null; costBasis: Cents | null };
}

export interface CategoryTotals {
  category: Form8949Category;
  count: number;
  proceeds: Cents;
  costBasis: Cents;
  adjustment: Cents;
  gainLoss: Cents;
}

export type RoundingMode = 'cents' | 'whole-dollar';

export interface ClientSession {
  schemaVersion: 1;
  /** "Last, First" */
  clientName: string;
  /** SSN/EIN as formatted by the preparer. PII — lives only in this file. */
  tin: string;
  taxYear: number;
  batches: ImportBatch[];
  roundingMode: RoundingMode;
  createdAt: string;
  modifiedAt: string;
}

/** The effective term of a transaction (override wins). */
export function effectiveTerm(tx: NormalizedTransaction): Term | null {
  return tx.termOverride ?? tx.term;
}

/** Derived, never stored: proceeds − basis + adjustment. */
export function gainLoss(tx: {
  proceeds: Cents;
  costBasis: Cents;
  adjustmentAmount: Cents;
}): Cents {
  return tx.proceeds - tx.costBasis + tx.adjustmentAmount;
}
