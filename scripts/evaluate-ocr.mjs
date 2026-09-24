// Usage: node scripts/evaluate-ocr.mjs /absolute/path/image.png [expected-program.txt]
// The image and expected transcript are private local files, never uploaded.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { assembleVisionResult } from '../dist/assets/ocr.js';
import { runProgram } from '../dist/assets/core.js';

const [image, expectedFile] = process.argv.slice(2);
if (!image) throw new Error('Provide an image path. Start npm start once to build the native engine.');
const start = performance.now();
const execution = spawnSync(fileURLToPath(new URL('../.runtime/papercode-vision', import.meta.url)), [], {
  input: readFileSync(image), timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
});
if (execution.error) throw execution.error;
if (execution.status !== 0) throw new Error(execution.stderr.toString());
const result = assembleVisionResult(JSON.parse(execution.stdout));
const expected = expectedFile ? readFileSync(expectedFile, 'utf8').trim() : null;
const compact = text => text.split(/\r?\n/).map(line => line.replace(/[ \t]/g, '')).join('\n');
const exactMatch = expected === null ? null : compact(expected) === compact(result.text);
console.log(JSON.stringify({ durationMs: Math.round(performance.now() - start), ...result,
  expected, exactMatch, program: runProgram(result.text) }, null, 2));
if (exactMatch === false) process.exitCode = 1;
