import { assessOcrText, reconstructOcrGlyphLines, runProgram } from "./core.js";

const SAMPLE = "x = 5\ny = 10\nz = 7\nx + y * z";
const $ = (selector) => document.querySelector(selector);
const elements = {
  video: $("#camera"), canvas: $("#capture-canvas"), panel: $(".camera-panel"),
  cameraButton: $("#camera-button"), scanButton: $("#scan-button"), imageInput: $("#image-input"),
  codeInput: $("#code-input"), runButton: $("#run-button"), clearButton: $("#clear-button"),
  sampleButton: $("#sample-button"), lineResults: $("#line-results"), cameraStatus: $("#camera-status"),
  confidence: $("#confidence-badge"), progressWrap: $("#progress-wrap"), progressLabel: $("#progress-label"),
  progressValue: $("#progress-value"), progressBar: $("#progress-bar"), cancelOcrButton: $("#cancel-ocr-button"),
  toast: $("#toast"),
};

let mediaStream = null;
let uploadedImage = null;
let uploadedImageUrl = null;
let toastTimer = null;
let ocrWorker = null;
let ocrWorkerPromise = null;
let ocrWorkerGeneration = 0;
let activeOcrLogger = null;
let scanSequence = 0;
let isScanning = false;

const OCR_TIMEOUT_MS = 45_000;
const OCR_PATHS = {
  workerPath: new URL("./vendor/worker.min.js", document.baseURI).href,
  corePath: new URL("./vendor/core/", document.baseURI).href,
  langPath: new URL("./vendor/lang/", document.baseURI).href,
};

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 4200);
}

function setProgress(progress, label = "Đang nhận dạng chữ viết…") {
  const value = Math.max(0, Math.min(100, Math.round(progress * 100)));
  elements.progressWrap.hidden = false;
  elements.progressLabel.textContent = label;
  elements.progressValue.textContent = `${value}%`;
  elements.progressBar.style.width = `${value}%`;
}

function resetProgress() {
  elements.progressWrap.hidden = true;
  elements.progressBar.style.width = "0%";
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function reportOcrProgress(message) {
  const progress = typeof message.progress === "number" ? message.progress : 0;
  const status = String(message.status || "").toLowerCase();
  if (status.includes("loading tesseract core")) {
    setProgress(0.05 + progress * 0.15, "Đang khởi động bộ nhận dạng…");
  } else if (status.includes("loading language")) {
    setProgress(0.20 + progress * 0.35, "Đang tải mô hình chữ viết…");
  } else if (status.includes("initializing")) {
    setProgress(0.55 + progress * 0.10, "Đang chuẩn bị mô hình…");
  } else if (status.includes("recognizing")) {
    setProgress(0.65 + progress * 0.35, "Đang đọc từng dòng…");
  }
}

async function resetOcrWorker() {
  const worker = ocrWorker;
  ocrWorkerGeneration += 1;
  ocrWorker = null;
  ocrWorkerPromise = null;
  activeOcrLogger = null;
  if (worker) {
    try { await worker.terminate(); } catch (_) { /* Worker may already be unavailable. */ }
  }
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract?.createWorker) throw new Error("Bộ nhận dạng OCR không khởi động được.");
  if (!ocrWorkerPromise) {
    const generation = ++ocrWorkerGeneration;
    const pending = window.Tesseract.createWorker("eng", 1, {
      ...OCR_PATHS,
      logger(message) { activeOcrLogger?.(message); },
    }).then(async (worker) => {
      if (generation !== ocrWorkerGeneration) {
        await worker.terminate();
        throw new Error("Đã hủy khởi động OCR.");
      }
      ocrWorker = worker;
      return worker;
    });
    let tracked;
    tracked = pending.catch((error) => {
      if (ocrWorkerPromise === tracked) ocrWorkerPromise = null;
      throw error;
    });
    ocrWorkerPromise = tracked;
  }
  try {
    return await withTimeout(
      ocrWorkerPromise,
      OCR_TIMEOUT_MS,
      "OCR mất quá lâu để khởi động. Hãy tải lại trang và thử lại.",
    );
  } catch (error) {
    await resetOcrWorker();
    throw error;
  }
}

function renderResults(program) {
  elements.lineResults.replaceChildren();
  if (!program.lines.length) {
    const empty = document.createElement("p");
    empty.className = "field-help";
    empty.textContent = "Hãy viết ít nhất một dòng mã.";
    elements.lineResults.append(empty);
    return;
  }
  program.lines.forEach((line) => {
    const row = document.createElement("div");
    row.className = `result-row${line.kind === "error" ? " error" : ""}`;
    const number = document.createElement("span");
    number.className = "line-no";
    number.textContent = String(line.lineNo).padStart(2, "0");
    const code = document.createElement("code");
    code.textContent = line.source;
    const output = document.createElement("output");
    output.textContent = line.kind === "error" ? line.error : `→ ${line.display}`;
    row.append(number, code, output);
    elements.lineResults.append(row);
  });
}

