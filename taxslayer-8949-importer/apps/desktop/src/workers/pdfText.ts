import type { PositionedText } from '@tsp8949/core';

/**
 * Extract positioned text items from a PDF using pdfjs-dist. pdfjs does its
 * parsing inside its own worker (bundled via the ?url import), so the main
 * thread only orchestrates page iteration.
 */
export async function extractPositionedText(bytes: Uint8Array): Promise<PositionedText[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // pdfjs transfers the buffer to its worker; hand it a copy so callers keep theirs.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const items: PositionedText[] = [];
  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const t = item.transform as number[];
        items.push({
          text: item.str,
          x: t[4] ?? 0,
          y: t[5] ?? 0,
          width: item.width,
          page: pageNum,
        });
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return items;
}
