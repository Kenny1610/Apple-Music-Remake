import { categorize } from '../categorize/buckets';
import type { CategoryTotals, Form8949Category, ImportBatch, RoundingMode } from '../types';
import { applyRounding } from './rounding';

export const CATEGORY_ORDER: readonly Form8949Category[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Fold all includable, term-resolved transactions into the six Form 8949
 * category buckets. These are exactly the numbers the preparer keys into
 * TaxSlayer Pro Desktop under "Exception to reporting each transaction",
 * so the rounding mode used here MUST match the statement PDF (it does:
 * both call applyRounding).
 */
export function summarize(batches: ImportBatch[], mode: RoundingMode): CategoryTotals[] {
  const buckets = new Map<Form8949Category, CategoryTotals>();
  for (const category of CATEGORY_ORDER) {
    buckets.set(category, {
      category,
      count: 0,
      proceeds: 0,
      costBasis: 0,
      adjustment: 0,
      gainLoss: 0,
    });
  }

  for (const { tx, category } of categorize(batches)) {
    const bucket = buckets.get(category)!;
    const amounts = applyRounding(tx, mode);
    bucket.count += 1;
    bucket.proceeds += amounts.proceeds;
    bucket.costBasis += amounts.costBasis;
    bucket.adjustment += amounts.adjustment;
    bucket.gainLoss += amounts.gainLoss;
  }

  return CATEGORY_ORDER.map((c) => buckets.get(c)!);
}

/** Only the categories that actually have transactions. */
export function nonEmptyTotals(totals: CategoryTotals[]): CategoryTotals[] {
  return totals.filter((t) => t.count > 0);
}
