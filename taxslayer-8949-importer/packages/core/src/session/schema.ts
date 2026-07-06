import type {
  BasisBox,
  ClientSession,
  ImportBatch,
  NormalizedTransaction,
  RoundingMode,
  TxDate,
} from '../types';

/** Result of parsing a session file. */
export type SessionParseResult =
  | { ok: true; session: ClientSession }
  | { ok: false; error: string };

export function serializeSession(session: ClientSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Version-gated, defensive parse of a .8949c session file. Hand-rolled
 * guards keep core dependency-free; unknown versions fail loudly with a
 * clear message instead of silently mangling client data.
 */
export function parseSession(text: string): SessionParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not a valid session file (could not parse JSON)' };
  }
  if (!isRecord(data)) return { ok: false, error: 'Not a valid session file' };

  const version = data.schemaVersion;
  if (version !== 1) {
    return {
      ok: false,
      error: `Unsupported session file version ${String(version)} — update the app to open this file`,
    };
  }

  if (
    typeof data.clientName !== 'string' ||
    typeof data.tin !== 'string' ||
    typeof data.taxYear !== 'number' ||
    !Array.isArray(data.batches) ||
    !isRoundingMode(data.roundingMode) ||
    typeof data.createdAt !== 'string' ||
    typeof data.modifiedAt !== 'string'
  ) {
    return { ok: false, error: 'Session file is missing required fields' };
  }

  const batches: ImportBatch[] = [];
  for (const raw of data.batches) {
    const batch = parseBatch(raw);
    if (batch === null) return { ok: false, error: 'Session file contains an invalid batch' };
    batches.push(batch);
  }

  return {
    ok: true,
    session: {
      schemaVersion: 1,
      clientName: data.clientName,
      tin: data.tin,
      taxYear: data.taxYear,
      batches,
      roundingMode: data.roundingMode,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt,
    },
  };
}

function parseBatch(raw: unknown): ImportBatch | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.label !== 'string' ||
    typeof raw.sourceFileName !== 'string' ||
    (raw.source !== 'csv' && raw.source !== 'pdf') ||
    !isBasisBox(raw.basisBox) ||
    !Array.isArray(raw.transactions)
  ) {
    return null;
  }
  const transactions: NormalizedTransaction[] = [];
  for (const t of raw.transactions) {
    const tx = parseTransaction(t);
    if (tx === null) return null;
    transactions.push(tx);
  }
  const batch: ImportBatch = {
    id: raw.id,
    label: raw.label,
    sourceFileName: raw.sourceFileName,
    source: raw.source,
    basisBox: raw.basisBox,
    transactions,
  };
  if (typeof raw.mappingPresetId === 'string') batch.mappingPresetId = raw.mappingPresetId;
  if (isRecord(raw.sourceTotals)) {
    batch.sourceTotals = {
      proceeds: isCentsOrNull(raw.sourceTotals.proceeds) ? raw.sourceTotals.proceeds : null,
      costBasis: isCentsOrNull(raw.sourceTotals.costBasis) ? raw.sourceTotals.costBasis : null,
    };
  }
  return batch;
}

function parseTransaction(raw: unknown): NormalizedTransaction | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.sourceRowIndex !== 'number' ||
    typeof raw.description !== 'string' ||
    !isTxDate(raw.dateAcquired) ||
    !isTxDate(raw.dateSold) ||
    !Number.isSafeInteger(raw.proceeds) ||
    !Number.isSafeInteger(raw.costBasis) ||
    !Number.isSafeInteger(raw.adjustmentAmount) ||
    !Array.isArray(raw.adjustmentCodes) ||
    !raw.adjustmentCodes.every((c: unknown) => typeof c === 'string') ||
    !isTermOrNull(raw.term) ||
    !isTermOrNull(raw.termOverride) ||
    typeof raw.excluded !== 'boolean' ||
    !Array.isArray(raw.issues)
  ) {
    return null;
  }
  return {
    id: raw.id,
    sourceRowIndex: raw.sourceRowIndex,
    description: raw.description,
    dateAcquired: raw.dateAcquired,
    dateSold: raw.dateSold,
    proceeds: raw.proceeds as number,
    costBasis: raw.costBasis as number,
    adjustmentAmount: raw.adjustmentAmount as number,
    adjustmentCodes: raw.adjustmentCodes as string[],
    term: raw.term,
    termOverride: raw.termOverride,
    excluded: raw.excluded,
    // Issues are recomputable display state; accept them as-is.
    issues: raw.issues as NormalizedTransaction['issues'],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRoundingMode(v: unknown): v is RoundingMode {
  return v === 'cents' || v === 'whole-dollar';
}

function isBasisBox(v: unknown): v is BasisBox {
  return v === 'A' || v === 'B' || v === 'C';
}

function isTermOrNull(v: unknown): v is 'short' | 'long' | null {
  return v === null || v === 'short' || v === 'long';
}

function isCentsOrNull(v: unknown): v is number | null {
  return v === null || Number.isSafeInteger(v);
}

function isTxDate(v: unknown): v is TxDate {
  if (!isRecord(v)) return false;
  switch (v.kind) {
    case 'date':
      return typeof v.iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.iso);
    case 'various':
    case 'inherited':
    case 'unknown':
      return true;
    default:
      return false;
  }
}