function executeVisibleCode() {
  try {
    const result = runProgram(elements.codeInput.value);
    renderResults(result);
    if (!result.ok) showToast("Có dòng chưa chạy được. Hãy xem gợi ý màu đỏ.");
    return result;
  } catch (error) {
    renderResults({ lines: [], ok: false });
    showToast(error.message || "Không thể chạy bài này.");
    return { lines: [], ok: false };
  }
}

async function stopCamera() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
  elements.video.srcObject = null;
  if (!uploadedImage) elements.panel.classList.remove("has-media");
  elements.cameraButton.textContent = "Bật camera";
  elements.cameraStatus.textContent = uploadedImage ? "Đã chọn ảnh" : "Camera chưa bật";
  elements.scanButton.disabled = !uploadedImage;
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Trình duyệt này chưa hỗ trợ camera. Bạn vẫn có thể chọn ảnh.");
    return;
  }
  if (mediaStream) { await stopCamera(); return; }
  try {
    uploadedImage = null;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    elements.video.removeAttribute("poster");
    elements.video.srcObject = mediaStream;
    await elements.video.play();
    elements.panel.classList.add("has-media");
    elements.cameraButton.textContent = "Tắt camera";
    elements.cameraStatus.textContent = "Camera đang bật";
    elements.scanButton.disabled = false;
  } catch (_) {
    elements.cameraStatus.textContent = "Không thể mở camera";
    showToast("Hãy cho phép camera, hoặc chọn một ảnh có sẵn.");
  }
}

