import {
  type CategoryTotals,
  type Form8949Category,
  type RoundingMode,
  formatCents,
  formatWholeDollars,
  isShortTermCategory,
} from '@tsp8949/core';

export type EntryField = 'proceeds' | 'costBasis' | 'adjustment' | 'gainLoss';

export interface EntryItem {
  category: Form8949Category;
  field: EntryField;
  /** e.g. "Box A (Short-term) — Proceeds" */
  label: string;
  /** plain typeable text: no commas, "-" for negatives, decimals only in cents mode */
  value: string;
}

export interface BuildQueueOptions {
  roundingMode: RoundingMode;
  /** TaxSlayer computes gain/loss itself, so this defaults to off */
  includeGainLoss?: boolean;
}

const FIELD_LABELS: Record<EntryField, string> = {
  proceeds: 'Proceeds',
  costBasis: 'Cost basis',
  adjustment: 'Adjustment',
  gainLoss: 'Gain/loss',
};

/** Format cents as typeable text matching the on-screen value minus commas. */
export function typeableValue(cents: number, mode: RoundingMode): string {
  const text = mode === 'whole-dollar' ? formatWholeDollars(cents) : formatCents(cents);
  return text.replace(/,/g, '');
}

/**
 * Build the ordered queue of values the preparer enters into TaxSlayer Pro's
 * "exception to reporting each transaction" screen — boxes in A→F order,
 * proceeds → cost basis → adjustment (only when nonzero) → gain/loss (only
 * when opted in). Values use the same rounding transform as the totals cards
 * and the statement PDF, so what gets typed is exactly what's on screen.
 */
export function buildQueue(totals: CategoryTotals[], options: BuildQueueOptions): EntryItem[] {
  const queue: EntryItem[] = [];
  for (const t of totals) {
    if (t.count === 0) continue;
    const boxLabel = `Box ${t.category} (${isShortTermCategory(t.category) ? 'Short-term' : 'Long-term'})`;
    const push = (field: EntryField, cents: number) =>
      queue.push({
        category: t.category,
        field,
        label: `${boxLabel} — ${FIELD_LABELS[field]}`,
        value: typeableValue(cents, options.roundingMode),
      });

    push('proceeds', t.proceeds);
    push('costBasis', t.costBasis);
    if (t.adjustment !== 0) push('adjustment', t.adjustment);
    if (options.includeGainLoss) push('gainLoss', t.gainLoss);
  }
  return queue;
}
