/**
 * Detect 1099-B transaction sections in reconstructed PDF lines and emit
 * RawRow[] shaped exactly like CSV output, so PDF imports flow through the
 * identical mapping-confirmation → review → totals pipeline.
 */

import { parseCents } from '../normalize/money';
import type { BasisBox, Cents, RawRow, Term } from '../types';
import {
  type ColumnBand,
  type PositionedText,
  type TextLine,
  columnBandsFromHeader,
  groupIntoLines,
  lineToCells,
} from './reconstructTable';

export interface DetectedSection {
  /** e.g. "Short-Term — Box A (basis reported to the IRS)" */
  label: string;
  term: Term | null;
  basisBox: BasisBox | null;
  headers: string[];
  rows: RawRow[];
  /** totals printed in the PDF for this section, for reconciliation */
  sourceTotals?: { proceeds: Cents | null; costBasis: Cents | null };
}

export interface Detect1099bResult {
  sections: DetectedSection[];
  /** true when the document had no extractable text (likely scanned) */
  looksScanned: boolean;
}

const SECTION_MARKERS: {
  pattern: RegExp;
  term: Term;
  box: BasisBox;
}[] = [
  { pattern: /short[\s-]*term.*(box\s*a\b|basis\s+(is\s+)?reported)/i, term: 'short', box: 'A' },
  {
    pattern: /short[\s-]*term.*(box\s*b\b|basis\s+(is\s+)?not\s+reported)/i,
    term: 'short',
    box: 'B',
  },
  {
    pattern: /short[\s-]*term.*(box\s*c\b|not\s+reported\s+on\s+(form\s+)?1099)/i,
    term: 'short',
    box: 'C',
  },
  { pattern: /long[\s-]*term.*(box\s*d\b|basis\s+(is\s+)?reported)/i, term: 'long', box: 'A' },
  {
    pattern: /long[\s-]*term.*(box\s*e\b|basis\s+(is\s+)?not\s+reported)/i,
    term: 'long',
    box: 'B',
  },
  {
    pattern: /long[\s-]*term.*(box\s*f\b|not\s+reported\s+on\s+(form\s+)?1099)/i,
    term: 'long',
    box: 'C',
  },
];

/** Loose fallbacks when the marker names only the term. */
const TERM_ONLY_MARKERS: { pattern: RegExp; term: Term }[] = [
  { pattern: /short[\s-]*term/i, term: 'short' },
  { pattern: /long[\s-]*term/i, term: 'long' },
];

const HEADER_PATTERNS: { header: string; pattern: RegExp }[] = [
  { header: 'Description', pattern: /descript|security|asset/i },
  { header: 'Quantity', pattern: /quantity|shares|qty/i },
  { header: 'Date Acquired', pattern: /acquir|open/i },
  { header: 'Date Sold', pattern: /sold|disposed|close/i },
  { header: 'Proceeds', pattern: /proceed/i },
  { header: 'Cost Basis', pattern: /cost|basis/i },
  { header: 'Wash Sale Adj', pattern: /wash|disallowed|adjust/i },
  { header: 'Gain/Loss', pattern: /gain|loss/i },
];

function isTransactionHeaderLine(
  line: TextLine,
): { headers: string[]; bands: ColumnBand[] } | null {
  if (line.items.length < 3) return null;
  const matched: string[] = [];
  for (const item of line.items) {
    const hit = HEADER_PATTERNS.find((p) => p.pattern.test(item.text));
    matched.push(hit ? hit.header : item.text.trim());
  }
  const hitCount = line.items.filter((item) =>
    HEADER_PATTERNS.some((p) => p.pattern.test(item.text)),
  ).length;
  // Require the columns that make a transaction table recognizable.
  const hasProceeds = line.items.some((i) => /proceed/i.test(i.text));
  const hasDate = line.items.some((i) => /date|sold|acquir/i.test(i.text));
  if (hitCount >= 3 && hasProceeds && hasDate) {
    return { headers: dedupe(matched), bands: columnBandsFromHeader(line.items) };
  }
  return null;
}

