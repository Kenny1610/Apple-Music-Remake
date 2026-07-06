import { useVirtualizer } from '@tanstack/react-virtual';
import {
  type NormalizedTransaction,
  effectiveTerm,
  formatCents,
  formatTxDate,
  gainLoss,
} from '@tsp8949/core';
import { useRef, useState } from 'react';
import { type EditableField, useSessionStore } from '../state/sessionStore';

interface Props {
  batchId: string;
  transactions: NormalizedTransaction[];
}

const COLS: {
  key: EditableField | 'gain' | 'term' | 'exclude' | 'issues';
  label: string;
  width: number;
}[] = [
  { key: 'exclude', label: '', width: 34 },
  { key: 'description', label: 'Description', width: 220 },
  { key: 'dateAcquired', label: 'Acquired', width: 96 },
  { key: 'dateSold', label: 'Sold', width: 96 },
  { key: 'proceeds', label: 'Proceeds', width: 100 },
  { key: 'costBasis', label: 'Cost basis', width: 100 },
  { key: 'adjustmentCode', label: 'Code', width: 56 },
  { key: 'adjustmentAmount', label: 'Adjustment', width: 96 },
  { key: 'gain', label: 'Gain/loss', width: 100 },
  { key: 'term', label: 'Term', width: 64 },
  { key: 'issues', label: 'Issues', width: 260 },
];

function cellValue(tx: NormalizedTransaction, key: EditableField): string {
  switch (key) {
    case 'description':
      return tx.description;
    case 'dateAcquired':
      return formatTxDate(tx.dateAcquired);
    case 'dateSold':
      return formatTxDate(tx.dateSold);
    case 'proceeds':
      return formatCents(tx.proceeds);
    case 'costBasis':
      return formatCents(tx.costBasis);
    case 'adjustmentAmount':
      return tx.adjustmentAmount === 0 ? '' : formatCents(tx.adjustmentAmount);
    case 'adjustmentCode':
      return tx.adjustmentCodes.join(' ');
  }
}

function EditableCell({
  batchId,
  tx,
  field,
  width,
}: {
  batchId: string;
  tx: NormalizedTransaction;
  field: EditableField;
  width: number;
}) {
  const editTransaction = useSessionStore((s) => s.editTransaction);
  const [draft, setDraft] = useState<string | null>(null);
  const hasIssue = tx.issues.some((i) => i.field === field);

  return (
    <input
      className={`grid-cell-input${hasIssue ? ' has-issue' : ''}`}
      style={{ width }}
      value={draft ?? cellValue(tx, field)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== cellValue(tx, field)) {
          editTransaction(batchId, tx.id, field, draft);
        }
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

export type IssueFilter = 'all' | 'errors' | 'warnings';

export function TransactionGrid({ batchId, transactions }: Props) {
  const setExcluded = useSessionStore((s) => s.setExcluded);
  const [filter, setFilter] = useState<IssueFilter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = transactions.filter((tx) => {
    if (filter === 'all') return true;
    const severity = filter === 'errors' ? 'error' : 'warning';
    return tx.issues.some((i) => i.severity === severity);
  });

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  const errorCount = transactions.filter((t) =>
    t.issues.some((i) => i.severity === 'error'),
  ).length;
  const warningCount = transactions.filter((t) =>
    t.issues.some((i) => i.severity === 'warning'),
  ).length;
  const totalWidth = COLS.reduce((sum, c) => sum + c.width + 8, 0);

  return (
    <div className="grid-wrap">
      <div className="grid-toolbar">
        <button
          type="button"
          className={`chip${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({transactions.length})
        </button>
        <button
          type="button"
          className={`chip chip-error${filter === 'errors' ? ' active' : ''}`}
          onClick={() => setFilter('errors')}
        >
          Errors ({errorCount})
        </button>
        <button
          type="button"
          className={`chip chip-warn${filter === 'warnings' ? ' active' : ''}`}
          onClick={() => setFilter('warnings')}
        >
          Warnings ({warningCount})
        </button>
        <span className="grid-hint">
          Click a cell to edit; Enter commits. Checkbox excludes a row.
        </span>
      </div>
      <div className="grid-header" style={{ minWidth: totalWidth }}>
        {COLS.map((c) => (
          <span key={c.key} style={{ width: c.width }} className="grid-header-cell">
            {c.label}
          </span>
        ))}
      </div>
      <div className="grid-scroll" ref={scrollRef}>
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative', minWidth: totalWidth }}
        >
          {virtualizer.getVirtualItems().map((vRow) => {
            const tx = filtered[vRow.index]!;
            const term = effectiveTerm(tx);
            const worst = tx.issues.some((i) => i.severity === 'error')
              ? 'error'
              : tx.issues.length > 0
                ? 'warning'
                : '';
            return (
              <div
                key={tx.id}
                className={`grid-row ${worst}${tx.excluded ? ' excluded' : ''}`}
                style={{ transform: `translateY(${vRow.start}px)` }}
              >
                <span style={{ width: 34 }} className="grid-cell">
                  <input
                    type="checkbox"
                    checked={tx.excluded}
                    onChange={(e) => setExcluded(batchId, tx.id, e.target.checked)}
                    title="Exclude this row from the return"
                  />
                </span>
                {(
                  [
                    'description',
                    'dateAcquired',
                    'dateSold',
                    'proceeds',
                    'costBasis',
                    'adjustmentCode',
                    'adjustmentAmount',
                  ] as EditableField[]
                ).map((field) => (
                  <span
                    key={field}
                    className="grid-cell"
                    style={{ width: COLS.find((c) => c.key === field)!.width }}
                  >
                    <EditableCell
                      batchId={batchId}
                      tx={tx}
                      field={field}
                      width={COLS.find((c) => c.key === field)!.width - 6}
                    />
                  </span>
                ))}
                <span className="grid-cell num" style={{ width: 100 }}>
                  {formatCents(gainLoss(tx))}
                </span>
                <span className="grid-cell" style={{ width: 64 }}>
                  {term ?? '—'}
                </span>
                <span
                  className="grid-cell grid-issues"
                  style={{ width: 260 }}
                  title={tx.issues.map((i) => i.message).join('\n')}
                >
                  {tx.issues.map((i) => i.message).join('; ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
