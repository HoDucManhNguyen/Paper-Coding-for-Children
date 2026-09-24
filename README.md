# PaperCode Lab

PaperCode Lab is a privacy-first browser prototype that lets a child photograph a short handwritten arithmetic program, inspect the recognized text, and see line-by-line results.

```text
x = 5
y = 10
z = 7
x + y * z   → 75
```

## What works

- Live rear-camera capture on phones and tablets, plus image upload fallback.
- In-browser OCR with Tesseract.js; images are not sent to a PaperCode server.
- A deliberately small language: variables, decimal numbers, parentheses, `+ - * / ^`, and `#` comments.
- A real tokenizer and recursive-descent interpreter. No `eval`, no dynamic JavaScript execution.
- Line-by-line results and localized errors beside the recognized code.
- Manual correction before rerunning, because an OCR confidence score is not proof that code is correct.
- Responsive Vietnamese interface and keyboard support (`Ctrl/⌘ + Enter` to run).

## Quick start

The app is static. Serve `dist/` from localhost (camera access requires HTTPS or localhost):

```bash
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`, allow camera access, write one statement per line with a dark pen, and select **Quét & chạy**.

## Verify

Requires Node.js 20 or later.

```bash
npm test
npm run check
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

This repository is a working research prototype, not evidence of learning effectiveness. Its scope follows evidence that handwriting programming can be acceptable in primary classrooms while recognition errors remain pedagogically consequential. See [docs/RESEARCH.md](docs/RESEARCH.md) and the preregistration-ready [docs/EXPERIMENT_PROTOCOL.md](docs/EXPERIMENT_PROTOCOL.md).

## Privacy and limitations

OCR runs in the browser. The first OCR use downloads the open-source OCR runtime and English model from a CDN. No account, database, analytics, or image upload endpoint is included. Browser extensions, network operators, and the CDN remain outside this repository's control.

General-purpose OCR can misread children’s handwriting, especially digits and operators. Always inspect recognized text. Do not use this prototype for assessment, grading, or high-stakes decisions.

## Repository map

- `dist/` — deployable static application
- `test/` — interpreter tests
- `docs/ARCHITECTURE.md` — component and data-flow notes
- `docs/RESEARCH.md` — evidence basis and product hypotheses
- `docs/EXPERIMENT_PROTOCOL.md` — staged evaluation protocol
- `SECURITY.md` — vulnerability reporting and security model

## License and citation

Source code is available under the MIT License. Academic reuse can cite the metadata in `CITATION.cff`.