function dedupe(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h} (${count + 1})`;
  });
}

/** A data line must contain at least one money-looking and one date-looking cell. */
function looksLikeDataLine(cells: string[]): boolean {
  const hasMoney = cells.some((c) => parseCents(c) !== null && /\d/.test(c));
  const hasDate = cells.some(
    (c) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c.trim()) || /various|inherit/i.test(c),
  );
  return hasMoney && hasDate;
}

function isTotalsLine(text: string): boolean {
  return /^(sub)?totals?\b/i.test(text.trim()) || /\btotals?\s*:/i.test(text);
}

/**
 * Main entry: positioned text items (from pdfjs) → detected 1099-B sections.
 */
export function detect1099b(items: PositionedText[]): Detect1099bResult {
  const meaningful = items.filter((i) => i.text.trim() !== '');
  if (meaningful.length === 0) {
    return { sections: [], looksScanned: true };
  }

  const lines = groupIntoLines(meaningful);
  const sections: DetectedSection[] = [];

  let current: DetectedSection | null = null;
  let bands: ColumnBand[] | null = null;
  let pendingTerm: Term | null = null;
  let pendingBox: BasisBox | null = null;
  let rowIndex = 0;

  const finishSection = () => {
    if (current && current.rows.length > 0) sections.push(current);
    current = null;
    bands = null;
  };

  for (const line of lines) {
    // 1. Section markers update the pending term/box context.
    const marker = SECTION_MARKERS.find((m) => m.pattern.test(line.text));
    if (marker) {
      finishSection();
      pendingTerm = marker.term;
      pendingBox = marker.box;
      continue;
    }
    const termOnly = TERM_ONLY_MARKERS.find((m) => m.pattern.test(line.text));
    if (termOnly && line.text.length < 120 && !current) {
      pendingTerm = termOnly.term;
      continue;
    }

    // 2. A transaction header starts (or continues, page break) a section.
    const header = isTransactionHeaderLine(line);
    if (header) {
      if (current && sameHeaders(current.headers, header.headers)) {
        // same table continuing on a new page — keep accumulating, refresh bands
        bands = header.bands;
        continue;
      }
      finishSection();
      current = {
        label: sectionLabel(pendingTerm, pendingBox),
        term: pendingTerm,
        basisBox: pendingBox,
        headers: header.headers,
        rows: [],
      };
      bands = header.bands;
      continue;
    }

    if (!current || !bands) continue;

    // 3. Totals line closes the section and records reconciliation amounts.
    if (isTotalsLine(line.text)) {
      const monies = lineToCells(line, bands)
        .map((c) => parseCents(c))
        .filter((v): v is Cents => v !== null)
        .sort((a, b) => Math.abs(b) - Math.abs(a));
      current.sourceTotals = { proceeds: monies[0] ?? null, costBasis: monies[1] ?? null };
      finishSection();
      continue;
    }

    // 4. Data lines become rows; non-matching lines are either description
    //    continuations (append to previous row) or noise (skipped).
    const cells = lineToCells(line, bands);
    if (looksLikeDataLine(cells)) {
      const record: Record<string, string> = {};
      current.headers.forEach((h, i) => {
        record[h] = cells[i] ?? '';
      });
      current.rows.push({ index: rowIndex++, cells: record });
    } else if (
      current.rows.length > 0 &&
      cells.filter((c) => c !== '').length === 1 &&
      cells[0] !== '' &&
      !/page \d|continued|form 8949|1099/i.test(line.text)
    ) {
      // Single left-column fragment → multi-line description continuation.
      const last = current.rows[current.rows.length - 1]!;
      const firstHeader = current.headers[0]!;
      last.cells[firstHeader] = `${last.cells[firstHeader] ?? ''} ${cells[0]}`.trim();
    }
  }
  finishSection();

  return { sections, looksScanned: false };
}

function sameHeaders(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((h, i) => h === b[i]);
}

function sectionLabel(term: Term | null, box: BasisBox | null): string {
  const termLabel =
    term === 'short' ? 'Short-Term' : term === 'long' ? 'Long-Term' : 'Unknown term';
  if (box === null) return termLabel;
  const boxLetter = term === 'long' ? ({ A: 'D', B: 'E', C: 'F' } as const)[box] : box;
  const boxDesc =
    box === 'A'
      ? 'basis reported to the IRS'
      : box === 'B'
        ? 'basis NOT reported to the IRS'
        : 'not reported on a 1099-B';
  return `${termLabel} — Box ${boxLetter} (${boxDesc})`;
}
