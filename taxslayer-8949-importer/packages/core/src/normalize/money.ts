import type { Cents } from '../types';

/**
 * The single string→money gateway. Integer math only — the string is split on
 * the decimal point and each part parsed as an integer, so no float
 * multiplication can corrupt a value.
 *
 * Handles: "$1,234.56", "(1,234.56)" (negative), "-1234.56", "1234.56-"
 * (trailing minus, used by some brokers), "€1 234,56" is NOT supported (US
 * formats only), bare integers ("1234"), single-decimal ("12.5" → 1250),
 * currency symbols and whitespace.
 *
 * Returns null for blank or unparseable input.
 */
export function parseCents(input: string | null | undefined): Cents | null {
  if (input == null) return null;
  let s = input.trim();
  if (s === '' || s === '-' || s === '--' || /^n\/?a$/i.test(s)) return null;

  let negative = false;

  // Parenthesized negatives: (1,234.56)
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  // Leading minus
  if (s.startsWith('-')) {
    negative = !negative ? true : negative;
    s = s.slice(1).trim();
  }
  // Trailing minus (broker exports like "123.45-")
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  // Strip currency symbols, commas, spaces
  s = s.replace(/[$,\s]/g, '');
  if (s === '') return null;

  const match = /^(\d+)(?:\.(\d{0,4}))?$/.exec(s);
  if (!match) return null;

  const wholePart = match[1]!;
  const fracRaw = match[2] ?? '';

  // Whole dollars as integer cents
  const whole = Number.parseInt(wholePart, 10);
  if (!Number.isSafeInteger(whole)) return null;

  // Fraction: pad/truncate to cents with round-half-up on the third digit
  const frac2 = fracRaw.padEnd(2, '0').slice(0, 2);
  let cents = whole * 100 + (frac2 === '' ? 0 : Number.parseInt(frac2, 10));
  if (fracRaw.length > 2) {
    const thirdDigit = Number.parseInt(fracRaw[2]!, 10);
    if (thirdDigit >= 5) cents += 1;
  }

  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Format cents as a plain dollar string, e.g. -123456 → "-1,234.56". */
export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withCommas}.${rem.toString().padStart(2, '0')}`;
}

/** Format whole dollars (already-rounded cents), e.g. -123400 → "-1,234". */
export function formatWholeDollars(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const dollars = Math.round(Math.abs(cents) / 100);
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withCommas}`;
}
