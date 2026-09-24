import { normalizeSource } from './core.js';

// object-fit: cover crops the preview. Map the visible frame back to sensor pixels.
export function cameraCrop(sourceWidth, sourceHeight, previewWidth, previewHeight, frame) {
  if ([sourceWidth, sourceHeight, previewWidth, previewHeight].some(n => !Number.isFinite(n) || n <= 0)) {
    throw new Error('Camera chưa có hình ảnh. Hãy đợi camera sẵn sàng.');
  }
  const scale = Math.max(previewWidth / sourceWidth, previewHeight / sourceHeight);
  const offsetX = (sourceWidth * scale - previewWidth) / 2;
  const offsetY = (sourceHeight * scale - previewHeight) / 2;
  return {
    x: Math.max(0, (frame.x + offsetX) / scale),
    y: Math.max(0, (frame.y + offsetY) / scale),
    width: Math.min(sourceWidth, frame.width / scale),
    height: Math.min(sourceHeight, frame.height / scale),
  };
}

// Only typographic normalization. Never infer a missing letter, digit, or operator.
export function normalizeTranscription(raw) {
  const changes = [];
  let text = normalizeSource(raw);
  if (text !== raw) changes.push('Chuẩn hóa dấu nhân, chia hoặc dấu trừ kiểu chữ.');
  const lookalikes = { 'х': 'x', 'Х': 'X', 'у': 'y', 'У': 'Y', 'χ': 'x' };
  text = text.replace(/[хХуУχ]/g, char => {
    changes.push(`${char} → ${lookalikes[char]} (ký tự cùng hình dáng)`);
    return lookalikes[char];
  });
  text = text.replace(/\b[A-Z]\b/g, char => {
    changes.push(`${char} → ${char.toLowerCase()} (tên biến một chữ)`);
    return char.toLowerCase();
  });
  text = text.split('\n').map(line => line.trim().replace(/[ \t]+/g, ' ')).filter(Boolean).join('\n');
  return { text, changes: [...new Set(changes)] };
}

export function groupObservations(observations) {
  const items = (observations || []).filter(item => {
    return Array.isArray(item.box) && item.box.length === 4
      && item.box.every(Number.isFinite) && item.box[2] > 0 && item.box[3] > 0
      && typeof item.candidates?.[0]?.text === 'string' && item.candidates[0].text.trim();
  }).sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const rows = [];
  for (const item of items) {
    const [x, y, width, height] = item.box;
    let bestRow = null;
    let bestOverlap = 0;
    for (const row of rows) {
      const overlap = Math.min(row.bottom, y + height) - Math.max(row.top, y);
      const ratio = overlap / Math.min(row.bottom - row.top, height);
      // Adjacent fragments of a line may have very different heights (y versus 30).
      const horizontalOverlap = row.items.some(other =>
        Math.min(other.box[0] + other.box[2], x + width) - Math.max(other.box[0], x) > Math.min(width, other.box[2]) * 0.3);
      if (!horizontalOverlap && ratio > 0.4 && ratio > bestOverlap) {
        bestRow = row;
        bestOverlap = ratio;
      }
    }
    if (bestRow) {
      bestRow.items.push(item);
      bestRow.top = Math.min(bestRow.top, y);
      bestRow.bottom = Math.max(bestRow.bottom, y + height);
    } else rows.push({ top: y, bottom: y + height, items: [item] });
  }
  return rows.sort((a, b) => a.top - b.top).map(row => {
    const parts = row.items.sort((a, b) => a.box[0] - b.box[0]);
    return {
      text: parts.map(part => part.candidates[0].text.trim()).join(' '),
      confidence: Math.min(...parts.map(part => Number(part.candidates[0].confidence) || 0)),
      box: [Math.min(...parts.map(p => p.box[0])), row.top,
        Math.max(...parts.map(p => p.box[0] + p.box[2])) - Math.min(...parts.map(p => p.box[0])), row.bottom - row.top],
    };
  });
}

export function assembleVisionResult(response) {
  const alternatives = (response.passes || []).map(pass => {
    const lines = groupObservations(pass.observations);
    const rawText = lines.map(line => line.text).join('\n');
    const normalized = normalizeTranscription(rawText);
    return { name: pass.name, lines, rawText, ...normalized };
  });
  if (!alternatives.length) throw new Error('Bộ nhận dạng trả về dữ liệu không hợp lệ.');
  // Prefer the pass containing more actual recognized characters. Retain both
  // transcriptions and require review when they differ; no parse-based guessing.
  const chosen = [...alternatives].sort((a, b) => b.text.replace(/\s/g, '').length - a.text.replace(/\s/g, '').length)[0];
  const canonical = text => text.split('\n').map(line => line.replace(/[ \t]/g, '')).join('\n');
  const disagreement = alternatives.some(alt => canonical(alt.text) !== canonical(chosen.text));
  return { ...chosen, alternatives, engine: 'apple-vision',
    needsReview: disagreement || chosen.lines.some(line => line.confidence < 0.7) || !chosen.text,
    reason: disagreement ? 'Hai lần đọc chưa thống nhất. Hãy đối chiếu với ảnh đã quét.' : '',
  };
}
