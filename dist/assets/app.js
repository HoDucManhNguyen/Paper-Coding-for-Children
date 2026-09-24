import { runProgram } from './core.js';
import { assembleVisionResult, cameraCrop, normalizeTranscription } from './ocr.js';

const SAMPLE = 'x = 5\ny = 10\nz = 7\nx + y * z';
const $ = selector => document.querySelector(selector);
const el = Object.fromEntries([
  'camera', 'capture-canvas', 'camera-button', 'scan-button', 'image-input', 'code-input',
  'run-button', 'clear-button', 'sample-button', 'line-results', 'camera-status',
  'confidence-badge', 'progress-wrap', 'progress-label', 'progress-value', 'progress-bar',
  'cancel-ocr-button', 'toast', 'engine-status', 'scan-message', 'scan-details',
  'scan-preview', 'raw-transcription', 'normalization-note', 'engine-select', 'source-image',
].map(id => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), $(`#${id}`)]));
const panel = $('.camera-panel');
let stream = null, uploaded = null, imageUrl = null, previewUrl = null, scan = null;
let loadingImage = false, toastTimer, lastDraft = '';

function toast(text) {
  clearTimeout(toastTimer);
  el.toast.textContent = text;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 5000);
}

function message(text = '', warning = false) {
  el.scanMessage.textContent = text;
  el.scanMessage.hidden = !text;
  el.scanMessage.classList.toggle('warning', warning);
}

function controls() {
  const busy = Boolean(scan) || loadingImage;
  el.scanButton.disabled = busy || (!uploaded && (!stream || !el.camera.videoWidth));
  el.runButton.disabled = busy || !el.codeInput.value.trim();
  for (const control of [el.cameraButton, el.imageInput, el.clearButton, el.sampleButton, el.engineSelect]) control.disabled = busy;
  el.codeInput.readOnly = busy;
  el.cancelOcrButton.disabled = !scan;
}

function progress(text) {
  el.progressWrap.hidden = false;
  el.progressLabel.textContent = text;
  el.progressValue.textContent = '';
  el.progressBar.style.width = '50%';
}

function run() {
  el.lineResults.replaceChildren();
  try {
    const result = runProgram(el.codeInput.value);
    for (const line of result.lines) {
      const row = document.createElement('div');
      row.className = `result-row${line.kind === 'error' ? ' error' : ''}`;
      const number = document.createElement('span');
      number.className = 'line-no'; number.textContent = String(line.lineNo).padStart(2, '0');
      const source = document.createElement('code'); source.textContent = line.source;
      const output = document.createElement('output');
      output.textContent = line.kind === 'error' ? line.error : `→ ${line.display}`;
      row.append(number, source, output); el.lineResults.append(row);
    }
    if (!result.ok) message('Có dòng chưa tính được. Hãy xem thông báo bên cạnh dòng đó.', true);
    return result;
  } catch (error) { message(error.message, true); return { ok: false, lines: [] }; }
}

function stopCamera() {
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  el.camera.srcObject = null;
  el.cameraButton.textContent = 'Bật camera';
  el.cameraStatus.textContent = uploaded ? 'Đã chọn ảnh' : 'Camera chưa bật';
  panel.classList.toggle('has-media', Boolean(uploaded)); panel.classList.remove('live-camera');
  controls();
}

async function toggleCamera() {
  if (stream) { stopCamera(); return; }
  if (!navigator.mediaDevices?.getUserMedia) { toast('Camera chưa khả dụng. Bạn có thể chọn ảnh.'); return; }
  el.cameraButton.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
    uploaded = null;
    if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = null;
    el.sourceImage.hidden = true; el.camera.srcObject = stream;
    await el.camera.play();
    panel.classList.add('has-media', 'live-camera');
    el.cameraButton.textContent = 'Tắt camera';
    el.cameraStatus.textContent = 'Camera đang bật · chỉ quét trong khung';
    el.scanDetails.hidden = true; message();
  } catch (_) {
    stopCamera(); message('Không thể mở camera. Cho phép camera trong trình duyệt hoặc chọn một ảnh.', true);
  } finally { controls(); }
}

