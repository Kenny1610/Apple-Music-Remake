# TaxSlayer Pro 8949 Importer

A Windows desktop app that eliminates manual entry of stock and crypto transactions for
**TaxSlayer Pro Desktop** preparers.

TaxSlayer Pro Desktop has no way to import capital-gains transactions — every trade must be
keyed in by hand. But IRS **Form 8949 Exception 2** allows entering *summary totals per
category* (short/long-term × Box A–F) with an attached statement containing the
per-transaction detail. TaxSlayer Pro Desktop supports attaching that statement as a PDF to
the e-filed return (2 MB limit per file).

**This app turns any broker CSV or digital 1099-B PDF into:**

1. The six category summary totals the preparer keys into TaxSlayer Pro (6 entries instead of
   thousands), with one-click copy per field, and
2. An IRS-compliant Form 8949 statement PDF to attach — text-only rendering keeps ~10,000
   transactions around 0.5–0.8 MB, and anything larger is automatically split into multiple
   attachable files with per-file subtotals.

**Privacy:** everything runs locally. There is no server, no account, no network code. Client
data (names, SSNs) exists only in the `.8949c` session files and PDFs the preparer saves.

## Features

- **Generic CSV importer** with an interactive column mapper — works with any broker or
  exchange export. Auto-suggested mappings, live normalized preview, and saved presets that
  auto-match the next file with the same headers (exact fingerprint or fuzzy match).
- **Digital broker 1099-B PDF import** — detects Short/Long-Term Box A–F sections, extracts the
  transaction tables (multi-page tables, multi-line descriptions), reconciles against the
  totals printed in the PDF, and flows everything into the same review pipeline. Scanned PDFs
  are detected and rejected with guidance (OCR is on the roadmap).
- **Review & fix grid** (virtualized — smooth at 10,000+ rows) with inline editing, error/warning
  filters, row exclusion, and a reconciliation banner against source-file totals.
- **Correct tax math by construction**: integer-cents money (no floats), holding-period
  computation per the IRS anniversary rule, "Various"/"Inherited" as first-class dates,
  wash-sale adjustments (code W auto-implied from wash-sale columns), gain always derived as
  proceeds − basis + adjustment, and per-transaction IRS whole-dollar rounding so the grid,
  the totals cards, and the PDF always agree to the penny.
- **Client sessions**: save/reopen a `.8949c` file per client; unsaved-changes guard.

## Project layout

```
packages/core     Pure TypeScript tax-domain logic — CSV sniffing, column mapping,
                  normalization/validation, term & bucket math, totals, rounding,
                  PDF table extraction, session schema. Zero UI/Tauri deps; 86 unit
                  tests incl. real-format broker fixtures.
apps/desktop      Tauri v2 + React + Vite app. Wizard UI (Client → Import → Map →
                  Review → Categorize → Totals & Export), statement PDF generator
                  (pdf-lib), platform layer (file dialogs, presets, clipboard).
```

## Development

Prereqs: Node 20+, pnpm 10, Rust stable (for the Tauri shell).

```bash
pnpm install
pnpm test        # core + desktop unit tests
pnpm typecheck
pnpm lint
pnpm dev         # vite dev server (browser mode with fallback file dialogs)
pnpm tauri dev   # full desktop app
pnpm tauri build # Windows installer (.msi / NSIS)
```

The frontend runs in a plain browser during development (file pickers and downloads fall back
to web APIs); the Tauri shell provides native dialogs, scoped filesystem access, and the
clipboard on Windows.

## Verification

- `pnpm test` — 93 tests: money/date parsing edge cases, IRS anniversary rule, rounding,
  six-bucket totals hand-verified against three broker-format fixtures, PDF section
  detection, pagination plan, and a 10,000-transaction size proof (< 1.8 MB).
- End-to-end: the wizard has been driven headlessly (Playwright) from client creation through
  CSV imports, grid editing, categorization, and PDF generation, with the output PDF verified
  against hand-computed totals.

## Roadmap

- Undo stack in the review grid
- Broker-specific presets bundled in (Schwab, Fidelity, Robinhood, Coinbase…)
- Scanned-PDF OCR
- Optional passphrase encryption (AES-GCM) of `.8949c` session files
- Code signing for the Windows installer
- dd/MM (non-US) date format support
