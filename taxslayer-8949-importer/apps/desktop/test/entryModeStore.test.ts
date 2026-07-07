import { beforeEach, describe, expect, it } from 'vitest';
import type { EntryItem } from '../src/entry/buildQueue';
import { useEntryModeStore } from '../src/state/entryModeStore';

const item = (i: number): EntryItem => ({
  category: 'A',
  field: 'proceeds',
  label: `Item ${i}`,
  value: String(i),
});

describe('entryModeStore', () => {
  beforeEach(() => useEntryModeStore.getState().stop());

  it('start activates only with a non-empty queue', () => {
    useEntryModeStore.getState().start([], true);
    expect(useEntryModeStore.getState().active).toBe(false);
    useEntryModeStore.getState().start([item(1), item(2)], true);
    expect(useEntryModeStore.getState().active).toBe(true);
    expect(useEntryModeStore.getState().index).toBe(0);
  });

  it('advance walks the queue and auto-stops at exhaustion', () => {
    useEntryModeStore.getState().start([item(1), item(2)], true);
    useEntryModeStore.getState().advance();
    expect(useEntryModeStore.getState().index).toBe(1);
    expect(useEntryModeStore.getState().active).toBe(true);
    useEntryModeStore.getState().advance();
    expect(useEntryModeStore.getState().active).toBe(false);
    expect(useEntryModeStore.getState().queue).toEqual([]);
  });

  it('skip advances without typing and also auto-stops at the end', () => {
    useEntryModeStore.getState().start([item(1)], false);
    useEntryModeStore.getState().skip();
    expect(useEntryModeStore.getState().active).toBe(false);
  });

  it('advance clears the typing guard', () => {
    useEntryModeStore.getState().start([item(1), item(2)], true);
    useEntryModeStore.getState().setTyping(true);
    useEntryModeStore.getState().advance();
    expect(useEntryModeStore.getState().typing).toBe(false);
  });

  it('stop resets everything', () => {
    useEntryModeStore.getState().start([item(1), item(2)], true);
    useEntryModeStore.getState().setWarning('problem');
    useEntryModeStore.getState().stop();
    const s = useEntryModeStore.getState();
    expect(s.active).toBe(false);
    expect(s.queue).toEqual([]);
    expect(s.index).toBe(0);
  });
});
