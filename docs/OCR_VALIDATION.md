# Handwriting repair validation — v1.1

## Failure analysis

The previous release used Tesseract's printed-text model for handwriting, a fixed gray threshold, and handcrafted glyph substitution rules. Those rules could change a recognized `4` into `+`, change `5` into `3`, or invent `x` for an unknown shape. A prior success report relied on a fixture rebuilt from individually cut-out glyphs, not an unmodified paper photograph. That does not demonstrate camera recognition and is withdrawn as evidence.

Version 1.1 removes that classifier completely. The macOS application uses Apple Vision revision 3 with accurate recognition and language correction disabled. It performs original-image and contrast-enhanced passes, groups spatially adjacent observations into rows, and exposes both raw readings. Differences or low confidence produce a persistent review label; any displayed arithmetic is explicitly provisional. Recognition confidence is not presented as a measured accuracy percentage.

## Reproduction

On macOS with Swift Command Line Tools, run `npm start` once to compile the native helper. Then:

```sh
node scripts/evaluate-ocr.mjs /absolute/path/paper.png /absolute/path/reference.txt
npm test
npm run test:server
npm run check
```

The evaluation script runs the actual native engine, row assembly, normalization, and interpreter, reports raw alternatives and elapsed time, and exits nonzero if the supplied reference differs (ignoring horizontal whitespace, preserving line breaks). It never uses the reference to influence recognition. Image fixtures remain local; user screenshots are not included in this public repository.

## Observed local results

Environment: macOS 26.3 on Apple silicon, Swift 6.2.1, Apple Vision request revision 3. Inputs were rectangular crops of the paper region of three user screenshots; no glyph rearrangement, redrawing, or binarization was applied to the input fixtures. Two small turquoise frame fragments remain in the newest crop. Tests via the browser also exercise canvas capture, lossless PNG encoding, the local HTTP endpoint, and result rendering.

| Photo | Reference | Actual normalized transcription | Observation |
| --- | --- | --- | --- |
| 22:23, plain paper | `x = 10; y = 3; x + y` | Exact, ignoring whitespace | Evaluates to 13. Browser rendering can cause disagreement in the contrast pass; review label remains visible. |
| 22:02, plain paper | `x = 10; y = 30; x + y = x` | Exact, ignoring whitespace | The final line is an invalid assignment, correctly shown as a syntax error. |
| 21:41, faint grid paper | `x = 5; y = 10; z = 17; x + y + z` | `x = 5; y = 10; 2 = 17; x + y + z` | Still confuses handwritten z with 2. Marked for review; no automatic 2→z correction. |

Native command-line elapsed times in one local run were 378 ms, 339 ms, and 237 ms, respectively. These are observations, not a latency guarantee or a benchmark distribution. Browser/HTTP overhead and first-launch compilation are separate.

These three development examples are not an independent test set. They do not establish handwriting accuracy for children, different writers, lighting, devices, or general source code. A held-out multi-writer study using `EXPERIMENT_PROTOCOL.md` remains necessary. Plain paper currently performs better than faint graph-paper pencil examples.

A direct live-camera check also showed a strongly tilted, partly cropped grid-paper sheet and produced blank output. This is retained as a failure, not counted as successful handwriting recognition. A bounded rotation retry was added for blank readings, and the UI now explicitly asks for a straight, fully framed, focused page. Camera start/stop and capture geometry were checked separately from transcription accuracy.

A synthetic printed control (`a = 45; b = 4; c = 5; z = 17; a + b * c`) was transcribed exactly modulo whitespace and produced 65. This checks digit preservation and arithmetic plumbing; it is not handwriting evidence.

A 32-degree rotated copy of the newest paper crop was also read exactly and produced 13 in 711 ms. The contrast pass recovered the expression; the differing original pass correctly triggered review. This synthetic rotation is a robustness check on an existing development image, not a new writer or proof that the failed live-camera capture is fixed.

## Regression coverage

- Camera frame coordinates for portrait/landscape cover previews.
- No substitution of recognized digits, missing symbols, or arbitrary variable names.
- Explicit operator-glyph and single-letter case normalization, retaining raw readings.
- Spatial row assembly; differing readings, low confidence, and blank output.
- Loopback service origin/host restrictions, input size/type checks, concurrency, process timeout, error recovery, and no image-file persistence.
- Browser checks for scanning the actual cropped photograph, cancellation and retry, blank images, editable code, and visible uncertainty.

## Platform boundary

Handwriting mode requires the local macOS service. A static deployment or non-macOS machine only has Tesseract printed-text mode, labelled accordingly. The app does not send images to a remote OCR provider. Apple's system-supplied model can change with macOS; record the OS build as well as this repository's commit in any study.

Sources: [Tesseract's handwriting limitation](https://github.com/tesseract-ocr/tessdoc/blob/main/FAQ.md#can-i-use-tesseract-for-handwriting-recognition), [Apple Vision text recognition](https://developer.apple.com/documentation/vision/vnrecognizetextrequest).
