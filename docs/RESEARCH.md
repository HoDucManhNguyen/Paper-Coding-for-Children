# Research basis and claims boundary

## Product question

Can a constrained paper-first arithmetic language provide children with a usable “write → inspect → correct → run” loop using ordinary cameras, while preserving the learner’s intended code?

PaperCode Lab v1 tests technical feasibility and interaction design. It does **not** claim to improve learning, reduce screen-related harm, or recognize unrestricted handwritten programs reliably.

## Evidence used

Brender et al. evaluated a handwriting programming language with 143 students aged 9–10 and 49 primary-school teachers. The reported system recognized 84% of 973 handwritten command lines; 130 of 156 errors involved digits. The study found learning outcomes comparable with Scratch under its three-session design and positive acceptance. The system used 17 predefined instructions, OCR, and edit-distance mapping rather than unrestricted code. This supports a constrained vocabulary and makes digit/operator errors a first-class design risk. DOI: [10.1007/s11423-025-10503-z](https://doi.org/10.1007/s11423-025-10503-z).

Islam et al. show that handwritten source-code OCR is unusually brittle: minor transcription or indentation errors can make code non-executable. Their evaluation separates transcription fidelity from “logical fix hallucination,” because a model that silently repairs a student’s logic may undermine faithful assessment and learning. PaperCode therefore displays the transcription and performs only transparent glyph normalization (`×`, `÷`, and typographic minus). DOI: [10.1145/3657604.3662027](https://doi.org/10.1145/3657604.3662027).

Wang et al.’s T-Maze work is an earlier example of a tangible programming system for children and motivates rapid physical-to-digital feedback, but it does not establish the performance of handwritten arithmetic OCR. DOI: [10.1145/1999030.1999045](https://doi.org/10.1145/1999030.1999045).

## Design hypotheses

- H1: Constraining syntax to assignments and arithmetic will yield higher exact parse-and-run success than attempting general Python handwriting recognition.
- H2: Showing editable OCR text before execution will reduce undetected semantic substitutions.
- H3: Line-local results and errors will reduce correction time compared with a single undifferentiated error message.
- H4: A dark-pen, one-statement-per-line capture guide will improve exact transcription under classroom lighting.

These are testable hypotheses, not findings.

## Product decisions derived from evidence

| Risk | v1 decision | Measurement |
| --- | --- | --- |
| Digit/operator misrecognition | Small grammar; show raw recognized text | Character error rate by symbol class |
| Silent semantic correction | No language-model repair; no inferred variable names | False-correction count |
| A single OCR error breaks execution | Per-line parse and error display | Exact parse-and-run success |
| Camera conditions vary | Upload fallback and capture guidance | Success by lighting/device condition |
| Engagement can be mistaken for learning | Separate usability and learning outcomes | Delayed transfer test in later study |

## Reproducibility

The interpreter is deterministic and covered by automated tests. The OCR engine version is pinned in `dist/index.html`; its model delivery is external and should be archived for a formal study. A study release should record browser, device, camera, lighting condition, writing instrument, paper template, OCR assets, and commit SHA.
