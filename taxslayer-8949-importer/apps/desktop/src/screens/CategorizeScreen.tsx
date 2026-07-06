import {
  type BasisBox,
  type Term,
  effectiveTerm,
  formatTxDate,
  unresolvedTermCount,
} from '@tsp8949/core';
import { useSessionStore } from '../state/sessionStore';
import { useWizardStore } from '../state/wizardStore';

const BOX_CARDS: { box: BasisBox; title: string; help: string }[] = [
  {
    box: 'A',
    title: 'Box A / D',
    help: 'Reported on a 1099-B and the broker reported basis to the IRS (typical brokerage 1099-B).',
  },
  {
    box: 'B',
    title: 'Box B / E',
    help: 'Reported on a 1099-B but basis was NOT reported to the IRS.',
  },
  {
    box: 'C',
    title: 'Box C / F',
    help: 'Not reported on a 1099-B at all — typical for crypto exchanges.',
  },
];

export function CategorizeScreen() {
  const { session, setBatchBox, bulkResolveTerm, setTermOverride } = useSessionStore();
  const setStep = useWizardStore((s) => s.setStep);
  const batches = session?.batches ?? [];
  const totalUnresolved = batches.reduce((n, b) => n + unresolvedTermCount(b), 0);

  return (
    <section className="screen">
      <h2>Categorize</h2>
      <p className="screen-intro">
        Each batch gets the basis-reporting box from its source document, and every transaction
        needs a holding period. Short-term goes to Part I (Box A/B/C), long-term to Part II (Box
        D/E/F).
      </p>

      {batches.map((batch) => {
        const unresolved = batch.transactions.filter(
          (tx) => !tx.excluded && effectiveTerm(tx) === null,
        );
        const shortCount = batch.transactions.filter(
          (tx) => !tx.excluded && effectiveTerm(tx) === 'short',
        ).length;
        const longCount = batch.transactions.filter(
          (tx) => !tx.excluded && effectiveTerm(tx) === 'long',
        ).length;

        return (
          <div className="card" key={batch.id}>
            <h3>{batch.label}</h3>
            <div className="box-cards">
              {BOX_CARDS.map(({ box, title, help }) => (
                <button
                  key={box}
                  type="button"
                  className={`box-card${batch.basisBox === box ? ' active' : ''}`}
                  onClick={() => setBatchBox(batch.id, box)}
                >
                  <strong>{title}</strong>
                  <span>{help}</span>
                </button>
              ))}
            </div>
            <p className="term-summary">
              {shortCount} short-term · {longCount} long-term ·{' '}
              {unresolved.length > 0 ? (
                <strong className="term-unresolved">{unresolved.length} unresolved</strong>
              ) : (
                <span className="pill pill-ok">all terms resolved</span>
              )}
            </p>
            {unresolved.length > 0 && (
              <>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => bulkResolveTerm(batch.id, 'short')}
                  >
                    Set all unresolved → Short
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => bulkResolveTerm(batch.id, 'long')}
                  >
                    Set all unresolved → Long
                  </button>
                </div>
                <table className="batch-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Acquired</th>
                      <th>Sold</th>
                      <th>Term</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unresolved.slice(0, 50).map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.description}</td>
                        <td>{formatTxDate(tx.dateAcquired)}</td>
                        <td>{formatTxDate(tx.dateSold)}</td>
                        <td>
                          <select
                            value=""
                            onChange={(e) =>
                              e.target.value &&
                              setTermOverride(batch.id, tx.id, e.target.value as Term)
                            }
                          >
                            <option value="">choose…</option>
                            <option value="short">short</option>
                            <option value="long">long</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unresolved.length > 50 && (
                  <p className="grid-hint">
                    Showing the first 50 — use the bulk buttons above for the rest.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={totalUnresolved > 0}
          title={totalUnresolved > 0 ? 'Resolve all holding periods first' : ''}
          onClick={() => setStep('totals')}
        >
          Continue to Totals & Export →
        </button>
      </div>
    </section>
  );
}