async function selectImage(file) {
  if (!file || scan || loadingImage) return;
  if (!file.type.startsWith('image/')) { toast('Hãy chọn một tệp ảnh.'); return; }
  if (file.size > 25 * 1024 * 1024) { toast('Ảnh quá lớn. Hãy chọn ảnh dưới 25 MB.'); return; }
  loadingImage = true; controls();
  const url = URL.createObjectURL(file), image = new Image(); image.src = url;
  try {
    await image.decode(); stopCamera();
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = url; uploaded = image;
    el.sourceImage.src = url; el.sourceImage.hidden = false;
    panel.classList.add('has-media');
    el.cameraStatus.textContent = 'Ảnh sẵn sàng · quét toàn bộ ảnh';
    el.scanDetails.hidden = true; message();
  } catch (_) { URL.revokeObjectURL(url); message('Không mở được ảnh. Hãy dùng PNG hoặc JPEG.', true); }
  finally { loadingImage = false; el.imageInput.value = ''; controls(); }
}

function capture() {
  const source = uploaded || el.camera;
  const sw = uploaded ? uploaded.naturalWidth : el.camera.videoWidth;
  const sh = uploaded ? uploaded.naturalHeight : el.camera.videoHeight;
  if (!sw || !sh) throw new Error('Chưa có hình ảnh để quét.');
  let crop = { x: 0, y: 0, width: sw, height: sh };
  if (!uploaded) {
    const box = el.camera.getBoundingClientRect(), frame = $('.scan-frame').getBoundingClientRect();
    crop = cameraCrop(sw, sh, box.width, box.height, {
      x: frame.left - box.left, y: frame.top - box.top, width: frame.width, height: frame.height,
    });
  }
  const scale = Math.min(1, 2400 / Math.max(crop.width, crop.height)), canvas = el.captureCanvas;
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  // Preserve actual pixels; fixed gray thresholds used to swallow faint strokes.
  canvas.getContext('2d').drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function checkEngine() {
  let available = false;
  try {
    const response = await fetch('./api/health', { signal: AbortSignal.timeout(2500), cache: 'no-store' });
    const health = response.ok ? await response.json() : null;
    available = health?.service === 'papercode' && health.engine === 'apple-vision' && health.localOnly === true;
  } catch (_) { /* Static hosting provides only the explicitly labelled printed-text mode. */ }
  el.engineSelect.options[0].disabled = !available;
  el.engineSelect.value = available ? 'native' : 'browser'; describeEngine();
}

function describeEngine() {
  el.engineStatus.textContent = el.engineSelect.value === 'native'
    ? 'Chữ viết tay · xử lý trên máy Mac · ảnh không được lưu'
    : 'Chế độ chữ in. Để đọc chữ viết tay trên Mac, mở ứng dụng bằng npm start.';
  el.engineStatus.classList.toggle('warning', el.engineSelect.value !== 'native');
}

async function recognizeBrowser(canvas, job) {
  if (!window.Tesseract) throw new Error('Chưa tải được bộ đọc chữ in. Hãy tải lại trang.');
  const worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: new URL('./vendor/worker.min.js', document.baseURI).href,
    corePath: new URL('./vendor/core/', document.baseURI).href,
    langPath: new URL('./vendor/lang/', document.baseURI).href,
    logger(event) { if (scan === job) progress(event.status === 'recognizing text' ? 'Đang đọc chữ in…' : 'Đang chuẩn bị bộ đọc chữ in…'); },
  });
  if (job.controller.signal.aborted) { await worker.terminate(); throw new DOMException('Cancelled', 'AbortError'); }
  job.worker = worker;
  await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(canvas);
  return { ...normalizeTranscription(data.text || ''), rawText: data.text || '', alternatives: [], needsReview: true,
    reason: 'Bộ đọc chữ in có thể đọc sai chữ viết tay. Hãy kiểm tra văn bản trước khi chạy.', engine: 'tesseract' };
}

