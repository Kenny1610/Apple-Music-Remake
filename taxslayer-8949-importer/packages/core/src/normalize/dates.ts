import { format as formatDate, isValid, parse } from 'date-fns';
import type { TxDate } from '../types';

/**
 * Ordered list of accepted date formats. US-broker conventions first; the
 * format that successfully parses a column is locked in via `dateFormatHint`
 * so a single file can't mix interpretations.
 */
export const DATE_FORMATS = [
  'MM/dd/yyyy',
  'M/d/yyyy',
  'MM/dd/yy',
  'M/d/yy',
  'yyyy-MM-dd',
  'MM-dd-yyyy',
  'M-d-yyyy',
  'dd-MMM-yyyy',
  'dd-MMM-yy',
  'MMM d, yyyy',
  'MMMM d, yyyy',
  'yyyyMMdd',
] as const;

const REFERENCE_DATE = new Date(2000, 0, 1);

/** Strip an ISO-8601 time suffix (crypto exports: "2025-03-01T14:22:05Z"). */
function stripTime(s: string): string {
  const isoWithTime = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/.exec(s);
  if (isoWithTime) return isoWithTime[1]!;
  // "03/01/2025 14:22:05" style
  const usWithTime = /^([\d/.-]+)\s+\d{1,2}:\d{2}/.exec(s);
  if (usWithTime) return usWithTime[1]!;
  return s;
}

/** Normalize a rendered/input date string into comparable tokens:
 * lowercase, split on non-alphanumerics, strip leading zeros of numbers. */
function dateTokens(s: string): string {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t !== '')
    .map((t) => (/^\d+$/.test(t) ? String(Number.parseInt(t, 10)) : t))
    .join('|');
}

function tryFormat(s: string, fmt: string): string | null {
  const d = parse(s, fmt, REFERENCE_DATE);
  if (!isValid(d)) return null;
  // Guard against lenient parses like "3/1/25" read as year 0025 by a
  // yyyy format — transaction dates are always modern.
  const year = d.getFullYear();
  if (year < 1900 || year > 2200) return null;
  // Round-trip guard: the parsed value must render back to the same fields
  // (modulo zero-padding and case), or the format didn't really match.
  if (dateTokens(formatDate(d, fmt)) !== dateTokens(s)) return null;
  return formatDate(d, 'yyyy-MM-dd');
}

export interface ParsedTxDate {
  date: TxDate;
  /** The format that matched, so callers can lock a column format. */
  matchedFormat?: string;
}

/**
 * Parse a transaction date cell. Recognizes "Various"/"VAR", "Inherited",
 * and blanks as first-class values. `hint` (a date-fns format) is tried
 * first and, when it matches, no other format is attempted.
 */
export function parseTxDate(input: string | null | undefined, hint?: string): ParsedTxDate {
  if (input == null) return { date: { kind: 'unknown' } };
  const raw = input.trim();
  if (raw === '' || raw === '-' || /^n\/?a$/i.test(raw)) return { date: { kind: 'unknown' } };
  if (/^var(ious)?\.?$/i.test(raw)) return { date: { kind: 'various' } };
  if (/^inherit(ed)?$/i.test(raw)) return { date: { kind: 'inherited' } };

  const s = stripTime(raw);

  if (hint) {
    const iso = tryFormat(s, hint);
    if (iso) return { date: { kind: 'date', iso }, matchedFormat: hint };
  }

  for (const fmt of DATE_FORMATS) {
    const iso = tryFormat(s, fmt);
    if (iso) return { date: { kind: 'date', iso }, matchedFormat: fmt };
  }

  return { date: { kind: 'unknown' } };
}

/** Column-level parse: locks the first matching format for the whole column. */
export function parseDateColumn(values: (string | null | undefined)[]): {
  dates: TxDate[];
  lockedFormat?: string;
} {
  let locked: string | undefined;
  const dates: TxDate[] = [];
  for (const v of values) {
    const { date, matchedFormat } = parseTxDate(v, locked);
    if (!locked && matchedFormat) locked = matchedFormat;
    dates.push(date);
  }
  // Second pass with the locked format so rows *before* the lock can't have
  // been interpreted under a different format.
  if (locked) {
    return {
      dates: values.map((v) => parseTxDate(v, locked).date),
      lockedFormat: locked,
    };
  }
  return { dates };
}

/** Render a TxDate for display and for the Form 8949 statement column (b)/(c). */
export function formatTxDate(d: TxDate): string {
  switch (d.kind) {
    case 'date': {
      const [y, m, day] = d.iso.split('-');
      return `${m}/${day}/${y}`;
    }
    case 'various':
      return 'Various';
    case 'inherited':
      return 'INHERITED';
    case 'unknown':
      return '';
  }
}
