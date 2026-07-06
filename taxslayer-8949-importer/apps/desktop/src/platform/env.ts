/** True when running inside the Tauri shell (vs a plain browser dev session). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
