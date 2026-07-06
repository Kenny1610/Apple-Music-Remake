import type { ColumnMapping, MappableField } from '../types';

/**
 * Heuristics for auto-mapping CSV headers to fields when no preset matches.
 * First matching pattern wins per field; each header is used at most once,
 * and more specific fields are resolved before generic ones.
 */
const FIELD_PATTERNS: [MappableField, RegExp[]][] = [
  [
    'dateAcquired',
    [/acquir/i, /open(ed)?\s*date/i, /purchase\s*date/i, /date\s*(bought|open)/i, /\bbought\b/i],
  ],
  ['dateSold', [/sold|sale|disposed|close[dt]?\s*date|settle/i, /date\s*(sold|closed)/i]],
  ['proceeds', [/proceed/i, /sales?\s*price/i, /amount\s*received/i, /gross\s*amount/i]],
  ['costBasis', [/cost\s*basis/i, /\bbasis\b/i, /\bcost\b/i, /purchase\s*price/i]],
  ['adjustmentAmount', [/wash\s*sale/i, /adjust(ment)?\s*(amt|amount)?$/i, /disallowed/i]],
  ['adjustmentCode', [/adjust(ment)?\s*code/i, /\bcode\b/i]],
  ['termIndicator', [/\bterm\b/i, /holding\s*period/i, /short.?long/i]],
  ['quantity', [/quantity|shares|qty|units|\bamount\s*sold\b/i]],
  // description before assetName: combined columns like "Symbol/Description"
  // must map to description, not get consumed as an asset symbol
  ['description', [/descript/i, /security\s*(name|description)?/i, /investment/i]],
  ['assetName', [/symbol|ticker|asset|currency|coin/i]],
  ['gainLoss', [/gain|loss|profit/i]],
];

/**
 * Suggest a column mapping from raw headers. If no single description column
 * is found but quantity + asset columns are, description is composed from
 * them ("0.5 BTC").
 */
export function suggestMapping(headers: string[]): ColumnMapping {
  const fields: Partial<Record<MappableField, string>> = {};
  const used = new Set<string>();

  for (const [field, patterns] of FIELD_PATTERNS) {
    for (const pattern of patterns) {
      const header = headers.find((h) => !used.has(h) && pattern.test(h));
      if (header) {
        fields[field] = header;
        used.add(header);
        break;
      }
    }
  }

  const descriptionMode =
    !fields.description && fields.quantity && fields.assetName
      ? 'quantity-plus-asset'
      : 'single-column';

  return { fields, descriptionMode };
}
