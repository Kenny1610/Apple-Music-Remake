import {
  type BasisBox,
  type ColumnMapping,
  type MappableField,
  REQUIRED_FIELDS,
  applyMapping,
  buildBatch,
  fingerprintHeaders,
  formatCents,
  formatTxDate,
  normalizeRow,
  suggestMapping,
  upsertPreset,
} from '@tsp8949/core';
import { useMemo, useState } from 'react';
import { loadPresets, savePresets, sha256Hex } from '../platform/presetsRepo';
import { useSessionStore } from '../state/sessionStore';
import { useWizardStore } from '../state/wizardStore';

const FIELD_LABELS: { field: MappableField; label: string; required?: boolean }[] = [
  { field: 'description', label: 'Description' },
  { field: 'quantity', label: 'Quantity (if composing description)' },
  { field: 'assetName', label: 'Asset / symbol (if composing description)' },
  { field: 'dateAcquired', label: 'Date acquired' },
  { field: 'dateSold', label: 'Date sold', required: true },
  { field: 'proceeds', label: 'Proceeds', required: true },
  { field: 'costBasis', label: 'Cost basis', required: true },
  { field: 'adjustmentAmount', label: 'Adjustment amount (wash sale)' },
  { field: 'adjustmentCode', label: 'Adjustment code' },
  { field: 'termIndicator', label: 'Term indicator (Short/Long)' },
  { field: 'gainLoss', label: 'Broker gain/loss (cross-check only)' },
];

const BOX_HELP: Record<BasisBox, string> = {
  A: 'Box A/D — 1099-B with basis reported to the IRS',
  B: 'Box B/E — 1099-B, basis NOT reported to the IRS',
  C: 'Box C/F — not reported on a 1099-B (typical for crypto)',
};

