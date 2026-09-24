# Staged evaluation protocol

Status: protocol draft for preregistration. No participants have been enrolled and no results are claimed.

## Stage 1 — Technical benchmark

### Objective

Estimate recognition and execution reliability across realistic handwriting and capture conditions before involving a classroom.

### Dataset

Recruit at least 30 child participants across the intended age range with guardian consent and child assent. Each participant writes the same counterbalanced set of 20 short programs. Sample multiple digits, variable names, operators, spacing patterns, and parentheses. Capture each sheet under at least two lighting/angle conditions.

Split data by participant, never by image, so that the test set measures performance on unseen handwriting. Freeze the test set before tuning preprocessing or grammar rules.

### Primary outcome

Exact parse-and-run success: the proportion of captured programs whose unedited OCR transcription parses and produces the reference result.

### Secondary outcomes

- Character error rate and line exact-match rate.
- Error rate by class: digit, identifier, operator, punctuation, layout, crop, and blank output.
- Capture-to-visible-result latency: median, p90, and p95.
- Proportion requiring manual correction and time to first correct execution.
- False semantic correction count (target: zero in v1).

Report 95% confidence intervals and participant-level bootstrap intervals. Publish the scoring script and an appropriately de-identified dataset only when consent permits.

## Stage 2 — Usability pilot

### Design

Run moderated sessions with 8–12 children not present in Stage 1. Use task-based observation rather than a learning-effectiveness claim. Counterbalance task order. Record assistance using a prespecified rubric.

### Success criteria

- At least 80% complete the four-line example without adult takeover.
- Median correction time below 30 seconds after an OCR error.
- At least 80% can explain that the editable text is what the computer understood.
- No observed image retention or accidental sharing.

Collect child-friendly perceived ease, frustration, trust calibration, and open-ended feedback. Report all adverse events and dropouts.

## Stage 3 — Learning study

Proceed only if the technical and usability gates pass. Compare PaperCode with a matched graphical condition and, if feasible, an unplugged-only condition. Match instructional content, time-on-task, teacher support, and tasks. Randomize at the class level where contamination is likely and account for clustering in analysis.

Prespecify one primary learning outcome, a power analysis, exclusion rules, handling of missing data, and the statistical model. Include a delayed transfer measure; report engagement separately from learning. Do not infer screen-time or developmental benefits from interface preference.

## Ethics and data management

- Obtain institutional ethics review where applicable, guardian consent, and child assent.
- Avoid names or faces in captures; provide a paper template with a fixed code region.
- Store participant keys separately from images and logs.
- Define retention and deletion dates before collection.
- Never use study images to train a model without explicit, separate consent.
- Provide a non-camera participation route where possible.
- Do not use the prototype for grading or diagnosis.

## Reproducibility checklist

- Public preregistration and versioned protocol.
- Frozen application commit; model hash when available. For Apple Vision, record macOS version/build and Vision request revision because the model is system supplied.
- Device, browser, camera, lighting, pen, and paper-template records.
- Participant-level train/validation/test separation.
- Blinded ground-truth transcription and adjudication procedure.
- Open analysis code and synthetic test fixtures.
- Full error taxonomy and negative results.
