import { detect1099b, issueCounts, matchPreset } from '@tsp8949/core';
import { useState } from 'react';
import { decodeText, pickFile } from '../platform/files';
import { loadPresets, sha256Hex } from '../platform/presetsRepo';
import { useSessionStore } from '../state/sessionStore';
import { useWizardStore } from '../state/wizardStore';
import { parseCsvInWorker } from '../workers/parseClient';
import { extractPositionedText } from '../workers/pdfText';

export function ImportScreen() {
  const { session, removeBatch } = useSessionStore();
  const { setPendingImport, setStep, busy, setBusy } = useWizardStore();
  const [error, setError] = useState<string | null>(null);

  const importCsv = async () => {
    setError(null);
    const picked = await pickFile([
      { name: 'CSV / spreadsheet export', extensions: ['csv', 'txt'] },
    ]);
    if (!picked) return;
    setBusy(`Reading ${picked.name}…`);
    try {
      const { sniffed, suggested } = await parseCsvInWorker(decodeText(picked.bytes));
      if (sniffed.rows.length === 0) {
        setError('No data rows were found in that file — check that it contains transactions.');
        return;
      }
      const store = await loadPresets();
      const presetMatch = await matchPreset(sniffed.headers, store.presets, sha256Hex);
      setPendingImport({
        kind: 'csv',
        fileName: picked.name,
        sniffed,
        mapping: presetMatch ? presetMatch.preset.mapping : suggested,
        presetMatch,
        defaultBox: presetMatch?.preset.defaultBox ?? 'A',
      });
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that CSV file');
    } finally {
      setBusy(null);
    }
  };

  const importPdf = async () => {
    setError(null);
    const picked = await pickFile([{ name: 'Broker 1099-B PDF', extensions: ['pdf'] }]);
    if (!picked) return;
    setBusy(`Extracting text from ${picked.name}…`);
    try {
      const items = await extractPositionedText(picked.bytes);
      const result = detect1099b(items);
      if (result.looksScanned) {
        setError(
          'That PDF has no extractable text — it is likely a scan or photo. Scanned-document support (OCR) is planned; for now, request the CSV export from the broker or a text-based PDF.',
        );
        return;
      }
      if (result.sections.length === 0) {
        setError(
          'No 1099-B transaction tables were recognized in that PDF. If this is a real broker statement, please report the layout so support can be added — or import the CSV export instead.',
        );
        return;
      }
      setPendingImport({ kind: 'pdf', fileName: picked.name, sections: result.sections });
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that PDF file');
    } finally {
      setBusy(null);
    }
  };

  const batches = session?.batches ?? [];

  return (
    <section className="screen">
      <h2>Import transactions</h2>
      <p className="screen-intro">
        Import each broker or exchange file for this client. CSVs go through the column mapper;
        digital broker 1099-B PDFs are detected automatically. Repeat for as many files as the
        return needs.
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={importCsv}
          disabled={busy !== null}
        >
          Import CSV…
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={importPdf}
          disabled={busy !== null}
        >
          Import broker PDF…
        </button>
      </div>
      {busy && <p className="busy-banner">{busy}</p>}
      {error && <p className="error-banner">{error}</p>}

      {batches.length > 0 && (
        <div className="card">
          <h3>Imported batches</h3>
          <table className="batch-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>File</th>
                <th>Rows</th>
                <th>Box</th>
                <th>Issues</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const counts = issueCounts(batch.transactions);
                return (
                  <tr key={batch.id}>
                    <td>{batch.label}</td>
                    <td>{batch.sourceFileName}</td>
                    <td>{batch.transactions.length}</td>
                    <td>{batch.basisBox}</td>
                    <td>
                      {counts.errors > 0 && (
                        <span className="pill pill-error">{counts.errors} errors</span>
                      )}{' '}
                      {counts.warnings > 0 && (
                        <span className="pill pill-warn">{counts.warnings} warnings</span>
                      )}
                      {counts.errors === 0 && counts.warnings === 0 && (
                        <span className="pill pill-ok">clean</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => removeBatch(batch.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => setStep('review')}>
              Continue to Review →
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
