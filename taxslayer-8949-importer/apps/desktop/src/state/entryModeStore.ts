import { create } from 'zustand';
import type { EntryItem } from '../entry/buildQueue';

/**
 * Entry-mode state. Pure UI state — no Tauri imports here; the platform
 * lifecycle (hotkeys, window shrink) is owned by EntryModePanel via
 * platform/entryMode.ts.
 */
interface EntryModeState {
  active: boolean;
  queue: EntryItem[];
  index: number;
  /** send Tab after typing each value */
  sendTab: boolean;
  /** re-entrancy guard while a type_text invoke is in flight */
  typing: boolean;
  /** surfaced problems (hotkey registration failure, typing error) */
  warning: string | null;

  start: (queue: EntryItem[], sendTab: boolean) => void;
  /** advance past the current item; auto-stops when the queue is exhausted */
  advance: () => void;
  skip: () => void;
  stop: () => void;
  setTyping: (typing: boolean) => void;
  setSendTab: (sendTab: boolean) => void;
  setWarning: (warning: string | null) => void;
}

export const useEntryModeStore = create<EntryModeState>((set) => ({
  active: false,
  queue: [],
  index: 0,
  sendTab: true,
  typing: false,
  warning: null,

  start: (queue, sendTab) =>
    set({ active: queue.length > 0, queue, index: 0, sendTab, typing: false, warning: null }),

  advance: () =>
    set((s) => {
      const next = s.index + 1;
      if (next >= s.queue.length) {
        return { active: false, index: 0, queue: [], typing: false };
      }
      return { index: next, typing: false };
    }),

  skip: () =>
    set((s) => {
      const next = s.index + 1;
      if (next >= s.queue.length) {
        return { active: false, index: 0, queue: [], typing: false };
      }
      return { index: next };
    }),

  stop: () => set({ active: false, queue: [], index: 0, typing: false }),
  setTyping: (typing) => set({ typing }),
  setSendTab: (sendTab) => set({ sendTab }),
  setWarning: (warning) => set({ warning }),
}));
