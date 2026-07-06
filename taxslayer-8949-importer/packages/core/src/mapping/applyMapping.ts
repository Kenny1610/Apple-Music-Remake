import { parseCents } from '../normalize/money';
import type { ColumnMapping, MappedTransaction, RawRow } from '../types';

/** Trim trailing zeros from a decimal quantity string: "100.5000" → "100.5". */
function trimQuantity(q: string): string {
  const t = q.trim();
  if (!/^\d*\.?\d+$/.test(t)) return t;
  if (!t.includes('.')) return t;
  return t.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Pure projection of raw rows through a column mapping. Composes the
 * description from quantity + asset name ("0.5 BTC") when configured.
 */
export function applyMapping(rows: RawRow[], mapping: ColumnMapping): MappedTransaction[] {
  const get = (row: RawRow, header: string | undefined): string =>
    header ? (row.cells[header] ?? '') : '';

  // A wash-sale-disallowed amount column with no separate code column implies
  // Form 8949 code W on every row that carries an amount — column (f) must
  // name the code when column (g) has an adjustment.
  const impliedWashCode =
    mapping.fields.adjustmentAmount !== undefined &&
    mapping.fields.adjustmentCode === undefined &&
    /wash/i.test(mapping.fields.adjustmentAmount);

  return rows.map((row) => {
    let description: string;
    if (mapping.descriptionMode === 'quantity-plus-asset') {
      const qty = trimQuantity(get(row, mapping.fields.quantity));
      const asset = get(row, mapping.fields.assetName).trim();
      description = [qty, asset].filter((s) => s !== '').join(' ');
    } else {
      description = get(row, mapping.fields.description).trim();
    }

    const mapped: MappedTransaction = {
      sourceRowIndex: row.index,
      description,
      dateAcquired: get(row, mapping.fields.dateAcquired),
      dateSold: get(row, mapping.fields.dateSold),
      proceeds: get(row, mapping.fields.proceeds),
      costBasis: get(row, mapping.fields.costBasis),
    };
    if (mapping.fields.adjustmentAmount) {
      const amount = get(row, mapping.fields.adjustmentAmount);
      mapped.adjustmentAmount = amount;
      if (impliedWashCode) {
        const cents = parseCents(amount);
        if (cents !== null && cents !== 0) mapped.adjustmentCode = 'W';
      }
    }
    if (mapping.fields.adjustmentCode) {
      mapped.adjustmentCode = get(row, mapping.fields.adjustmentCode);
    }
    if (mapping.fields.termIndicator) {
      mapped.termIndicator = get(row, mapping.fields.termIndicator);
    }
    if (mapping.fields.gainLoss) {
      mapped.gainLoss = get(row, mapping.fields.gainLoss);
    }
    return mapped;
  });
}
