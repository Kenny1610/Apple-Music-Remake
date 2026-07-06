import type { CategoryTotals, ImportBatch, RoundingMode } from '@tsp8949/core';
import { PDFDocument, type PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { type StatementMeta, type StatementPage, planStatementPages, splitPlan } from './paginate';

/** TaxSlayer Pro Desktop caps e-file PDF attachments at 2 MB; leave headroom. */
export const SIZE_LIMIT_BYTES = 2 * 1024 * 1024;
export const SIZE_SPLIT_THRESHOLD = Math.floor(1.8 * 1024 * 1024);

// Letter portrait geometry
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 36;
const HEADER_BOTTOM = PAGE_HEIGHT - 118;
const FOOTER_Y = 24;
const ROW_HEIGHT = 12;
const ROW_FONT_SIZE = 7.5;

/** Column layout matching Form 8949 columns (a)–(h). */
const COLUMNS = {
  description: { x: MARGIN_X, width: 148, align: 'left' as const, label: '(a) Description' },
  dateAcquired: { x: 188, width: 60, align: 'left' as const, label: '(b) Acquired' },
  dateSold: { x: 250, width: 60, align: 'left' as const, label: '(c) Sold' },
  proceeds: { x: 312, width: 62, align: 'right' as const, label: '(d) Proceeds' },
  costBasis: { x: 378, width: 62, align: 'right' as const, label: '(e) Cost basis' },
  code: { x: 444, width: 26, align: 'left' as const, label: '(f)' },
  adjustment: { x: 472, width: 52, align: 'right' as const, label: '(g) Adj.' },
  gainLoss: { x: 528, width: 48, align: 'right' as const, label: '(h) Gain/loss' },
};

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/** Replace characters WinAnsi/Helvetica cannot encode (control chars, non-Latin-1). */
function sanitize(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '\u2026') {
      out += ch;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 32 && code <= 255 ? ch : ' ';
  }
  return out;
}

export interface GeneratedStatement {
  fileName: string;
  bytes: Uint8Array;
}

async function renderPages(
  pages: StatementPage[],
  meta: StatementMeta,
  fileIndex: number,
  fileCount: number,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Form 8949 Statement — ${meta.clientName} — Tax Year ${meta.taxYear}`);
  doc.setProducer('TaxSlayer Pro 8949 Importer');
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.35, 0.35, 0.35);
  const black = rgb(0, 0, 0);

  pages.forEach((pageData, pageIdx) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    // --- header ---
    page.drawText('Form 8949 Statement (Exception 2 — see Form 8949 instructions)', {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 42,
      size: 11,
      font: bold,
      color: black,
    });
    page.drawText(sanitize(`${pageData.heading} — Tax Year ${meta.taxYear}`), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 58,
      size: 10,
      font: bold,
      color: black,
    });
    page.drawText(sanitize(`Name: ${meta.clientName}     SSN/TIN: ${meta.tin}`), {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 74,
      size: 9,
      font: helvetica,
      color: black,
    });
    if (pageData.categoryPage > 1) {
      page.drawText(
        `(Box ${pageData.category} continued — page ${pageData.categoryPage} of ${pageData.categoryPageCount})`,
        { x: MARGIN_X, y: PAGE_HEIGHT - 88, size: 8, font: helvetica, color: gray },
      );
    }

    // --- column header row ---
    const headY = HEADER_BOTTOM + 6;
    for (const col of Object.values(COLUMNS)) {
      const label = col.label;
      const x =
        col.align === 'right' ? col.x + col.width - bold.widthOfTextAtSize(label, 7.5) : col.x;
      page.drawText(label, { x, y: headY, size: 7.5, font: bold, color: black });
    }
    page.drawLine({
      start: { x: MARGIN_X, y: headY - 4 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: headY - 4 },
      thickness: 0.75,
      color: black,
    });

    // --- data rows ---
    let y = HEADER_BOTTOM - ROW_HEIGHT + 4;
    for (const row of pageData.rows) {
      const font = row.bold ? bold : helvetica;
      if (row.bold) {
        page.drawLine({
          start: { x: MARGIN_X, y: y + ROW_HEIGHT - 3 },
          end: { x: PAGE_WIDTH - MARGIN_X, y: y + ROW_HEIGHT - 3 },
          thickness: 0.5,
          color: black,
        });
      }
      const cells: [keyof typeof COLUMNS, string][] = [
        ['description', row.description],
        ['dateAcquired', row.dateAcquired],
        ['dateSold', row.dateSold],
        ['proceeds', row.proceeds],
        ['costBasis', row.costBasis],
        ['code', row.code],
        ['adjustment', row.adjustment],
        ['gainLoss', row.gainLoss],
      ];
      for (const [key, rawText] of cells) {
        if (rawText === '') continue;
        const col = COLUMNS[key];
        const text = truncateToWidth(sanitize(rawText), font, ROW_FONT_SIZE, col.width);
        const x =
          col.align === 'right'
            ? col.x + col.width - font.widthOfTextAtSize(text, ROW_FONT_SIZE)
            : col.x;
        page.drawText(text, { x, y, size: ROW_FONT_SIZE, font, color: black });
      }
      y -= ROW_HEIGHT;
    }

    // --- footer ---
    const filePart = fileCount > 1 ? ` — File ${fileIndex} of ${fileCount}` : '';
    page.drawText(
      `Page ${pageIdx + 1} of ${pages.length}${filePart} — Attachment to Form 8949, Exception 2`,
      { x: MARGIN_X, y: FOOTER_Y, size: 7.5, font: helvetica, color: gray },
    );
  });

  return doc.save({ useObjectStreams: true });
}

function fileBaseName(clientName: string, taxYear: number): string {
  const last = clientName.split(',')[0]?.trim() || clientName.trim() || 'Client';
  const safe = last.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Client';
  return `${safe}_${taxYear}_8949_Statement`;
}

/**
 * Generate the statement PDF(s). Renders once; if the result exceeds the
 * split threshold, re-plans into N files cut at category boundaries where
 * possible. Every file passes the size check or generation fails loudly.
 */
export async function generateStatements(
  batches: ImportBatch[],
  mode: RoundingMode,
  totals: CategoryTotals[],
  meta: StatementMeta,
): Promise<GeneratedStatement[]> {
  const pages = planStatementPages(batches, mode, totals);
  if (pages.length === 0) {
    throw new Error('No transactions to include — nothing to generate');
  }
  const base = fileBaseName(meta.clientName, meta.taxYear);

  const single = await renderPages(pages, meta, 1, 1);
  if (single.length <= SIZE_SPLIT_THRESHOLD) {
    return [{ fileName: `${base}.pdf`, bytes: single }];
  }

  const fileCount = Math.ceil(single.length / SIZE_SPLIT_THRESHOLD);
  const chunks = splitPlan(pages, fileCount);
  const out: GeneratedStatement[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const bytes = await renderPages(chunks[i]!, meta, i + 1, chunks.length);
    if (bytes.length > SIZE_LIMIT_BYTES) {
      throw new Error(
        `Statement file ${i + 1} is still over the 2 MB TaxSlayer Pro attachment limit after splitting — report this file's shape as a bug`,
      );
    }
    out.push({
      fileName: `${base}_${i + 1}of${chunks.length}.pdf`,
      bytes,
    });
  }
  return out;
}