async function recognize(canvas, blob, job) {
  if (el.engineSelect.value === 'browser') return recognizeBrowser(canvas, job);
  const response = await fetch('./api/ocr', {
    method: 'POST', headers: { 'Content-Type': blob.type, 'X-PaperCode-Request': 'scan' }, body: blob, signal: job.controller.signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Bộ đọc chữ viết tay chưa sẵn sàng. Hãy chạy lại npm start.');
  return assembleVisionResult(body);
}

async function scanPaper() {
  if (scan || loadingImage) return;
  const job = { controller: new AbortController(), worker: null, timer: null }; scan = job;
  lastDraft = el.codeInput.value; el.codeInput.value = ''; el.lineResults.replaceChildren();
  el.confidenceBadge.hidden = true; el.rawTranscription.textContent = ''; el.normalizationNote.textContent = '';
  message(); controls(); progress('Đang chụp vùng giấy…');
  try {
    const canvas = capture();
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (blob?.size > 8 * 1024 * 1024) blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.97));
    if (!blob) throw new Error('Không tạo được ảnh để nhận dạng.');
    if (scan !== job) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob); el.scanPreview.src = previewUrl; el.scanDetails.hidden = false;
    const aborted = new Promise((_, reject) => {
      job.controller.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
      job.timer = setTimeout(() => {
        reject(new Error('Nhận dạng quá 35 giây. Đã dừng; hãy thử lại.')); job.controller.abort();
      }, 35_000);
    });
    progress('Đang đọc chữ viết tay trên máy…');
    const result = await Promise.race([recognize(canvas, blob, job), aborted]);
    if (scan !== job) return;
    el.rawTranscription.textContent = result.alternatives?.length
      ? result.alternatives.map(alt => `${alt.name === 'original' ? 'Ảnh gốc' : alt.name === 'contrast' ? 'Tăng tương phản' : `Xoay ảnh ${alt.name.replace('rotate-', '')}°`}:\n${alt.rawText || '(không đọc được chữ)'}`).join('\n\n') : result.rawText;
    el.normalizationNote.textContent = result.changes?.length ? `Đã chuẩn hóa: ${result.changes.join('; ')}` : 'Không thay đổi chữ hoặc số máy đọc được.';
    if (!result.text) {
      message('Bộ nhận dạng chưa đọc được chữ trong vùng đã quét. Xem ảnh bên dưới; giữ giấy thẳng, lấy đủ các dòng vào khung và đợi camera rõ nét.', true);
      el.scanDetails.open = true; return;
    }
    el.codeInput.value = result.text;
    el.confidenceBadge.textContent = result.needsReview ? 'Cần kiểm tra' : `Đã đọc ${result.text.split('\n').length} dòng`;
    el.confidenceBadge.classList.toggle('warning', result.needsReview); el.confidenceBadge.hidden = false;
    run();
    if (result.needsReview) message(`${result.reason || 'Có dòng máy chưa chắc chắn.'} Kết quả bên dưới là tạm tính; hãy kiểm tra chữ và số.`, true);
    else if (!el.scanMessage.textContent) message('Đã nhận dạng. Hãy đối chiếu chữ và số với giấy trước khi sử dụng kết quả.');
  } catch (error) {
    if (scan === job) message(error.name === 'AbortError' ? 'Đã hủy nhận dạng. Bạn có thể quét lại.' : error.message, true);
  } finally {
    clearTimeout(job.timer);
    if (job.worker) { void job.worker.terminate().catch(() => {}); job.worker = null; }
    if (scan === job) { scan = null; el.progressWrap.hidden = true; controls(); }
  }
}

function cancelScan() {
  if (!scan) return;
  const job = scan; scan = null; job.controller.abort(); clearTimeout(job.timer);
  if (job.worker) { void job.worker.terminate().catch(() => {}); job.worker = null; }
  el.progressWrap.hidden = true; message('Đã hủy nhận dạng. Bạn có thể quét lại.'); controls();
}

el.cameraButton.addEventListener('click', toggleCamera);
el.camera.addEventListener('loadeddata', controls);
el.imageInput.addEventListener('change', event => { void selectImage(event.target.files?.[0]); });
el.scanButton.addEventListener('click', scanPaper);
el.cancelOcrButton.addEventListener('click', cancelScan);
el.runButton.addEventListener('click', () => { message(); run(); });
el.engineSelect.addEventListener('change', describeEngine);
el.clearButton.addEventListener('click', () => {
  el.codeInput.value = ''; el.lineResults.replaceChildren(); el.confidenceBadge.hidden = true; message(); controls();
});
el.sampleButton.addEventListener('click', () => {
  el.codeInput.value = SAMPLE; el.confidenceBadge.hidden = true;
  message('Đây là mã mẫu để thử phép tính, chưa phải chữ nhận dạng từ camera.'); run(); controls();
});
$('#restore-draft').addEventListener('click', () => {
  if (scan) return;
  el.codeInput.value = lastDraft; el.lineResults.replaceChildren(); el.confidenceBadge.hidden = true;
  message('Đã khôi phục mã trước lần quét vừa rồi.'); controls();
});
el.codeInput.addEventListener('input', () => { el.lineResults.replaceChildren(); controls(); });
el.codeInput.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !scan) run(); });
window.addEventListener('beforeunload', () => {
  stream?.getTracks().forEach(track => track.stop()); scan?.controller.abort(); scan?.worker?.terminate();
  if (imageUrl) URL.revokeObjectURL(imageUrl); if (previewUrl) URL.revokeObjectURL(previewUrl);
});
controls(); void checkEngine();
