import type { Term, TxDate } from '../types';

/**
 * Holding-period rule: the period starts the day AFTER acquisition, so a sale
 * is long-term only if it happens more than one year after the acquisition
 * date — i.e. strictly after the first anniversary. Selling exactly on the
 * anniversary is still short-term.
 */
export function computeTerm(dateAcquired: TxDate, dateSold: TxDate): Term | null {
  if (dateAcquired.kind === 'inherited') return 'long';
  if (dateAcquired.kind !== 'date' || dateSold.kind !== 'date') return null;

  const acquired = isoToUtc(dateAcquired.iso);
  const sold = isoToUtc(dateSold.iso);
  if (acquired === null || sold === null) return null;

  const anniversary = addOneYearUtc(dateAcquired.iso);
  return sold > anniversary ? 'long' : 'short';
}

/** Interpret a mapped term-indicator cell ("S", "ST", "Short", "Long-term", ...). */
export function parseTermIndicator(input: string | null | undefined): Term | null {
  if (input == null) return null;
  const s = input.trim();
  if (/^(s|st|short)\b/i.test(s) || /^short/i.test(s)) return 'short';
  if (/^(l|lt|long)\b/i.test(s) || /^long/i.test(s)) return 'long';
  return null;
}

function isoToUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** First anniversary of an ISO date, in UTC ms (Feb 29 → Feb 28 next year is
 * actually Mar 1 per Date.UTC overflow; the IRS anniversary of Feb 29 is
 * treated as Mar 1, which Date.UTC produces naturally). */
function addOneYearUtc(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)!;
  return Date.UTC(Number(m[1]) + 1, Number(m[2]) - 1, Number(m[3]));
}
