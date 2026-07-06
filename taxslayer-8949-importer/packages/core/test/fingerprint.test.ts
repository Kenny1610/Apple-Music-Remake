import { describe, expect, it } from 'vitest';
import { fingerprintHeaders, headerSimilarity, matchPreset } from '../src/csv/fingerprint';
import type { MappingPreset } from '../src/types';
import { fakeHash } from './helpers';

const HEADERS = ['Description', 'Date Acquired', 'Date Sold', 'Proceeds', 'Cost Basis'];

function preset(headers: string[], fingerprint: string): MappingPreset {
  return {
    id: 'p1',
    name: 'Test preset',
    fingerprint,
    headers,
    mapping: { fields: {}, descriptionMode: 'single-column' },
    lastUsed: '2026-01-01T00:00:00Z',
  };
}

describe('fingerprintHeaders', () => {
  it('is insensitive to case and whitespace', async () => {
    const a = await fingerprintHeaders(['Date  Acquired', ' Proceeds '], fakeHash);
    const b = await fingerprintHeaders(['date acquired', 'proceeds'], fakeHash);
    expect(a).toBe(b);
  });
});

describe('headerSimilarity', () => {
  it('is 1 for identical sets and decreases with divergence', () => {
    expect(headerSimilarity(HEADERS, HEADERS)).toBe(1);
    const oneOff = [...HEADERS.slice(0, 4), 'Wash Sale'];
    expect(headerSimilarity(HEADERS, oneOff)).toBeCloseTo(4 / 6);
  });
});

describe('matchPreset', () => {
  it('prefers an exact fingerprint match', async () => {
    const fp = await fingerprintHeaders(HEADERS, fakeHash);
    const match = await matchPreset(HEADERS, [preset(HEADERS, fp)], fakeHash);
    expect(match?.kind).toBe('exact');
  });

  it('falls back to fuzzy at ≥0.8 similarity', async () => {
    // 5 shared of 6 union = 0.833
    const stored = [...HEADERS, 'Wash Sale Loss Disallowed'];
    const match = await matchPreset(HEADERS, [preset(stored, 'other-fp')], fakeHash);
    expect(match?.kind).toBe('fuzzy');
    expect(match?.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('returns null below the fuzzy threshold', async () => {
    const match = await matchPreset(
      HEADERS,
      [preset(['Totally', 'Different', 'Columns'], 'x')],
      fakeHash,
    );
    expect(match).toBeNull();
  });
});
