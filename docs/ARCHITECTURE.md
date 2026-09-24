# Architecture

## End-to-end flow

1. The learner grants camera permission or selects an image.
2. Camera capture maps the visible scan frame through object-fit cover into sensor coordinates. Uploaded images are read in full. The browser preserves continuous-tone pixels and prefers lossless PNG.
3. The same-origin, loopback-only Python service pipes image bytes to a bounded Apple Vision process. No temporary image file is created.
4. Apple Vision revision 3 reads original and contrast-enhanced versions with language correction disabled.
5. The browser groups observations into lines by position, retains both readings, and applies only documented typographic/case normalization. It does not infer digits or missing letters.
6. The recognized text and exact capture are shown for inspection. Different or low-confidence readings receive a persistent review label and provisional arithmetic.
7. A tokenizer and recursive-descent interpreter parse each line.
8. The interface renders an assignment value, expression result, or localized error next to each source line.

A local macOS service provides GET /api/health and POST /api/ocr. There is no remote backend, database, account, analytics SDK, or image persistence. Generic static hosting explicitly offers printed-text mode only.

## Trust boundaries

- **Untrusted image and OCR text:** both can be malformed or misleading.
- **Interpreter:** accepts only numbers, identifiers, assignment, parentheses, and arithmetic operators. It never passes input to JavaScript evaluation APIs.
- **OCR delivery:** the pinned Tesseract.js API, worker, WebAssembly cores, and English language data are served from the same origin as the app.
- **Camera:** access starts only after a user gesture and stops on request or page exit.
- **Local OCR service:** 127.0.0.1 binding, validated Host and Origin, custom request header, 8 MB body limit, one active recognition, 30-second subprocess timeout. No CORS access is granted.

## Failure states

- Camera unavailable or denied → image upload and manual entry remain available.
- OCR library unavailable → the interface explains that recognition did not load; manual execution remains available.
- Blank recognition → guidance asks for a closer, higher-contrast image.
- Native recognition exceeds 30 seconds → the subprocess is killed. The client has an independent 35-second deadline; controls recover and stale results cannot overwrite a new scan.
- Cancel → the client request is aborted and stale completion is ignored. A native process already running completes or is killed by its 30-second deadline; it holds the single-job lock until then.
- Syntax or runtime error → the failing source line remains visible with a specific error.
- Low confidence or conflicting passes → a review label is displayed; confidence is never presented as an accuracy percentage.

## Extension points

Future work may add a child-handwriting model, bounding-box alignment over the live image, bilingual keywords, or classroom study instrumentation. Each should remain opt-in and should not silently change a learner’s intended program.
