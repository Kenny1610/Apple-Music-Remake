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
- **TaxSlayer entry mode (hands-free)**: instead of typing the summary totals into TaxSlayer
  Pro, start entry mode — the app becomes a small always-on-top panel showing the next value,
  you click into the TaxSlayer field and press **Ctrl+Shift+V**, and the app types the value
  for you (real Windows keystrokes into whatever field has focus — works with any TaxSlayer
  version), optionally followed by Tab. **Ctrl+Shift+Q** stops; the queue walks every box's
  proceeds → cost basis → adjustment in order and the window restores itself when done.

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

## Testing on your PC (no dev tools needed)

Every push to `main` (and any manual "Run workflow" from the Actions tab) builds a Windows
installer in CI:

1. Open the repository's **Actions** tab → latest green **CI** run → **Artifacts** →
   download `installers-windows-latest`.
2. Unzip and run the `.msi` (or NSIS `.exe`). The build is not code-signed yet, so Windows
   SmartScreen will warn — click **More info → Run anyway**.
3. Test with a real broker export, or grab
   `packages/core/test/fixtures/fidelity-style.csv` from this repo for a known-good sample
   (it exercises preamble skipping, wash sales, "Various" dates, and a totals row).
4. For the entry-mode keystroke test, follow the manual script below — try Notepad before
   TaxSlayer Pro.

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

### Manual test script for entry mode (Windows only)

Keystroke synthesis can only be validated on a real Windows machine — run this once per
release build:

1. Reach Totals & Export with at least two non-empty boxes; click **Start TaxSlayer entry
   mode**. The window should shrink to a small always-on-top panel (min-size limit lifted).
2. Open Notepad (stand-in for TaxSlayer), click into it, press **Ctrl+Shift+V** — the first
   value should appear with no stray characters. Hold Ctrl+Shift down deliberately long: the
   typed text must still be clean (modifier-race guard).
3. Toggle "Tab after each value" off and on; confirm the Tab keystroke follows accordingly.
4. Press the hotkey while the panel itself is focused → it should warn instead of typing.
5. Rapid-fire the hotkey → values must come out one at a time, in order (typing guard).
6. **Ctrl+Shift+Q** and the Stop button must both restore the original window size/position.
7. Run the full queue to exhaustion → mode auto-stops and the wizard returns.
8. With another app owning Ctrl+Shift+V (e.g. register it in AutoHotkey first), starting entry
   mode should surface a warning banner; Skip/copy still work.
9. Finally, repeat step 2 inside TaxSlayer Pro's "exception to reporting each transaction"
   entry screen and verify a full six-box return end-to-end.

## Roadmap

- Undo stack in the review grid
- Broker-specific presets bundled in (Schwab, Fidelity, Robinhood, Coinbase…)
- Scanned-PDF OCR
- Optional passphrase encryption (AES-GCM) of `.8949c` session files
- Code signing for the Windows installer
- dd/MM (non-US) date format support
