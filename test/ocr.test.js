import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraCrop, normalizeTranscription, groupObservations, assembleVisionResult } from '../dist/assets/ocr.js';
import { runProgram } from '../dist/assets/core.js';

const observation = (text, box, confidence = 1) => ({ box, candidates: [{ text, confidence }] });

test('camera scan rectangle matches a portrait cover-preview of a landscape sensor', () => {
  const crop = cameraCrop(1920, 1080, 600, 600, { x: 60, y: 60, width: 480, height: 480 });
  assert.deepEqual(crop, { x: 528, y: 108, width: 864, height: 864 });
  assert.throws(() => cameraCrop(0, 0, 600, 600, {}), /Camera/);
});

test('camera scan rectangle matches a landscape cover-preview of a portrait sensor', () => {
  const crop = cameraCrop(1080, 1920, 600, 400, { x: 0, y: 0, width: 600, height: 400 });
  assert.deepEqual(crop, { x: 0, y: 600, width: 1080, height: 720 });
});

test('preserves all recognized digits and arbitrary names; never turns 4 into + or 5 into 3', () => {
  const raw = 'width = 45\na = 4\nb = 5\nz = 17\nwidth + a - b\n?';
  assert.equal(normalizeTranscription(raw).text, raw);
  assert.equal(normalizeTranscription('').text, '');
});

test('typographic normalization is explicit and retains a change record', () => {
  const result = normalizeTranscription('X = 10\nу = 3\nx × y');
  assert.equal(result.text, 'x = 10\ny = 3\nx * y');
  assert.equal(result.changes.length, 3);
  assert.equal(runProgram(result.text).lines.at(-1).value, 30);
});

test('joins adjacent OCR fragments by vertical overlap, preserving top-to-bottom line order', () => {
  const lines = groupObservations([
    observation('30', [.43, .35, .27, .13]),
    observation('x + y', [.06, .72, .8, .24]),
    observation('y =', [.10, .39, .34, .21]),
    observation('x = 10', [.04, .07, .61, .21]),
  ]);
  assert.deepEqual(lines.map(line => line.text), ['x = 10', 'y = 30', 'x + y']);
});

test('does not join lines whose horizontal extent overlaps', () => {
  assert.equal(groupObservations([
    observation('x = 10', [.1, .1, .5, .15]),
    observation('y = 3', [.1, .19, .5, .15]),
  ]).length, 2);
});

test('agreed camera transcription evaluates the reported sample to 13', () => {
  const observations = [observation('X = 10', [.05, .1, .6, .15]), observation('y = 3', [.1, .4, .5, .2]), observation('x + y', [.1, .72, .6, .2])];
  const result = assembleVisionResult({ passes: ['original', 'contrast'].map(name => ({ name, observations })) });
  assert.equal(result.needsReview, false);
  assert.equal(result.text, 'x = 10\ny = 3\nx + y');
  assert.equal(runProgram(result.text).lines.at(-1).value, 13);
});

test('different readings require human review even when both parse successfully', () => {
  const result = assembleVisionResult({ passes: [
    { name: 'original', observations: [observation('x = 45', [.1, .1, .5, .15])] },
    { name: 'contrast', observations: [observation('x = 43', [.1, .1, .5, .15])] },
  ] });
  assert.equal(result.needsReview, true);
  assert.equal(result.alternatives.length, 2);
  assert.equal(result.rawText, 'x = 45');
});

test('blank and low-confidence results are never replaced with a guess', () => {
  const blank = assembleVisionResult({ passes: [{ name: 'original', observations: [] }] });
  assert.equal(blank.text, ''); assert.equal(blank.needsReview, true);
  const low = assembleVisionResult({ passes: [{ name: 'original', observations: [observation('?', [.1, .1, .5, .15], .2)] }] });
  assert.equal(low.text, '?'); assert.equal(low.needsReview, true);
});

test('disagreement detection preserves statement boundaries', () => {
  const result = assembleVisionResult({ passes: [
    { name: 'original', observations: [observation('x=1', [.1, .1, .5, .1]), observation('23', [.1, .5, .5, .1])] },
    { name: 'contrast', observations: [observation('x=123', [.1, .1, .5, .1])] },
  ] });
  assert.equal(result.needsReview, true);
});