export function MapColumnsScreen() {
  const { addBatch } = useSessionStore();
  const { pendingImport, setPendingImport, updateCsvMapping, setStep } = useWizardStore();
  const [presetName, setPresetName] = useState('');
  const [box, setBox] = useState<BasisBox>(
    pendingImport?.kind === 'csv' ? pendingImport.defaultBox : 'A',
  );
  const [label, setLabel] = useState(pendingImport?.fileName.replace(/\.[^.]+$/, '') ?? '');

  const preview = useMemo(() => {
    if (pendingImport?.kind !== 'csv') return [];
    const mapped = applyMapping(pendingImport.sniffed.rows.slice(0, 5), pendingImport.mapping);
    let i = 0;
    return mapped.map((m) => normalizeRow(m, { makeId: () => `preview-${i++}` }));
  }, [pendingImport]);

  if (!pendingImport) {
    return (
      <section className="screen">
        <h2>Map columns</h2>
        <p className="screen-intro">No file is being imported — go to the Import step.</p>
      </section>
    );
  }

  // ---------- PDF confirmation ----------
  if (pendingImport.kind === 'pdf') {
    const addAll = () => {
      for (const section of pendingImport.sections) {
        const mapping = suggestMapping(section.headers);
        addBatch(
          buildBatch({
            label: `${label || pendingImport.fileName} — ${section.label}`,
            sourceFileName: pendingImport.fileName,
            source: 'pdf',
            basisBox: section.basisBox ?? 'C',
            rows: section.rows,
            mapping,
            makeId: () => crypto.randomUUID(),
            ...(section.term ? { forcedTerm: section.term } : {}),
            ...(section.sourceTotals ? { sourceTotals: section.sourceTotals } : {}),
          }),
        );
      }
      setPendingImport(null);
      setStep('review');
    };

    return (
      <section className="screen">
        <h2>Confirm PDF extraction</h2>
        <p className="screen-intro">
          These transaction sections were detected in <strong>{pendingImport.fileName}</strong>.
          Every extracted row lands in the Review grid where you can verify and correct it —
          extraction is never trusted blindly.
        </p>
        <div className="card">
          <label>
            Batch label
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <table className="batch-table">
            <thead>
              <tr>
                <th>Detected section</th>
                <th>Rows</th>
                <th>Totals printed in PDF</th>
              </tr>
            </thead>
            <tbody>
              {pendingImport.sections.map((s) => (
                <tr key={s.label + s.rows.length}>
                  <td>{s.label}</td>
                  <td>{s.rows.length}</td>
                  <td>
                    {s.sourceTotals?.proceeds != null
                      ? `proceeds ${formatCents(s.sourceTotals.proceeds)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={addAll}>
              Add {pendingImport.sections.reduce((n, s) => n + s.rows.length, 0)} transactions →
            </button>
            <button type="button" className="btn" onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ---------- CSV mapping ----------
  const { sniffed, mapping, presetMatch } = pendingImport;
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mapping.fields[f]);
  const needsDescription =
    mapping.descriptionMode === 'single-column'
      ? !mapping.fields.description
      : !mapping.fields.quantity || !mapping.fields.assetName;

  const setField = (field: MappableField, header: string) => {
    const fields = { ...mapping.fields };
    if (header === '') delete fields[field];
    else fields[field] = header;
    updateCsvMapping({ ...mapping, fields });
  };

  const addToReturn = async () => {
    const batch = buildBatch({
      label: label || pendingImport.fileName,
      sourceFileName: pendingImport.fileName,
      source: 'csv',
      basisBox: box,
      rows: sniffed.rows,
      mapping,
      makeId: () => crypto.randomUUID(),
      ...(sniffed.sourceTotals ? { sourceTotals: sniffed.sourceTotals } : {}),
      ...(presetMatch ? { mappingPresetId: presetMatch.preset.id } : {}),
    });
    if (presetName.trim() !== '') {
      const store = await loadPresets();
      const fingerprint = await fingerprintHeaders(sniffed.headers, sha256Hex);
      await savePresets(
        upsertPreset(store, {
          id: crypto.randomUUID(),
          name: presetName.trim(),
          fingerprint,
          headers: sniffed.headers,
          mapping,
          defaultBox: box,
          lastUsed: new Date().toISOString(),
        }),
      );
    }
    addBatch(batch);
    setPendingImport(null);
    setStep('review');
  };

  return (
    <section className="screen">
      <h2>Map columns</h2>
      {presetMatch && (
        <p className="ok-banner">
          {presetMatch.kind === 'exact'
            ? `Applied your saved preset “${presetMatch.preset.name}”.`
            : `This file looks like your “${presetMatch.preset.name}” preset (${Math.round(presetMatch.similarity * 100)}% match) — its mapping was applied. Adjust below if needed.`}
        </p>
      )}
      <div className="map-layout">
        <div className="card map-fields">
          <label>
            Batch label
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label>
            Basis reporting (per 1099-B section)
            <select value={box} onChange={(e) => setBox(e.target.value as BasisBox)}>
              {(['A', 'B', 'C'] as BasisBox[]).map((b) => (
                <option key={b} value={b}>
                  {BOX_HELP[b]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description source
            <select
              value={mapping.descriptionMode}
              onChange={(e) =>
                updateCsvMapping({
                  ...mapping,
                  descriptionMode: e.target.value as ColumnMapping['descriptionMode'],
                })
              }
            >
              <option value="single-column">One column has the full description</option>
              <option value="quantity-plus-asset">Compose from quantity + asset (crypto)</option>
            </select>
          </label>
          {FIELD_LABELS.map(({ field, label: fieldLabel, required }) => {
            const isRequired =
              required ||
              (field === 'description' && mapping.descriptionMode === 'single-column') ||
              ((field === 'quantity' || field === 'assetName') &&
                mapping.descriptionMode === 'quantity-plus-asset');
            const missing = isRequired && !mapping.fields[field];
            return (
              <label key={field} className={missing ? 'field-missing' : ''}>
                {fieldLabel}
                {isRequired ? ' *' : ''}
                <select
                  value={mapping.fields[field] ?? ''}
                  onChange={(e) => setField(field, e.target.value)}
                >
                  <option value="">— not in this file —</option>
                  {sniffed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
        <div className="card map-preview">
          <h3>Preview (first {preview.length} rows, after normalization)</h3>
          <table className="batch-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Acquired</th>
                <th>Sold</th>
                <th>Proceeds</th>
                <th>Cost basis</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.description}</td>
                  <td>{formatTxDate(tx.dateAcquired)}</td>
                  <td>{formatTxDate(tx.dateSold)}</td>
                  <td className="num">{formatCents(tx.proceeds)}</td>
                  <td className="num">{formatCents(tx.costBasis)}</td>
                  <td className="grid-issues">{tx.issues.map((i) => i.code).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label>
            Save this mapping as a preset (optional)
            <input
              placeholder="e.g. Fidelity 1099-B"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </label>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={missingRequired.length > 0 || needsDescription}
              onClick={addToReturn}
            >
              Add {sniffed.rows.length} transactions →
            </button>
            <button type="button" className="btn" onClick={() => setPendingImport(null)}>
              Cancel
            </button>
          </div>
          {(missingRequired.length > 0 || needsDescription) && (
            <p className="error-banner">Map the required fields (marked *) before continuing.</p>
          )}
        </div>
      </div>
    </section>
  );
}
