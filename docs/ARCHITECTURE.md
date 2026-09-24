# Architecture

## End-to-end flow

1. The learner grants camera permission or selects an image.
2. The browser scales the image and applies grayscale contrast normalization.
3. A projection-based preprocessor separates the image into handwritten lines and whitespace-delimited glyphs.
4. Tesseract.js classifies each glyph locally in a Web Worker.
5. A constrained, documented confusion map reconstructs PaperCode tokens without changing program semantics.
6. The recognized text is shown in an editable text area; low-confidence output is visibly marked for review.
7. A tokenizer and recursive-descent interpreter parse each line.
8. The interface renders an assignment value, expression result, or localized error next to each source line.

No application backend exists. There is no database, account, analytics SDK, or image upload route.

## Trust boundaries

- **Untrusted image and OCR text:** both can be malformed or misleading.
- **Interpreter:** accepts only numbers, identifiers, assignment, parentheses, and arithmetic operators. It never passes input to JavaScript evaluation APIs.
- **OCR delivery:** the pinned Tesseract.js API, worker, WebAssembly cores, and English language data are served from the same origin as the app.
- **Camera:** access starts only after a user gesture and stops on request or page exit.

## Failure states

- Camera unavailable or denied → image upload and manual entry remain available.
- OCR library unavailable → the interface explains that recognition did not load; manual execution remains available.
- Blank recognition → guidance asks for a closer, higher-contrast image.
- Worker initialization or recognition exceeds 45 seconds → the worker is terminated, controls are restored, and the learner receives a retry message.
- Syntax or runtime error → the failing source line remains visible with a specific error.
- Low confidence → confidence is displayed but never treated as correctness.

## Extension points

Future work may add a child-handwriting model, bounding-box alignment over the live image, bilingual keywords, or classroom study instrumentation. Each should remain opt-in and should not silently change a learner’s intended program.
