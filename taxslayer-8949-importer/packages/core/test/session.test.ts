import { describe, expect, it } from 'vitest';
import {
  emptyPresetStore,
  parsePresets,
  serializePresets,
  upsertPreset,
} from '../src/session/presets';
import { parseSession, serializeSession } from '../src/session/schema';
import type { ClientSession, MappingPreset } from '../src/types';

const session: ClientSession = {
  schemaVersion: 1,
  clientName: 'Smith, Jane',
  tin: '123-45-6789',
  taxYear: 2025,
  roundingMode: 'whole-dollar',
  createdAt: '2026-02-01T10:00:00Z',
  modifiedAt: '2026-02-01T11:30:00Z',
  batches: [
    {
      id: 'b1',
      label: 'Fidelity 1099-B',
      sourceFileName: 'fid.csv',
      source: 'csv',
      basisBox: 'A',
      sourceTotals: { proceeds: 5814855, costBasis: null },
      transactions: [
        {
          id: 't1',
          sourceRowIndex: 5,
          description: '100 AAPL',
          dateAcquired: { kind: 'date', iso: '2024-01-15' },
          dateSold: { kind: 'date', iso: '2025-03-10' },
          proceeds: 1985000,
          costBasis: 1720000,
          adjustmentAmount: 0,
          adjustmentCodes: [],
          term: 'long',
          termOverride: null,
          excluded: false,
          issues: [],
        },
      ],
    },
  ],
};

describe('session schema', () => {
  it('round-trips serialize → parse', () => {
    const result = parseSession(serializeSession(session));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toEqual(session);
  });

  it('rejects non-JSON and wrong versions with clear messages', () => {
    expect(parseSession('not json').ok).toBe(false);
    const wrongVersion = parseSession(JSON.stringify({ ...session, schemaVersion: 99 }));
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.error).toContain('version 99');
  });

  it('rejects structurally invalid batches', () => {
    const bad = JSON.parse(serializeSession(session));
    bad.batches[0].transactions[0].proceeds = 'lots';
    expect(parseSession(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('preset store', () => {
  const preset: MappingPreset = {
    id: 'p1',
    name: 'Fidelity 1099-B',
    fingerprint: 'abc',
    headers: ['Description', 'Proceeds'],
    mapping: {
      fields: { description: 'Description', proceeds: 'Proceeds' },
      descriptionMode: 'single-column',
    },
    lastUsed: '2026-02-01T10:00:00Z',
  };

  it('round-trips and upserts most-recent-first', () => {
    let store = upsertPreset(emptyPresetStore(), preset);
    store = upsertPreset(store, { ...preset, id: 'p2', name: 'Schwab' });
    const parsed = parsePresets(serializePresets(store));
    expect(parsed.presets.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('replaces by id instead of duplicating', () => {
    let store = upsertPreset(emptyPresetStore(), preset);
    store = upsertPreset(store, { ...preset, name: 'Renamed' });
    expect(store.presets).toHaveLength(1);
    expect(store.presets[0]!.name).toBe('Renamed');
  });

  it('returns an empty store for corrupt files instead of throwing', () => {
    expect(parsePresets('garbage').presets).toEqual([]);
    expect(parsePresets('{"schemaVersion":42}').presets).toEqual([]);
  });
});
