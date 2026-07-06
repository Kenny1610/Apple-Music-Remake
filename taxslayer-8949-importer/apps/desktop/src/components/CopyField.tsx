import { useState } from 'react';
import { copyText } from '../platform/clipboard';

interface Props {
  label: string;
  value: string;
  negative?: boolean;
}

/** A labeled value with one-click copy — the preparer keys these into TaxSlayer Pro. */
export function CopyField({ label, value, negative }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await copyText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="copy-field">
      <span className="copy-field-label">{label}</span>
      <button
        type="button"
        className={`copy-field-value${copied ? ' copied' : ''}${negative ? ' negative' : ''}`}
        onClick={copy}
        title="Copy to clipboard"
      >
        <span>{value}</span>
        <span className="copy-field-icon">{copied ? '✓ copied' : '⧉'}</span>
      </button>
    </div>
  );
}
