import { isTauri } from './env';

export interface PickedFile {
  name: string;
  /** absolute path when running under Tauri; undefined in the browser */
  path?: string;
  bytes: Uint8Array;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Open-file dialog returning the file's bytes. */
export async function pickFile(filters: FileFilter[]): Promise<PickedFile | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const path = await open({ multiple: false, filters });
    if (typeof path !== 'string') return null;
    const bytes = await readFile(path);
    const name = path.replaceAll('\\', '/').split('/').pop() ?? path;
    return { name, path, bytes };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    };
    // cancel: give the browser a beat to fire change; if the dialog is
    // dismissed nothing resolves, which is acceptable for the dev fallback
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Save-file dialog; returns the chosen file name/path or null when canceled. */
export async function saveFile(
  data: Uint8Array | string,
  defaultName: string,
  filters: FileFilter[],
): Promise<string | null> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({ defaultPath: defaultName, filters });
    if (typeof path !== 'string') return null;
    await writeFile(path, bytes);
    return path;
  }
  const blob = new Blob([bytes as BlobPart]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return defaultName;
}

export function decodeText(bytes: Uint8Array): string {
  // utf-8 with BOM tolerance; PapaParse handles the rest
  return new TextDecoder('utf-8').decode(bytes);
}
