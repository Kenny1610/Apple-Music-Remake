import { hasBlockingErrors, serializeSession } from '@tsp8949/core';
import { saveFile } from '../platform/files';
import { useSessionStore } from '../state/sessionStore';
import { STEP_ORDER, type WizardStep, useWizardStore } from '../state/wizardStore';

const STEP_LABELS: Record<WizardStep, string> = {
  client: 'Client',
  import: 'Import',
  map: 'Map Columns',
  review: 'Review & Fix',
  categorize: 'Categorize',
  totals: 'Totals & Export',
};

export function defaultSessionFileName(clientName: string, taxYear: number): string {
  const last =
    clientName
      .split(',')[0]
      ?.trim()
      .replace(/[^A-Za-z0-9_-]+/g, '_') || 'client';
  return `${last}_${taxYear}.8949c`;
}

export function WizardNav() {
  const { session, dirty, markSaved } = useSessionStore();
  const { step, setStep, pendingImport } = useWizardStore();

  const batches = session?.batches ?? [];
  const allTx = batches.flatMap((b) => b.transactions);

  const stepEnabled = (s: WizardStep): boolean => {
    switch (s) {
      case 'client':
        return true;
      case 'import':
        return session !== null;
      case 'map':
        return pendingImport !== null;
      case 'review':
      case 'categorize':
        return batches.length > 0;
      case 'totals':
        return batches.length > 0 && !hasBlockingErrors(allTx);
    }
  };

  const stepDone = (s: WizardStep): boolean => {
    switch (s) {
      case 'client':
        return session !== null;
      case 'import':
        return batches.length > 0;
      case 'map':
        return batches.length > 0 && pendingImport === null;
      case 'review':
        return batches.length > 0 && !hasBlockingErrors(allTx);
      case 'categorize':
      case 'totals':
        return false;
    }
  };

  const save = async () => {
    if (!session) return;
    const path = await saveFile(
      serializeSession(session),
      defaultSessionFileName(session.clientName, session.taxYear),
      [{ name: 'Client session', extensions: ['8949c'] }],
    );
    if (path) markSaved(path);
  };

  return (
    <nav className="wizard-nav">
      <div className="wizard-nav-brand">
        <h1>8949 Importer</h1>
        <p>for TaxSlayer Pro Desktop</p>
      </div>
      {session && (
        <div className="wizard-nav-client">
          <strong>{session.clientName || 'Unnamed client'}</strong>
          <span>Tax year {session.taxYear}</span>
          <button type="button" className="btn btn-small" onClick={save}>
            {dirty ? 'Save session*' : 'Save session'}
          </button>
        </div>
      )}
      <ol className="wizard-steps">
        {STEP_ORDER.map((s, i) => {
          const enabled = stepEnabled(s);
          const isCurrent = step === s;
          return (
            <li key={s}>
              <button
                type="button"
                className={`wizard-step${isCurrent ? ' current' : ''}${enabled ? '' : ' disabled'}`}
                disabled={!enabled}
                onClick={() => setStep(s)}
              >
                <span className="wizard-step-num">{stepDone(s) ? '✓' : i + 1}</span>
                {STEP_LABELS[s]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="wizard-nav-privacy">
        <p>
          All data stays on this computer. Nothing is uploaded — client files live only where you
          save them.
        </p>
      </div>
    </nav>
  );
}
