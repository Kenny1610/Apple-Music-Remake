import type { Cents, NormalizedTransaction, RoundingMode } from '../types';
import { gainLoss } from '../types';

/**
 * IRS whole-dollar rounding: 50 cents and up rounds away from zero.
 * -150¢ → -200¢ (i.e. -$2), 149¢ → 100¢ ($1). Result stays in cents
 * (a multiple of 100) so all downstream math remains integer cents.
 */
export function roundToWholeDollar(cents: Cents): Cents {
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return sign * (dollars + (rem >= 50 ? 1 : 0)) * 100;
}

export interface RoundedAmounts {
  proceeds: Cents;
  costBasis: Cents;
  adjustment: Cents;
  gainLoss: Cents;
}

/**
 * The single rounding transform. In whole-dollar mode each transaction's
 * proceeds/basis/adjustment are rounded per IRS convention and gain/loss is
 * recomputed FROM THE ROUNDED VALUES, so per-row amounts, statement
 * subtotals, and the keyed-in totals agree to the penny by construction.
 * Underlying data always stays exact cents — this is a view/export transform.
 */
export function applyRounding(tx: NormalizedTransaction, mode: RoundingMode): RoundedAmounts {
  if (mode === 'cents') {
    return {
      proceeds: tx.proceeds,
      costBasis: tx.costBasis,
      adjustment: tx.adjustmentAmount,
      gainLoss: gainLoss(tx),
    };
  }
  const proceeds = roundToWholeDollar(tx.proceeds);
  const costBasis = roundToWholeDollar(tx.costBasis);
  const adjustment = roundToWholeDollar(tx.adjustmentAmount);
  return {
    proceeds,
    costBasis,
    adjustment,
    gainLoss: proceeds - costBasis + adjustment,
  };
}