function drawSourceToCanvas() {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const source = uploadedImage || elements.video;
  const width = uploadedImage ? uploadedImage.naturalWidth : elements.video.videoWidth;
  const height = uploadedImage ? uploadedImage.naturalHeight : elements.video.videoHeight;
  if (!width || !height) throw new Error("Chưa có hình ảnh để quét.");
  const scale = Math.min(1, 1800 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    const contrasted = gray < 175 ? Math.max(0, gray * 0.72) : Math.min(255, 220 + (gray - 175) * 0.46);
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function projectionRanges(values, minimumInk, maximumGap) {
  const ranges = [];
  let start = null;
  let lastInk = null;
  values.forEach((value, index) => {
    if (value >= minimumInk) {
      if (start === null) start = index;
      lastInk = index;
    } else if (start !== null && index - lastInk > maximumGap) {
      ranges.push([start, lastInk]);
      start = null;
      lastInk = null;
    }
  });
  if (start !== null) ranges.push([start, lastInk]);
  return ranges;
}

function segmentHandwrittenGlyphs(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  const isInk = (x, y) => data[(y * width + x) * 4] < 170;
  const left = Math.round(width * 0.05);
  const right = Math.round(width * 0.95);
  const top = Math.round(height * 0.05);
  const bottom = Math.round(height * 0.95);
  const rowInk = Array(height).fill(0);

  for (let y = top; y < bottom; y += 1) {
    let count = 0;
    for (let x = left; x < right; x += 1) if (isInk(x, y)) count += 1;
    rowInk[y] = count;
  }

  const lineRanges = projectionRanges(
    rowInk,
    Math.max(5, Math.round((right - left) * 0.004)),
    Math.max(10, Math.round(height * 0.018)),
  ).filter(([lineTop, lineBottom]) => {
    const lineHeight = lineBottom - lineTop + 1;
    return lineHeight >= height * 0.025 && lineHeight <= height * 0.32;
  });

  const lines = [];
  for (const [rawTop, rawBottom] of lineRanges.slice(0, 20)) {
    const lineTop = Math.max(top, rawTop - 4);
    const lineBottom = Math.min(bottom - 1, rawBottom + 4);
    const lineHeight = lineBottom - lineTop + 1;
    const columnInk = Array(width).fill(0);
    for (let x = left; x < right; x += 1) {
      let count = 0;
      for (let y = lineTop; y <= lineBottom; y += 1) if (isInk(x, y)) count += 1;
      columnInk[x] = count;
    }
    const glyphRanges = projectionRanges(
      columnInk,
      2,
      Math.max(7, Math.round(lineHeight * 0.09)),
    ).filter(([glyphLeft, glyphRight]) => glyphRight - glyphLeft >= 2);

    const glyphs = [];
    for (const [glyphLeft, glyphRight] of glyphRanges.slice(0, 40)) {
      let glyphTop = lineBottom;
      let glyphBottom = lineTop;
      let inkCount = 0;
      let inkXTotal = 0;
      const rowCounts = Array(lineHeight).fill(0);
      const columnCounts = Array(glyphRight - glyphLeft + 1).fill(0);
      for (let x = glyphLeft; x <= glyphRight; x += 1) {
        for (let y = lineTop; y <= lineBottom; y += 1) {
          if (!isInk(x, y)) continue;
          glyphTop = Math.min(glyphTop, y);
          glyphBottom = Math.max(glyphBottom, y);
          rowCounts[y - lineTop] += 1;
          columnCounts[x - glyphLeft] += 1;
          inkCount += 1;
          inkXTotal += x - glyphLeft;
        }
      }
      if (inkCount < 12 || glyphBottom < glyphTop) continue;
      const inkWidth = glyphRight - glyphLeft + 1;
      const inkHeight = glyphBottom - glyphTop + 1;
      const aspect = inkWidth / inkHeight;
      const inkCentroidX = inkWidth > 1 ? (inkXTotal / inkCount) / (inkWidth - 1) : 0.5;
      const rowGroups = projectionRanges(rowCounts, 1, Math.max(2, Math.round(inkHeight * 0.04)));
      const maxRowInk = Math.max(...rowCounts);
      const maxColumnInk = Math.max(...columnCounts);
      const thinRowGroups = rowGroups.length === 2
        && rowGroups.every(([a, b]) => b - a + 1 < inkHeight * 0.28);
      const isEquals = thinRowGroups && aspect > 1.15;
      const isMinus = rowGroups.length === 1 && aspect > 2.2 && inkHeight < lineHeight * 0.48;
      const isPlus = !isEquals
        && maxRowInk / inkWidth > 0.62
        && maxColumnInk / inkHeight > 0.62;

      const padding = Math.max(10, Math.round(Math.max(inkWidth, inkHeight) * 0.16));
      const cropLeft = Math.max(0, glyphLeft - padding);
      const cropTop = Math.max(0, glyphTop - padding);
      const cropWidth = Math.min(width - cropLeft, inkWidth + padding * 2);
      const cropHeight = Math.min(height - cropTop, inkHeight + padding * 2);
      const side = Math.max(cropWidth, cropHeight);
      const glyphCanvas = document.createElement("canvas");
      glyphCanvas.width = 256;
      glyphCanvas.height = 256;
      const glyphContext = glyphCanvas.getContext("2d");
      glyphContext.fillStyle = "#fff";
      glyphContext.fillRect(0, 0, 256, 256);
      const targetWidth = (cropWidth / side) * 216;
      const targetHeight = (cropHeight / side) * 216;
      glyphContext.drawImage(
        canvas,
        cropLeft,
        cropTop,
        cropWidth,
        cropHeight,
        (256 - targetWidth) / 2,
        (256 - targetHeight) / 2,
        targetWidth,
        targetHeight,
      );
      glyphs.push({ canvas: glyphCanvas, aspect, inkCentroidX, isEquals, isMinus, isPlus });
    }
    if (glyphs.length) lines.push(glyphs);
  }
  return lines;
}

async function recognizePaperCode(worker, canvas) {
  const lines = segmentHandwrittenGlyphs(canvas);
  const glyphCount = lines.reduce((total, line) => total + line.length, 0);
  if (!glyphCount || glyphCount > 80) {
    await worker.setParameters({
      tessedit_pageseg_mode: "11",
      tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_+-*/^()=.#",
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(canvas);
    return { text: (result.data.text || "").trim(), confidence: Math.round(result.data.confidence || 0) };
  }

  await worker.setParameters({
    tessedit_pageseg_mode: "10",
    tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_+-*/^()=.#",
  });
  activeOcrLogger = null;
  let completed = 0;
  let confidenceTotal = 0;
  for (const line of lines) {
    for (const glyph of line) {
      const result = await worker.recognize(glyph.canvas);
      glyph.text = (result.data.text || "").trim();
      confidenceTotal += Number(result.data.confidence || 0);
      completed += 1;
      setProgress(0.65 + (completed / glyphCount) * 0.33, `Đang đọc ký tự ${completed}/${glyphCount}…`);
    }
  }
  return {
    text: reconstructOcrGlyphLines(lines),
    confidence: Math.round(confidenceTotal / glyphCount),
  };
}

async function recognizeAndRun() {
  if (isScanning) return;
  const currentScan = ++scanSequence;
  isScanning = true;
  elements.scanButton.disabled = true;
  elements.runButton.disabled = true;
  elements.confidence.hidden = true;
  setProgress(0.02, "Đang xử lý ảnh trên thiết bị…");
  try {
    const canvas = drawSourceToCanvas();
    activeOcrLogger = reportOcrProgress;
    const worker = await getOcrWorker();
    if (currentScan !== scanSequence) return;
    setProgress(0.65, "Đang đọc từng dòng…");
    const result = await withTimeout(
      recognizePaperCode(worker, canvas),
      OCR_TIMEOUT_MS,
      "OCR mất quá 45 giây. Hãy chụp gần hơn hoặc chọn một ảnh nhỏ hơn.",
    );
    if (currentScan !== scanSequence) return;
    const text = (result.text || "").trim();
    if (!text) throw new Error("Chưa đọc được chữ. Hãy chụp gần hơn và dùng bút đậm.");
    const confidence = Math.round(result.confidence || 0);
    const quality = assessOcrText(text, confidence);
    if (!quality.ok) {
      throw new Error("Ảnh có quá nhiều ký tự lạ để đọc an toàn. Hãy chụp gần phần mã hơn.");
    }
    elements.codeInput.value = text;
    elements.confidence.textContent = quality.needsReview ? `OCR ${confidence}% · cần kiểm tra` : `OCR ${confidence}%`;
    elements.confidence.classList.toggle("warning", quality.needsReview);
    elements.confidence.hidden = false;
    executeVisibleCode();
    if (quality.needsReview) showToast("Đã đọc mã. Hãy kiểm tra lại từng dòng được tô ở bên phải trước khi dùng kết quả.");
    setProgress(1, "Đã nhận dạng xong");
    setTimeout(resetProgress, 900);
  } catch (error) {
    if (currentScan !== scanSequence) return;
    await resetOcrWorker();
    resetProgress();
    showToast(error.message || "Không thể nhận dạng ảnh này.");
  } finally {
    if (currentScan === scanSequence) {
      isScanning = false;
      activeOcrLogger = null;
      elements.scanButton.disabled = !(mediaStream || uploadedImage);
      elements.runButton.disabled = false;
    }
  }
}

async function cancelRecognition() {
  if (!isScanning) return;
  scanSequence += 1;
  isScanning = false;
  await resetOcrWorker();
  resetProgress();
  elements.scanButton.disabled = !(mediaStream || uploadedImage);
  elements.runButton.disabled = false;
  showToast("Đã hủy nhận dạng. Bạn có thể quét lại.");
}

function loadSelectedImage(file) {
  if (!file?.type.startsWith("image/")) { showToast("Hãy chọn một tệp ảnh."); return; }
  const image = new Image();
  image.onload = async () => {
    await stopCamera();
    uploadedImage = image;
    elements.video.poster = image.src;
    elements.panel.classList.add("has-media");
    elements.cameraStatus.textContent = "Ảnh đã sẵn sàng";
    elements.scanButton.disabled = false;
  };
  image.onerror = () => showToast("Không thể mở ảnh này.");
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  uploadedImageUrl = URL.createObjectURL(file);
  image.src = uploadedImageUrl;
}

function clearWorkspace() {
  elements.codeInput.value = "";
  elements.lineResults.replaceChildren();
  elements.confidence.hidden = true;
  resetProgress();
  elements.codeInput.focus();
}

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  try {
    void Promise.resolve(context.registerTool({
      name: "run_papercode",
      title: "Chạy mã PaperCode",
      description: "Điền và chạy một chương trình số học PaperCode; đồng thời cập nhật kết quả đang hiển thị.",
      inputSchema: {
        type: "object",
        properties: { source: { type: "string", maxLength: 4000 } },
        required: ["source"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute(input) {
        if (!input || typeof input.source !== "string") throw new TypeError("source phải là chuỗi");
        elements.codeInput.value = input.source;
        const result = executeVisibleCode();
        return { ok: result.ok, lines: result.lines.map(({ lineNo, kind, display, error }) => ({ lineNo, kind, display, error })) };
      },
    }, { signal: lifecycle.signal })).catch(() => {});
  } catch (_) {
    // Optional capability; the visible app remains fully functional.
  }
}

elements.cameraButton.addEventListener("click", startCamera);
elements.scanButton.addEventListener("click", recognizeAndRun);
elements.cancelOcrButton.addEventListener("click", cancelRecognition);
elements.imageInput.addEventListener("change", (event) => loadSelectedImage(event.target.files?.[0]));
elements.runButton.addEventListener("click", executeVisibleCode);
elements.clearButton.addEventListener("click", clearWorkspace);
elements.sampleButton.addEventListener("click", () => {
  elements.codeInput.value = SAMPLE;
  executeVisibleCode();
  elements.codeInput.scrollIntoView({ behavior: "smooth", block: "center" });
});
elements.codeInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") executeVisibleCode();
});
window.addEventListener("beforeunload", () => {
  mediaStream?.getTracks().forEach((track) => track.stop());
  ocrWorker?.terminate();
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
});

elements.codeInput.value = SAMPLE;
executeVisibleCode();
registerWebMcp();
