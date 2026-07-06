import {
  type BasisBox,
  type ClientSession,
  type ImportBatch,
  type MappedTransaction,
  type NormalizedTransaction,
  type RoundingMode,
  type Term,
  effectiveTerm,
  formatCents,
  formatTxDate,
  normalizeRow,
} from '@tsp8949/core';
import { create } from 'zustand';

export type EditableField =
  | 'description'
  | 'dateAcquired'
  | 'dateSold'
  | 'proceeds'
  | 'costBasis'
  | 'adjustmentAmount'
  | 'adjustmentCode';

/** Rebuild the raw-string view of a transaction for re-normalization after an edit. */
function toRawStrings(tx: NormalizedTransaction): MappedTransaction {
  return {
    sourceRowIndex: tx.sourceRowIndex,
    description: tx.description,
    dateAcquired: formatTxDate(tx.dateAcquired),
    dateSold: formatTxDate(tx.dateSold),
    proceeds: formatCents(tx.proceeds),
    costBasis: formatCents(tx.costBasis),
    adjustmentAmount: tx.adjustmentAmount === 0 ? '' : formatCents(tx.adjustmentAmount),
    adjustmentCode: tx.adjustmentCodes.join(' '),
  };
}

interface SessionState {
  session: ClientSession | null;
  filePath: string | null;
  dirty: boolean;

  newSession: (clientName: string, tin: string, taxYear: number) => void;
  openSession: (session: ClientSession, filePath: string | null) => void;
  closeSession: () => void;
  markSaved: (filePath: string | null) => void;

  addBatch: (batch: ImportBatch) => void;
  removeBatch: (batchId: string) => void;
  setBatchBox: (batchId: string, box: BasisBox) => void;
  setRoundingMode: (mode: RoundingMode) => void;

  editTransaction: (batchId: string, txId: string, field: EditableField, rawValue: string) => void;
  setExcluded: (batchId: string, txId: string, excluded: boolean) => void;
  setTermOverride: (batchId: string, txId: string, term: Term | null) => void;
  bulkResolveTerm: (batchId: string, term: Term) => void;
}

function touch(session: ClientSession): ClientSession {
  return { ...session, modifiedAt: new Date().toISOString() };
}

function updateTx(
  session: ClientSession,
  batchId: string,
  txId: string,
  update: (tx: NormalizedTransaction) => NormalizedTransaction,
): ClientSession {
  return touch({
    ...session,
    batches: session.batches.map((batch) =>
      batch.id === batchId
        ? {
            ...batch,
            transactions: batch.transactions.map((tx) => (tx.id === txId ? update(tx) : tx)),
          }
        : batch,
    ),
  });
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  filePath: null,
  dirty: false,

  newSession: (clientName, tin, taxYear) =>
    set({
      session: {
        schemaVersion: 1,
        clientName,
        tin,
        taxYear,
        batches: [],
        roundingMode: 'whole-dollar',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      },
      filePath: null,
      dirty: true,
    }),

  openSession: (session, filePath) => set({ session, filePath, dirty: false }),
  closeSession: () => set({ session: null, filePath: null, dirty: false }),
  markSaved: (filePath) => set({ filePath, dirty: false }),

  addBatch: (batch) =>
    set((s) =>
      s.session
        ? { session: touch({ ...s.session, batches: [...s.session.batches, batch] }), dirty: true }
        : {},
    ),

  removeBatch: (batchId) =>
    set((s) =>
      s.session
        ? {
            session: touch({
              ...s.session,
              batches: s.session.batches.filter((b) => b.id !== batchId),
            }),
            dirty: true,
          }
        : {},
    ),

  setBatchBox: (batchId, box) =>
    set((s) =>
      s.session
        ? {
            session: touch({
              ...s.session,
              batches: s.session.batches.map((b) =>
                b.id === batchId ? { ...b, basisBox: box } : b,
              ),
            }),
            dirty: true,
          }
        : {},
    ),

  setRoundingMode: (mode) =>
    set((s) =>
      s.session ? { session: touch({ ...s.session, roundingMode: mode }), dirty: true } : {},
    ),

  editTransaction: (batchId, txId, field, rawValue) =>
    set((s) => {
      if (!s.session) return {};
      return {
        session: updateTx(s.session, batchId, txId, (tx) => {
          const raw = toRawStrings(tx);
          if (field === 'adjustmentCode') raw.adjustmentCode = rawValue;
          else raw[field] = rawValue;
          const next = normalizeRow(raw, { makeId: () => tx.id });
          next.termOverride = tx.termOverride;
          next.excluded = tx.excluded;
          return next;
        }),
        dirty: true,
      };
    }),

  setExcluded: (batchId, txId, excluded) =>
    set((s) =>
      s.session
        ? {
            session: updateTx(s.session, batchId, txId, (tx) => ({ ...tx, excluded })),
            dirty: true,
          }
        : {},
    ),

  setTermOverride: (batchId, txId, term) =>
    set((s) =>
      s.session
        ? {
            session: updateTx(s.session, batchId, txId, (tx) => ({ ...tx, termOverride: term })),
            dirty: true,
          }
        : {},
    ),

  bulkResolveTerm: (batchId, term) =>
    set((s) => {
      if (!s.session) return {};
      return {
        session: touch({
          ...s.session,
          batches: s.session.batches.map((batch) =>
            batch.id === batchId
              ? {
                  ...batch,
                  transactions: batch.transactions.map((tx) =>
                    !tx.excluded && effectiveTerm(tx) === null ? { ...tx, termOverride: term } : tx,
                  ),
                }
              : batch,
          ),
        }),
        dirty: true,
      };
    }),
}));
