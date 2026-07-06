import {
  type CategoryTotals,
  type Form8949Category,
  type ImportBatch,
  type RoundingMode,
  applyRounding,
  categorize,
  formatCents,
  formatTxDate,
  formatWholeDollars,
  isShortTermCategory,
} from '@tsp8949/core';

/** Data rows per statement page (Letter portrait, 7.5pt rows). */
export const ROWS_PER_PAGE = 50;

export interface StatementRow {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: string;
  costBasis: string;
  code: string;
  adjustment: string;
  gainLoss: string;
  bold?: boolean;
}

export interface StatementPage {
  category: Form8949Category;
  /** e.g. "Part I (Short-Term) — Box A checked" */
  heading: string;
  rows: StatementRow[];
  /** page number within this category's page run, 1-based */
  categoryPage: number;
  categoryPageCount: number;
}

export interface StatementMeta {
  clientName: string;
  tin: string;
  taxYear: number;
}

function money(cents: number, mode: RoundingMode): string {
  if (cents === 0) return '';
  const text = mode === 'whole-dollar' ? formatWholeDollars(cents) : formatCents(cents);
  // IRS style: losses/negative adjustments in parentheses
  return cents < 0 ? `(${text.slice(1)})` : text;
}

function moneyAlways(cents: number, mode: RoundingMode): string {
  const text = mode === 'whole-dollar' ? formatWholeDollars(cents) : formatCents(cents);
  return cents < 0 ? `(${text.slice(1)})` : text;
}

export function categoryHeading(category: Form8949Category): string {
  const part = isShortTermCategory(category) ? 'Part I (Short-Term)' : 'Part II (Long-Term)';
  return `${part} — Box ${category} checked`;
}

/**
 * Build the full page plan: rows grouped by category in A–F order, each
 * category ending with a bold TOTALS row that matches the keyed-in summary
 * exactly (same applyRounding transform as the Totals screen).
 */
export function planStatementPages(
  batches: ImportBatch[],
  mode: RoundingMode,
  totals: CategoryTotals[],
): StatementPage[] {
  const byCategory = new Map<Form8949Category, StatementRow[]>();
  for (const { tx, category } of categorize(batches)) {
    const amounts = applyRounding(tx, mode);
    const rows = byCategory.get(category) ?? [];
    rows.push({
      description: tx.description,
      dateAcquired: formatTxDate(tx.dateAcquired),
      dateSold: formatTxDate(tx.dateSold),
      proceeds: moneyAlways(amounts.proceeds, mode),
      costBasis: moneyAlways(amounts.costBasis, mode),
      code: tx.adjustmentCodes.join(' '),
      adjustment: money(amounts.adjustment, mode),
      gainLoss: moneyAlways(amounts.gainLoss, mode),
    });
    byCategory.set(category, rows);
  }

  const pages: StatementPage[] = [];
  for (const categoryTotal of totals) {
    const rows = byCategory.get(categoryTotal.category);
    if (!rows || rows.length === 0) continue;

    const totalsRow: StatementRow = {
      description: `TOTALS — ${rows.length} transaction${rows.length === 1 ? '' : 's'}`,
      dateAcquired: '',
      dateSold: '',
      proceeds: moneyAlways(categoryTotal.proceeds, mode),
      costBasis: moneyAlways(categoryTotal.costBasis, mode),
      code: '',
      adjustment: money(categoryTotal.adjustment, mode),
      gainLoss: moneyAlways(categoryTotal.gainLoss, mode),
      bold: true,
    };
    const allRows = [...rows, totalsRow];

    const categoryPages: StatementRow[][] = [];
    for (let i = 0; i < allRows.length; i += ROWS_PER_PAGE) {
      categoryPages.push(allRows.slice(i, i + ROWS_PER_PAGE));
    }
    categoryPages.forEach((pageRows, idx) => {
      pages.push({
        category: categoryTotal.category,
        heading: categoryHeading(categoryTotal.category),
        rows: pageRows,
        categoryPage: idx + 1,
        categoryPageCount: categoryPages.length,
      });
    });
  }
  return pages;
}

/**
 * Split a page plan into `fileCount` chunks, preferring cuts at category
 * boundaries (within a small look-around) so subtotals stay with their
 * transactions whenever possible.
 */
export function splitPlan(pages: StatementPage[], fileCount: number): StatementPage[][] {
  if (fileCount <= 1 || pages.length <= 1) return [pages];
  const target = Math.ceil(pages.length / fileCount);
  const chunks: StatementPage[][] = [];
  let current: StatementPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    current.push(pages[i]!);
    const isLastPage = i === pages.length - 1;
    if (isLastPage) break;

    const reachedTarget = current.length >= target;
    if (!reachedTarget) continue;

    // Prefer cutting where the next page starts a new category; look ahead
    // up to 2 pages for a boundary before cutting mid-category.
    const boundaryHere = pages[i + 1]!.category !== pages[i]!.category;
    const boundaryWithin2 =
      (i + 2 < pages.length && pages[i + 2]!.category !== pages[i + 1]!.category) ||
      (i + 3 < pages.length && pages[i + 3]!.category !== pages[i + 2]!.category);
    if (boundaryHere || !boundaryWithin2 || current.length >= target + 2) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
