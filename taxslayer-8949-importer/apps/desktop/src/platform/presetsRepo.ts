import { type PresetStore, parsePresets, serializePresets } from '@tsp8949/core';
import { isTauri } from './env';

const FILE_NAME = 'presets.json';
const LS_KEY = 'tsp8949.presets';

/**
 * Presets persistence. App-data file under Tauri, localStorage in the
 * browser dev fallback. Presets contain headers + mappings only — no PII.
 */
export async function loadPresets(): Promise<PresetStore> {
  try {
    if (isTauri()) {
      const { BaseDirectory, exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(FILE_NAME, { baseDir: BaseDirectory.AppData }))) {
        return parsePresets('');
      }
      return parsePresets(await readTextFile(FILE_NAME, { baseDir: BaseDirectory.AppData }));
    }
    return parsePresets(localStorage.getItem(LS_KEY) ?? '');
  } catch {
    return parsePresets('');
  }
}

export async function savePresets(store: PresetStore): Promise<void> {
  const text = serializePresets(store);
  if (isTauri()) {
    const { BaseDirectory, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});
    await writeTextFile(FILE_NAME, text, { baseDir: BaseDirectory.AppData });
    return;
  }
  localStorage.setItem(LS_KEY, text);
}

/** SHA-256 hex via Web Crypto — injected into core's fingerprint functions. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
