/**
 * Pure table reconstruction from positioned PDF text.
 *
 * Layer 1 (the app's pdfExtract.worker.ts, pdfjs-dist) extracts text items
 * with x/y coordinates. This module — Layer 2 — turns those positioned items
 * into lines and columns with no pdfjs dependency, so it is fully testable
 * against JSON fixtures.
 *
 * PDF coordinate convention: y increases UPWARD (pdfjs transform[5]); this
 * module sorts lines by descending y within a page.
 */

export interface PositionedText {
  text: string;
  /** left edge */
  x: number;
  /** baseline y (PDF space, increases upward) */
  y: number;
  width: number;
  page: number;
}

export interface TextLine {
  page: number;
  y: number;
  items: PositionedText[];
  /** items joined left-to-right with single spaces */
  text: string;
}

/** Vertical tolerance for grouping items into one line (in PDF units). */
const LINE_Y_TOLERANCE = 2.5;

/** Group positioned items into lines: same page, y within tolerance. */
export function groupIntoLines(items: PositionedText[]): TextLine[] {
  const byPage = new Map<number, PositionedText[]>();
  for (const item of items) {
    if (item.text.trim() === '') continue;
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }

  const lines: TextLine[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const pageItems = byPage.get(page)!.sort((a, b) => b.y - a.y || a.x - b.x);
    let current: PositionedText[] = [];
    let currentY: number | null = null;
    const flush = () => {
      if (current.length === 0) return;
      const sorted = [...current].sort((a, b) => a.x - b.x);
      lines.push({
        page,
        y: currentY!,
        items: sorted,
        text: sorted
          .map((i) => i.text.trim())
          .filter((t) => t !== '')
          .join(' '),
      });
    };
    for (const item of pageItems) {
      if (currentY === null || Math.abs(item.y - currentY) <= LINE_Y_TOLERANCE) {
        current.push(item);
        currentY = currentY === null ? item.y : currentY;
      } else {
        flush();
        current = [item];
        currentY = item.y;
      }
    }
    flush();
  }
  return lines;
}

export interface ColumnBand {
  /** inclusive left edge */
  left: number;
  /** exclusive right edge */
  right: number;
  /** center of the header cell that anchored this band */
  center: number;
}

/**
 * Build column bands from a header line's item positions. Each header item
 * anchors a band; band boundaries are midpoints between adjacent headers.
 */
export function columnBandsFromHeader(headerItems: PositionedText[]): ColumnBand[] {
  const sorted = [...headerItems].sort((a, b) => a.x - b.x);
  const centers = sorted.map((i) => i.x + i.width / 2);
  return centers.map((center, idx) => {
    const prev = idx > 0 ? centers[idx - 1]! : Number.NEGATIVE_INFINITY;
    const next = idx < centers.length - 1 ? centers[idx + 1]! : Number.POSITIVE_INFINITY;
    return {
      left: idx === 0 ? Number.NEGATIVE_INFINITY : (prev + center) / 2,
      right: idx === centers.length - 1 ? Number.POSITIVE_INFINITY : (center + next) / 2,
      center,
    };
  });
}

/**
 * Assign a line's items to column bands by item center. Items that share a
 * band are concatenated in x-order (handles split text runs); returns one
 * cell string per band.
 */
export function lineToCells(line: TextLine, bands: ColumnBand[]): string[] {
  const cells: string[][] = bands.map(() => []);
  for (const item of line.items) {
    const center = item.x + item.width / 2;
    let bandIdx = bands.findIndex((b) => center >= b.left && center < b.right);
    if (bandIdx === -1) bandIdx = center < bands[0]!.center ? 0 : bands.length - 1;
    cells[bandIdx]!.push(item.text.trim());
  }
  return cells.map((parts) => parts.join(' ').trim());
}
