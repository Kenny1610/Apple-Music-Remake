import { useEffect } from 'react';
import { EntryModePanel } from './components/EntryModePanel';
import { WizardNav } from './components/WizardNav';
import { isTauri } from './platform/env';
import { CategorizeScreen } from './screens/CategorizeScreen';
import { ClientScreen } from './screens/ClientScreen';
import { ImportScreen } from './screens/ImportScreen';
import { MapColumnsScreen } from './screens/MapColumnsScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { TotalsExportScreen } from './screens/TotalsExportScreen';
import { useEntryModeStore } from './state/entryModeStore';
import { useSessionStore } from './state/sessionStore';
import { useWizardStore } from './state/wizardStore';

export function App() {
  const step = useWizardStore((s) => s.step);
  const dirty = useSessionStore((s) => s.dirty);
  const entryModeActive = useEntryModeStore((s) => s.active);

  // Unsaved-changes guard on window close (Tauri) / tab close (browser dev).
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined;
      (async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        unlisten = await getCurrentWindow().onCloseRequested((event) => {
          const isDirty = useSessionStore.getState().dirty;
          if (isDirty && !window.confirm('You have unsaved changes. Close anyway?')) {
            event.preventDefault();
          }
        });
      })();
      return () => unlisten?.();
    }
    const handler = (e: BeforeUnloadEvent) => {
      if (useSessionStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // dirty is subscribed so the nav's save indicator stays fresh
  void dirty;

  // Entry mode replaces the whole layout — the window is a compact panel.
  if (entryModeActive) {
    return <EntryModePanel />;
  }

  return (
    <div className="app-layout">
      <WizardNav />
      <main className="app-main">
        {step === 'client' && <ClientScreen />}
        {step === 'import' && <ImportScreen />}
        {step === 'map' && <MapColumnsScreen />}
        {step === 'review' && <ReviewScreen />}
        {step === 'categorize' && <CategorizeScreen />}
        {step === 'totals' && <TotalsExportScreen />}
      </main>
    </div>
  );
}
