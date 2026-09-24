import { runProgram } from "./core.js";

const SAMPLE = "x = 5\ny = 10\nz = 7\nx + y * z";
const $ = (selector) => document.querySelector(selector);
const elements = {
  video: $("#camera"), canvas: $("#capture-canvas"), panel: $(".camera-panel"),
  cameraButton: $("#camera-button"), scanButton: $("#scan-button"), imageInput: $("#image-input"),
  codeInput: $("#code-input"), runButton: $("#run-button"), clearButton: $("#clear-button"),
  sampleButton: $("#sample-button"), lineResults: $("#line-results"), cameraStatus: $("#camera-status"),
  confidence: $("#confidence-badge"), progressWrap: $("#progress-wrap"), progressLabel: $("#progress-label"),
  progressValue: $("#progress-value"), progressBar: $("#progress-bar"), toast: $("#toast"),
};

let mediaStream = null;
let uploadedImage = null;
let uploadedImageUrl = null;
let toastTimer = null;

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

async function recognizeAndRun() {
  if (!window.Tesseract?.recognize) {
    showToast("Bộ nhận dạng chưa tải xong. Hãy kiểm tra mạng và thử lại.");
    return;
  }
  elements.scanButton.disabled = true;
  elements.runButton.disabled = true;
  elements.confidence.hidden = true;
  setProgress(0.02, "Đang chuẩn bị ảnh…");
  try {
    const canvas = drawSourceToCanvas();
    const result = await window.Tesseract.recognize(canvas, "eng", {
      logger(message) { if (typeof message.progress === "number") setProgress(message.progress, "Đang đọc từng dòng…"); },
    });
    const text = (result.data.text || "").trim();
    if (!text) throw new Error("Chưa đọc được chữ. Hãy chụp gần hơn và dùng bút đậm.");
    elements.codeInput.value = text;
    const confidence = Math.round(result.data.confidence || 0);
    elements.confidence.textContent = `OCR ${confidence}%`;
    elements.confidence.hidden = false;
    executeVisibleCode();
    setProgress(1, "Đã nhận dạng xong");
    setTimeout(resetProgress, 900);
  } catch (error) {
    resetProgress();
    showToast(error.message || "Không thể nhận dạng ảnh này.");
  } finally {
    elements.scanButton.disabled = !(mediaStream || uploadedImage);
    elements.runButton.disabled = false;
  }
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
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
});

elements.codeInput.value = SAMPLE;
executeVisibleCode();
registerWebMcp();
