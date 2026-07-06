import type {
  BasisBox,
  ColumnMapping,
  DetectedSection,
  PresetMatch,
  SniffResult,
} from '@tsp8949/core';
import { create } from 'zustand';

export type WizardStep = 'client' | 'import' | 'map' | 'review' | 'categorize' | 'totals';

export const STEP_ORDER: WizardStep[] = [
  'client',
  'import',
  'map',
  'review',
  'categorize',
  'totals',
];

export type PendingImport =
  | {
      kind: 'csv';
      fileName: string;
      sniffed: SniffResult;
      mapping: ColumnMapping;
      presetMatch: PresetMatch | null;
      defaultBox: BasisBox;
    }
  | {
      kind: 'pdf';
      fileName: string;
      sections: DetectedSection[];
    };

interface WizardState {
  step: WizardStep;
  pendingImport: PendingImport | null;
  busy: string | null;

  setStep: (step: WizardStep) => void;
  setPendingImport: (pending: PendingImport | null) => void;
  updateCsvMapping: (mapping: ColumnMapping) => void;
  setBusy: (message: string | null) => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  step: 'client',
  pendingImport: null,
  busy: null,

  setStep: (step) => set({ step }),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  updateCsvMapping: (mapping) =>
    set((s) =>
      s.pendingImport?.kind === 'csv' ? { pendingImport: { ...s.pendingImport, mapping } } : {},
    ),
  setBusy: (busy) => set({ busy }),
}));
