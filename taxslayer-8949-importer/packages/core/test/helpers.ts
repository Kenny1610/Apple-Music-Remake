import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let counter = 0;
/** Deterministic id factory for tests. */
export const makeTestId = () => `id-${++counter}`;

export function loadFixture(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, 'fixtures', name), 'utf8');
}

/**
 * Minimal RFC-4180 CSV parser for fixtures (quoted fields, doubled quotes,
 * CRLF). The app uses PapaParse; tests only need enough to feed sniff().
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

/** Simple deterministic "hash" for fingerprint tests. */
export const fakeHash = async (input: string): Promise<string> => `hash(${input})`;
