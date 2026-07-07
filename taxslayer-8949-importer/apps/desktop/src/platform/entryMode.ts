import { isTauri } from './env';

export const HOTKEY_NEXT = 'Control+Shift+V';
export const HOTKEY_STOP = 'Control+Shift+Q';

export interface EntryHotkeyHandlers {
  onNext: () => void;
  onStop: () => void;
}

/**
 * Register the entry-mode global hotkeys. Fires on key RELEASE only — the
 * plugin emits both Pressed and Released events for every press, and firing
 * on release also means the user's fingers are off the modifiers before we
 * synthesize keystrokes. Throws if registration fails (e.g. another app owns
 * the combo) so the caller can surface it.
 */
export async function registerEntryHotkeys(handlers: EntryHotkeyHandlers): Promise<void> {
  if (!isTauri()) throw new Error('Global hotkeys need the desktop app');
  const { register } = await import('@tauri-apps/plugin-global-shortcut');
  await register(HOTKEY_NEXT, (event) => {
    if (event.state === 'Released') handlers.onNext();
  });
  await register(HOTKEY_STOP, (event) => {
    if (event.state === 'Released') handlers.onStop();
  });
}

export async function unregisterEntryHotkeys(): Promise<void> {
  if (!isTauri()) return;
  const { unregisterAll } = await import('@tauri-apps/plugin-global-shortcut');
  await unregisterAll();
}

/**
 * Type `text` into whatever field currently has OS keyboard focus (the
 * TaxSlayer Pro field), optionally followed by Tab. The Rust side waits for
 * modifier settle and force-releases Ctrl/Shift first.
 */
export async function typeText(text: string, tab: boolean): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('type_text', { text, tab });
}

interface SavedWindowState {
  width: number;
  height: number;
  x: number;
  y: number;
}

let saved: SavedWindowState | null = null;

/** Shrink the main window into the compact always-on-top entry panel. */
export async function enterCompactPanel(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const size = await win.innerSize();
  const pos = await win.outerPosition();
  const factor = await win.scaleFactor();
  saved = {
    width: size.toLogical(factor).width,
    height: size.toLogical(factor).height,
    x: pos.x,
    y: pos.y,
  };
  // tauri.conf.json pins minWidth/minHeight at 1024x700 — lift it first or
  // setSize gets clamped right back up.
  await win.setMinSize(new LogicalSize(340, 200));
  await win.setSize(new LogicalSize(380, 240));
  await win.setAlwaysOnTop(true);
}

/** Restore the window to its pre-entry-mode size, position, and stacking. */
export async function exitCompactPanel(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize, PhysicalPosition } = await import(
    '@tauri-apps/api/window'
  );
  const win = getCurrentWindow();
  await win.setAlwaysOnTop(false);
  await win.setMinSize(new LogicalSize(1024, 700));
  if (saved) {
    await win.setSize(new LogicalSize(saved.width, saved.height));
    await win.setPosition(new PhysicalPosition(saved.x, saved.y));
    saved = null;
  }
  await win.setFocus();
}
