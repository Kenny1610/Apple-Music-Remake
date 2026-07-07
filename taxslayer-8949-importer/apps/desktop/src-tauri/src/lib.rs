// Tauri v2 shell. Application logic lives in TypeScript; the Rust side
// registers plugins and exposes one command: `type_text`, which synthesizes
// keystrokes into the OS-focused field for TaxSlayer entry mode.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

/// Type `text` into whatever window/field currently has keyboard focus,
/// optionally followed by a Tab keystroke.
///
/// Safety characteristics:
/// - Sleeps briefly so the user's hotkey modifiers are physically released
///   before synthesis begins, then force-releases Ctrl/Shift (idempotent)
///   so a still-held modifier can't combine with the typed digits.
/// - `.text()` uses per-character unicode injection (SendInput with
///   KEYEVENTF_UNICODE on Windows), independent of keyboard layout/NumLock,
///   and only ever emits the provided value text.
#[tauri::command]
async fn type_text(text: String, tab: bool) -> Result<(), String> {
    // Async command: the sleep runs on a worker thread, not the main loop.
    std::thread::sleep(std::time::Duration::from_millis(120));

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    // Defensive release of the hotkey modifiers (no-ops when already up).
    let _ = enigo.key(Key::Control, Direction::Release);
    let _ = enigo.key(Key::Shift, Direction::Release);

    enigo.text(&text).map_err(|e| e.to_string())?;
    if tab {
        enigo
            .key(Key::Tab, Direction::Click)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![type_text])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
