import { parseSession } from '@tsp8949/core';
import { useState } from 'react';
import { decodeText, pickFile } from '../platform/files';
import { useSessionStore } from '../state/sessionStore';
import { useWizardStore } from '../state/wizardStore';

const CURRENT_TAX_YEAR = new Date().getFullYear() - 1;

export function ClientScreen() {
  const { newSession, openSession, session } = useSessionStore();
  const setStep = useWizardStore((s) => s.setStep);
  const [name, setName] = useState(session?.clientName ?? '');
  const [tin, setTin] = useState(session?.tin ?? '');
  const [taxYear, setTaxYear] = useState(session?.taxYear ?? CURRENT_TAX_YEAR);
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    if (name.trim() === '') {
      setError('Enter the client name (Last, First)');
      return;
    }
    newSession(name.trim(), tin.trim(), taxYear);
    setStep('import');
  };

  const open = async () => {
    setError(null);
    const picked = await pickFile([{ name: 'Client session', extensions: ['8949c', 'json'] }]);
    if (!picked) return;
    const result = parseSession(decodeText(picked.bytes));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    openSession(result.session, picked.path ?? null);
    setStep('import');
  };

  return (
    <section className="screen">
      <h2>Client</h2>
      <p className="screen-intro">
        Start a new client return or reopen a saved session file (<code>.8949c</code>). The name and
        SSN/TIN appear on every page of the generated Form 8949 statement.
      </p>
      <div className="card form-card">
        <label>
          Client name (Last, First)
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith, Jane" />
        </label>
        <label>
          SSN / TIN
          <input value={tin} onChange={(e) => setTin(e.target.value)} placeholder="123-45-6789" />
        </label>
        <label>
          Tax year
          <input
            type="number"
            value={taxYear}
            onChange={(e) => setTaxYear(Number.parseInt(e.target.value, 10) || CURRENT_TAX_YEAR)}
          />
        </label>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={create}>
            {session ? 'Update client & continue' : 'Create client'}
          </button>
          <button type="button" className="btn" onClick={open}>
            Open saved session…
          </button>
        </div>
        {error && <p className="error-banner">{error}</p>}
      </div>
    </section>
  );
}
