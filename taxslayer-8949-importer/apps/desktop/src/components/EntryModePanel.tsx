import { useEffect, useRef } from 'react';
import {
  HOTKEY_NEXT,
  HOTKEY_STOP,
  enterCompactPanel,
  exitCompactPanel,
  registerEntryHotkeys,
  typeText,
  unregisterEntryHotkeys,
} from '../platform/entryMode';
import { isTauri } from '../platform/env';
import { useEntryModeStore } from '../state/entryModeStore';
import { CopyField } from './CopyField';

/**
 * The compact always-on-top panel shown while entry mode is active. Owns the
 * native lifecycle: hotkey registration and window shrink/restore.
 */
export function EntryModePanel() {
  const { queue, index, sendTab, typing, warning, setSendTab, skip, stop } = useEntryModeStore();
  const native = isTauri();
  // Keep the latest handler in a ref so the global hotkey (registered once)
  // always acts on current state.
  const typeNextRef = useRef<() => void>(() => {});

  typeNextRef.current = () => {
    const s = useEntryModeStore.getState();
    if (!s.active || s.typing) return;
    if (document.hasFocus()) {
      s.setWarning('Click into the TaxSlayer Pro field first — this window is still focused.');
      return;
    }
    const item = s.queue[s.index];
    if (!item) return;
    s.setTyping(true);
    s.setWarning(null);
    typeText(item.value, s.sendTab)
      .then(() => useEntryModeStore.getState().advance())
      .catch((err) => {
        useEntryModeStore.getState().setTyping(false);
        useEntryModeStore
          .getState()
          .setWarning(err instanceof Error ? err.message : 'Typing failed');
      });
  };

  useEffect(() => {
    if (!native) return;
    let mounted = true;
    (async () => {
      await enterCompactPanel();
      try {
        await registerEntryHotkeys({
          onNext: () => typeNextRef.current(),
          onStop: () => useEntryModeStore.getState().stop(),
        });
      } catch (err) {
        if (mounted) {
          useEntryModeStore
            .getState()
            .setWarning(
              `Could not register the ${HOTKEY_NEXT} hotkey (another app may be using it): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
        }
      }
    })();
    return () => {
      mounted = false;
      void unregisterEntryHotkeys();
      void exitCompactPanel();
    };
  }, [native]);

  const current = queue[index];
  const remaining = queue.length - index;

  return (
    <div className="entry-panel">
      <header className="entry-panel-head">
        <strong>TaxSlayer entry mode</strong>
        <span>
          {index + 1} / {queue.length}
        </span>
      </header>

      {native ? (
        <>
          {current && (
            <div className="entry-next">
              <span className="entry-next-label">{current.label}</span>
              <span className="entry-next-value" data-testid="entry-next-value">
                {current.value}
              </span>
            </div>
          )}
          <p className="entry-hint">
            Click into the TaxSlayer Pro field, then press <kbd>{HOTKEY_NEXT}</kbd> — the value is
            typed for you{sendTab ? ' followed by Tab' : ''}. <kbd>{HOTKEY_STOP}</kbd> stops.
          </p>
          {typing && <p className="busy-banner">typing…</p>}
        </>
      ) : (
        <>
          <p className="warn-banner">
            Global hotkeys need the desktop app — in the browser, copy each value instead.
          </p>
          <div className="entry-fallback-list">
            {queue.slice(index, index + 4).map((item) => (
              <CopyField key={item.label} label={item.label} value={item.value} />
            ))}
            {remaining > 4 && <p className="grid-hint">…and {remaining - 4} more</p>}
          </div>
        </>
      )}

      {warning && <p className="error-banner">{warning}</p>}

      <div className="entry-panel-actions">
        <label className="entry-tab-toggle">
          <input type="checkbox" checked={sendTab} onChange={(e) => setSendTab(e.target.checked)} />
          Tab after each value
        </label>
        <button type="button" className="btn btn-small" onClick={skip}>
          Skip
        </button>
        <button type="button" className="btn btn-small btn-primary" onClick={stop}>
          Stop
        </button>
      </div>
    </div>
  );
}
