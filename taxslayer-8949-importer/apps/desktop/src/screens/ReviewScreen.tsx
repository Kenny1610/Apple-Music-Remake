import { formatCents, hasBlockingErrors, reconcileBatch } from '@tsp8949/core';
import { useState } from 'react';
import { TransactionGrid } from '../components/TransactionGrid';
import { useSessionStore } from '../state/sessionStore';
import { useWizardStore } from '../state/wizardStore';

export function ReviewScreen() {
  const session = useSessionStore((s) => s.session);
  const setStep = useWizardStore((s) => s.setStep);
  const batches = session?.batches ?? [];
  const [activeBatchId, setActiveBatchId] = useState<string | null>(batches[0]?.id ?? null);

  if (batches.length === 0) {
    return (
      <section className="screen">
        <h2>Review & fix</h2>
        <p className="screen-intro">Nothing imported yet — add a file on the Import step.</p>
      </section>
    );
  }

  const active = batches.find((b) => b.id === activeBatchId) ?? batches[0]!;
  const reconciliation = reconcileBatch(active);
  const included = active.transactions.filter((t) => !t.excluded);
  const proceeds = included.reduce((sum, t) => sum + t.proceeds, 0);
  const basis = included.reduce((sum, t) => sum + t.costBasis, 0);
  const blocked = hasBlockingErrors(batches.flatMap((b) => b.transactions));

  return (
    <section className="screen screen-tall">
      <h2>Review & fix</h2>
      <div className="tab-row">
        {batches.map((batch) => (
          <button
            key={batch.id}
            type="button"
            className={`tab${batch.id === active.id ? ' active' : ''}`}
            onClick={() => setActiveBatchId(batch.id)}
          >
            {batch.label} ({batch.transactions.length})
          </button>
        ))}
      </div>

      {reconciliation && !reconciliation.ok && (
        <p className="warn-banner">
          The totals in the source file disagree with the imported rows (proceeds off by{' '}
          {formatCents(reconciliation.proceedsDelta)}; basis off by{' '}
          {formatCents(reconciliation.basisDelta)}). Check for missed or duplicated rows before
          exporting.
        </p>
      )}
      {reconciliation?.ok && (
        <p className="ok-banner">
          Imported rows reconcile with the totals printed in the source file.
        </p>
      )}

      <TransactionGrid batchId={active.id} transactions={active.transactions} />

      <footer className="review-footer">
        <span>
          {included.length} included rows — proceeds {formatCents(proceeds)}, basis{' '}
          {formatCents(basis)}
        </span>
        <button
          type="button"
          className="btn btn-primary"
          disabled={blocked}
          title={blocked ? 'Fix all error rows (or exclude them) first' : ''}
          onClick={() => setStep('categorize')}
        >
          Continue to Categorize →
        </button>
      </footer>
    </section>
  );
}
