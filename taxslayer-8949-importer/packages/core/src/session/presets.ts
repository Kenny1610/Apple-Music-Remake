import type { MappingPreset } from '../types';

/**
 * Shape of the presets.json store kept in the app-data directory. Contains
 * only headers and mappings — never client data — so it is safe to live
 * outside the client session file.
 */
export interface PresetStore {
  schemaVersion: 1;
  presets: MappingPreset[];
}

export function emptyPresetStore(): PresetStore {
  return { schemaVersion: 1, presets: [] };
}

export function serializePresets(store: PresetStore): string {
  return JSON.stringify(store, null, 2);
}

export function parsePresets(text: string): PresetStore {
  try {
    const data: unknown = JSON.parse(text);
    if (
      typeof data === 'object' &&
      data !== null &&
      (data as { schemaVersion?: unknown }).schemaVersion === 1 &&
      Array.isArray((data as { presets?: unknown }).presets)
    ) {
      return data as PresetStore;
    }
  } catch {
    // fall through to empty store — a corrupt presets file should never
    // block the app; the user just re-saves their mappings
  }
  return emptyPresetStore();
}

/** Insert or replace (by id), most recently used first, capped at 100. */
export function upsertPreset(store: PresetStore, preset: MappingPreset): PresetStore {
  const rest = store.presets.filter((p) => p.id !== preset.id);
  return { schemaVersion: 1, presets: [preset, ...rest].slice(0, 100) };
}

export function removePreset(store: PresetStore, presetId: string): PresetStore {
  return { schemaVersion: 1, presets: store.presets.filter((p) => p.id !== presetId) };
}
