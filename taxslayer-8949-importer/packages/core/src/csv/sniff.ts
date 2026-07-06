import { parseCents } from '../normalize/money';
import type { Cents, RawRow } from '../types';

/**
 * Header words that identify the real header row inside broker exports that
 * prepend preamble junk (account info, disclaimers) before the table.
 */
const HEADER_WORDS = [
  /descript/i,
  /symbol/i,
  /security/i,
  /asset/i,
  /quantity|shares|qty/i,
  /acquir|open|bought|purchase/i,
  /sold|sale|close|disposed/i,
  /proceed|amount/i,
  /cost|basis/i,
  /gain|loss/i,
  /date/i,
  /term/i,
  /wash/i,
];

function headerWordHits(cells: string[]): number {
  let hits = 0;
  for (const cell of cells) {
    if (cell.trim() === '') continue;
    if (HEADER_WORDS.some((re) => re.test(cell))) hits++;
  }
  return hits;
}

export interface SniffResult {
  /** Index (into the input rows) of the detected header row. */
  headerRowIndex: number;
  headers: string[];
  /** Data rows keyed by header, preamble and total rows removed. */
  rows: RawRow[];
  /** Amounts from a detected trailing "Total" row, for reconciliation. */
  sourceTotals?: { proceeds: Cents | null; costBasis: Cents | null };
}

/**
 * Post-process a loosely parsed CSV (array-of-arrays, as PapaParse emits with
 * header:false) into header + data rows:
 *  - skip preamble junk before the real header row (≥3 header-word hits)
 *  - dedupe/trim headers ("" → "Column N", repeats → "Header (2)")
 *  - drop trailing rows whose first non-empty cell matches /total/i, keeping
 *    their proceeds/basis amounts for a reconciliation cross-check
 */
export function sniff(table: string[][]): SniffResult {
  if (table.length === 0) return { headerRowIndex: 0, headers: [], rows: [] };

  // Find the best header candidate in the first 20 lines.
  let headerRowIndex = 0;
  let bestHits = headerWordHits(table[0] ?? []);
  const scanLimit = Math.min(table.length, 20);
  for (let i = 1; i < scanLimit; i++) {
    const hits = headerWordHits(table[i] ?? []);
    if (hits >= 3 && hits > bestHits) {
      headerRowIndex = i;
      bestHits = hits;
    }
  }

  const rawHeaders = (table[headerRowIndex] ?? []).map((h) => h.trim());
  const headers: string[] = [];
  const seen = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    let name = h === '' ? `Column ${i + 1}` : h;
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    if (count > 0) name = `${name} (${count + 1})`;
    headers.push(name);
  });

  const rows: RawRow[] = [];
  let sourceTotals: SniffResult['sourceTotals'];

  for (let i = headerRowIndex + 1; i < table.length; i++) {
    const cells = table[i] ?? [];
    if (cells.every((c) => c.trim() === '')) continue;

    const firstNonEmpty = cells.find((c) => c.trim() !== '') ?? '';
    if (/^(sub)?totals?\b/i.test(firstNonEmpty.trim())) {
      // Keep the largest-magnitude money cells as candidate totals.
      const monies = cells
        .map((c) => parseCents(c))
        .filter((v): v is Cents => v !== null)
        .sort((a, b) => Math.abs(b) - Math.abs(a));
      sourceTotals = {
        proceeds: monies[0] ?? null,
        costBasis: monies[1] ?? null,
      };
      continue;
    }

    const record: Record<string, string> = {};
    headers.forEach((h, col) => {
      record[h] = (cells[col] ?? '').trim();
    });
    rows.push({ index: i, cells: record });
  }

  return { headerRowIndex, headers, rows, ...(sourceTotals ? { sourceTotals } : {}) };
}
