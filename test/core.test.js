import test from "node:test";
import assert from "node:assert/strict";
import { assessOcrText, evaluateExpression, normalizeSource, reconstructOcrGlyphLines, runProgram } from "../dist/assets/core.js";

test("runs the product example with standard precedence", () => {
  const program = runProgram("x = 5\ny = 10\nz = 7\nx+y*z");
  assert.equal(program.ok, true);
  assert.equal(program.lines.at(-1).value, 75);
});

test("supports parentheses, decimals, unary operators, and powers", () => {
  assert.equal(evaluateExpression("-(2 + 3) * 4"), -20);
  assert.equal(evaluateExpression("2^3^2"), 512);
  assert.equal(evaluateExpression(".5 + 1.25"), 1.75);
});

test("normalizes handwriting-friendly operator glyphs", () => {
  assert.equal(normalizeSource("8 × 2 − 6 ÷ 3"), "8 * 2 - 6 / 3");
  assert.equal(evaluateExpression(normalizeSource("8 × 2 − 6 ÷ 3")), 14);
});

test("reports unknown variables without stopping later line reporting", () => {
  const program = runProgram("a + 2\nb = 3");
  assert.equal(program.ok, false);
  assert.match(program.lines[0].error, /chưa có giá trị/);
  assert.equal(program.lines[1].value, 3);
});

test("rejects unsupported syntax and division by zero", () => {
  assert.throws(() => evaluateExpression("2 % 1"), /chưa được hỗ trợ/);
  assert.throws(() => evaluateExpression("4 / 0"), /chia cho 0/);
});

test("never executes JavaScript", () => {
  const program = runProgram("globalThis.hacked = 1");
  assert.equal(program.ok, false);
  assert.equal(globalThis.hacked, undefined);
});

test("accepts comments and skips blank lines", () => {
  const program = runProgram("x = 4 # store four\n\n x * 3");
  assert.equal(program.ok, true);
  assert.equal(program.lines.length, 2);
  assert.equal(program.lines[1].value, 12);
});

test("keeps usable low-confidence OCR visible for human review", () => {
  assert.equal(assessOcrText("x = 5\ny = 10\nx + y", 82).ok, true);
  assert.equal(assessOcrText("x = 5\ny = 10\nx + y", 20).ok, true);
  assert.equal(assessOcrText("x = 5\ny = 10\nx + y", 20).needsReview, true);
  assert.equal(assessOcrText("@ @@ | | noisy text", 20).ok, false);
  assert.equal(assessOcrText(Array(21).fill("x = 1").join("\n"), 90).ok, false);
});

test("reconstructs the photographed handwritten sample from constrained glyphs", () => {
  const glyph = (text, aspect = 1, shape = {}) => ({ text, aspect, ...shape });
  const source = reconstructOcrGlyphLines([
    [glyph("a"), glyph("Jo", 1.8, { isEquals: true }), glyph("", 0.2), glyph("oO", 0.9)],
    [glyph("Y", 0.65), glyph("", 1.8, { isEquals: true }), glyph("5", 0.8, { inkCentroidX: 0.59 }), glyph("pe", 0.9)],
    [
      glyph("", 1.1),
      glyph("4", 0.6, { isPlus: true }),
      glyph("Er", 0.65),
      glyph("", 1.8, { isEquals: true }),
      glyph("Bc", 1.1),
    ],
  ]);
  assert.equal(source, "x = 10\ny = 30\nx + y = x");
});
