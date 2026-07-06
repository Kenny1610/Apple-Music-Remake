import {
  type RoundingMode,
  formatCents,
  formatWholeDollars,
  isShortTermCategory,
  nonEmptyTotals,
  summarize,
  toNormalizedCsv,
} from '@tsp8949/core';
import { useMemo, useState } from 'react';
import { CopyField } from '../components/CopyField';
import { generateStatements } from '../pdf/form8949Pdf';
import { saveFile } from '../platform/files';
import { useSessionStore } from '../state/sessionStore';

export function TotalsExportScreen() {
  const { session, setRoundingMode } = useSessionStore();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(
    () => (session ? nonEmptyTotals(summarize(session.batches, session.roundingMode)) : []),
    [session],
  );

  if (!session || totals.length === 0) {
    return (
      <section className="screen">
        <h2>Totals & export</h2>
        <p className="screen-intro">No categorized transactions yet.</p>
      </section>
    );
  }

  const fmt = (cents: number) =>
    session.roundingMode === 'whole-dollar' ? formatWholeDollars(cents) : formatCents(cents);

  const generatePdf = async () => {
    setError(null);
    setStatus('Generating statement PDF…');
    try {
      const files = await generateStatements(
        session.batches,
        session.roundingMode,
        summarize(session.batches, session.roundingMode),
        { clientName: session.clientName, tin: session.tin, taxYear: session.taxYear },
      );
      const sizes = files
        .map((f) => `${f.fileName} (${(f.bytes.length / 1024).toFixed(0)} KB)`)
        .join(', ');
      for (const file of files) {
        const saved = await saveFile(file.bytes, file.fileName, [
          { name: 'PDF', extensions: ['pdf'] },
        ]);
        if (saved === null) {
          setStatus(null);
          return; // user canceled
        }
      }
      setStatus(
        `Saved ${files.length} PDF${files.length > 1 ? 's' : ''}: ${sizes}. ${
          files.length > 1
            ? 'Attach every file to the e-filed return.'
            : 'Attach it to the e-filed return.'
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF generation failed');
      setStatus(null);
    }
  };

  const exportCsv = async () => {
    setError(null);
    const csv = toNormalizedCsv(session.batches, session.roundingMode);
    const name = `${session.clientName.split(',')[0]?.trim() || 'client'}_${session.taxYear}_normalized.csv`;
    const saved = await saveFile(csv, name.replace(/\s+/g, '_'), [
      { name: 'CSV', extensions: ['csv'] },
    ]);
    if (saved) setStatus(`Saved ${saved}`);
  };

  return (
    <section className="screen">
      <h2>Totals & export</h2>
      <p className="screen-intro">
        Key these six-category totals into TaxSlayer Pro Desktop (Schedule D → capital gains →{' '}
        <em>exception to reporting each transaction</em> entry, one entry per box), then attach the
        generated statement PDF to the e-filed return.
      </p>

      <label className="rounding-toggle">
        Amounts:{' '}
        <select
          value={session.roundingMode}
          onChange={(e) => setRoundingMode(e.target.value as RoundingMode)}
        >
          <option value="whole-dollar">Whole dollars (IRS convention)</option>
          <option value="cents">Exact cents</option>
        </select>
      </label>

      <div className="totals-grid">
        {totals.map((t) => (
          <div className="card totals-card" key={t.category}>
            <h3>
              Box {t.category} — {isShortTermCategory(t.category) ? 'Short-term' : 'Long-term'}
              <span className="totals-count">{t.count} transactions</span>
            </h3>
            <CopyField label="Proceeds" value={fmt(t.proceeds)} />
            <CopyField label="Cost basis" value={fmt(t.costBasis)} />
            {t.adjustment !== 0 && (
              <CopyField label="Adjustment" value={fmt(t.adjustment)} negative={t.adjustment < 0} />
            )}
            <CopyField label="Gain/loss" value={fmt(t.gainLoss)} negative={t.gainLoss < 0} />
          </div>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={generatePdf}>
          Generate Form 8949 statement PDF…
        </button>
        <button type="button" className="btn" onClick={exportCsv}>
          Export normalized CSV…
        </button>
      </div>
      {status && <p className="ok-banner">{status}</p>}
      {error && <p className="error-banner">{error}</p>}

      <div className="card checklist">
        <h3>TaxSlayer Pro Desktop checklist</h3>
        <ol>
          <li>
            In the return, open Schedule D and choose the option to aggregate transactions
            (“exception to reporting each transaction on a separate row”).
          </li>
          <li>
            Enter one summary entry per box shown above — proceeds, cost basis, adjustment,
            gain/loss.
          </li>
          <li>
            Attach the generated statement PDF(s) to the electronic return (each file is under the 2
            MB limit).
          </li>
          <li>Keep the normalized CSV with the client workpapers.</li>
        </ol>
      </div>
    </section>
  );
}
