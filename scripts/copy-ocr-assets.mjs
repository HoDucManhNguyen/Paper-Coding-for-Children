import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const copies = [
  ["node_modules/tesseract.js/dist/tesseract.min.js", "dist/vendor/tesseract.min.js"],
  ["node_modules/tesseract.js/dist/worker.min.js", "dist/vendor/worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core.wasm.js", "dist/vendor/core/tesseract-core.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd.wasm.js", "dist/vendor/core/tesseract-core-simd.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "dist/vendor/core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "dist/vendor/core/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz", "dist/vendor/lang/eng.traineddata.gz"],
  ["node_modules/tesseract.js/LICENSE.md", "dist/vendor/licenses/tesseract.js-LICENSE.md"],
  ["node_modules/tesseract.js-core/LICENSE", "dist/vendor/licenses/tesseract.js-core-LICENSE.txt"],
];

for (const [source, destination] of copies) {
  const output = resolve(destination);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(resolve(source), output);
}

console.log(`Copied ${copies.length} pinned OCR assets.`);
