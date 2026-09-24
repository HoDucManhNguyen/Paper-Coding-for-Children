# PaperCode Lab

PaperCode Lab is a local research prototype that lets a child photograph a short handwritten arithmetic program, inspect the recognized text, and see line-by-line results. **Version 1.1 uses Apple Vision on macOS for handwriting.** Static hosting retains a separately labelled printed-text mode only.

```text
x = 5
y = 10
z = 7
x + y * z   → 75
```

## What works

- Live camera capture and image uploads. Handwriting mode currently runs on the Mac; phone/tablet static previews only offer printed-text OCR.
- Native macOS handwriting recognition through a loopback-only service; images stay in memory on the Mac.
- Original and contrast-enhanced readings with spatial row assembly, visible raw text, and a preview of the exact captured region.
- Camera capture matches the visible scan frame, including cropped portrait/landscape previews.
- No guessed digits or variable names. The previous `4`→`+`, `5`→`3`, and unknown-glyph substitutions have been removed.
- A deliberately small language: variables, decimal numbers, parentheses, `+ - * / ^`, and `#` comments.
- A real tokenizer and recursive-descent interpreter. No `eval`, no dynamic JavaScript execution.
- Line-by-line results and localized errors beside the recognized code.
- Manual correction before rerunning, because an OCR confidence score is not proof that code is correct.
- Responsive Vietnamese interface and keyboard support (`Ctrl/⌘ + Enter` to run).

## Quick start

For handwriting, use macOS 13 or newer, Python 3.10+, and Apple's Swift Command Line Tools. If those tools are missing, install them with `xcode-select --install`. Then run from this repository:

```bash
python3 scripts/serve.py
```

Or use `npm start` if Node.js is installed. First launch compiles the native helper into `.runtime/`; subsequent launches reuse it. Open `http://127.0.0.1:4173`, check that **Chữ viết tay trên Mac** is selected, allow camera access, and select **Quét & chạy**. The sample program is only loaded by the explicit sample button. A failed scan never leaves old sample results looking like a new recognition.

The service listens on 127.0.0.1 only; it is not a public web server. If port 4173 is occupied, stop the old preview or use `python3 scripts/serve.py --port 4174`. Serving only `dist/` with a generic static server does **not** enable handwriting mode.

## Verify

Requires Node.js 20 or later.

```bash
npm test
npm run test:server
npm run check
```

To reproduce the committed OCR bundle from the lockfile:

```bash
npm ci
npm run vendor:sync
```

## Language reference

| Form | Example | Meaning |
| --- | --- | --- |
| Assignment | `width = 8` | Store a numeric value |
| Expression | `width * 2 + 1` | Calculate and show a result |
| Parentheses | `(x + y) * 2` | Override normal precedence |
| Power | `2 ^ 3` | Exponentiation |
| Comment | `x = 4 # note` | Ignore text after `#` |

Identifiers use ASCII letters, digits, and underscores, and must start with a letter or underscore. Decimal numbers use a dot. The input is capped at 80 lines and 4,000 characters.

## Research position

This repository is a working research prototype, not evidence of learning effectiveness. See [docs/RESEARCH.md](docs/RESEARCH.md), the [experiment protocol](docs/EXPERIMENT_PROTOCOL.md), and [v1.1 OCR validation](docs/OCR_VALIDATION.md), including successful cases and a remaining z/2 failure on faint grid paper. Developer examples are not a held-out accuracy benchmark.

## Privacy and limitations

Handwriting images are posted to the same-origin `/api/ocr` endpoint on 127.0.0.1, piped in memory to Apple Vision, and discarded when the process exits. No cloud provider, account, database, analytics, or image storage is used. The server permits one OCR job at a time, limits input to 8 MB, and terminates recognition after 30 seconds. Browser mode uses the bundled Tesseract assets for printed text.

OCR can still misread handwriting, especially faint strokes and z/2. Conflicting or low-confidence readings are displayed with a review label and provisional arithmetic. Inspect the captured image and raw readings before accepting a result. Normalization is limited to mathematical typography, Cyrillic x/y lookalikes, and single-letter uppercase names to lowercase; each change is recorded. Digits and missing operators are never inferred. Do not use this prototype for assessment, grading, or high-stakes decisions.

## Repository map

- `dist/` — deployable static application
- `native/` — on-device Apple Vision helper
- `scripts/serve.py` — local HTTP service and native build launcher
- `scripts/evaluate-ocr.mjs` — reproducible OCR evaluation against an optional reference
- `test/` — interpreter, camera mapping, transcription, and service tests
- `docs/ARCHITECTURE.md` — component and data-flow notes
- `docs/RESEARCH.md` — evidence basis and product hypotheses
- `docs/EXPERIMENT_PROTOCOL.md` — staged evaluation protocol
- `SECURITY.md` — vulnerability reporting and security model

## License and citation

Source code is available under the MIT License. Academic reuse can cite the metadata in `CITATION.cff`.
