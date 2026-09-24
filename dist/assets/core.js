const MAX_ABS_VALUE = 1e15;
const MAX_SOURCE_LENGTH = 4000;
const MAX_LINES = 80;

export class PaperCodeError extends Error {
  constructor(message, column = null) {
    super(message);
    this.name = "PaperCodeError";
    this.column = column;
  }
}

export function normalizeSource(source) {
  return String(source)
    .normalize("NFKC")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[＝]/g, "=")
    .replace(/\r\n?/g, "\n");
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]), raw: number[0], index });
      index += number[0].length;
      continue;
    }
    const identifier = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], index });
      index += identifier[0].length;
      continue;
    }
    if ("+-*/^()".includes(char)) {
      tokens.push({ type: char, value: char, index });
      index += 1;
      continue;
    }
    throw new PaperCodeError(`Ký tự “${char}” chưa được hỗ trợ`, index + 1);
  }
  tokens.push({ type: "eof", value: null, index: expression.length });
  return tokens;
}

function ensureFinite(value) {
  if (!Number.isFinite(value)) throw new PaperCodeError("Kết quả không phải là một số hữu hạn");
  if (Math.abs(value) > MAX_ABS_VALUE) throw new PaperCodeError("Kết quả quá lớn cho phiên bản này");
  return value;
}

export function evaluateExpression(expression, variables = {}) {
  const tokens = tokenize(expression);
  let cursor = 0;
  const current = () => tokens[cursor];
  const take = (type) => {
    if (current().type !== type) throw new PaperCodeError(`Cần “${type}” tại đây`, current().index + 1);
    return tokens[cursor++];
  };

  const parsePrimary = () => {
    if (current().type === "number") return take("number").value;
    if (current().type === "identifier") {
      const token = take("identifier");
      if (!Object.hasOwn(variables, token.value)) throw new PaperCodeError(`Biến “${token.value}” chưa có giá trị`, token.index + 1);
      return variables[token.value];
    }
    if (current().type === "(") {
      take("(");
      const value = parseAdditive();
      take(")");
      return value;
    }
    throw new PaperCodeError("Cần một số, tên biến hoặc dấu ngoặc", current().index + 1);
  };

  const parseUnary = () => {
    if (current().type === "+") { take("+"); return parseUnary(); }
    if (current().type === "-") { take("-"); return ensureFinite(-parseUnary()); }
    return parsePrimary();
  };

  const parsePower = () => {
    const left = parseUnary();
    if (current().type === "^") { take("^"); return ensureFinite(left ** parsePower()); }
    return left;
  };

  const parseMultiplicative = () => {
    let value = parsePower();
    while (current().type === "*" || current().type === "/") {
      const operator = current().type;
      take(operator);
      const right = parsePower();
      if (operator === "/" && right === 0) throw new PaperCodeError("Không thể chia cho 0");
      value = ensureFinite(operator === "*" ? value * right : value / right);
    }
    return value;
  };

  function parseAdditive() {
    let value = parseMultiplicative();
    while (current().type === "+" || current().type === "-") {
      const operator = current().type;
      take(operator);
      const right = parseMultiplicative();
      value = ensureFinite(operator === "+" ? value + right : value - right);
    }
    return value;
  }

  const result = parseAdditive();
  if (current().type !== "eof") throw new PaperCodeError("Còn ký tự chưa thể hiểu", current().index + 1);
  return ensureFinite(result);
}

export function formatNumber(value) {
  if (Object.is(value, -0)) return "0";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 10 }).format(value);
}

export function assessOcrText(text, confidence) {
  const source = String(text || "").trim();
  const lines = source.split("\n").filter((line) => line.trim());
  const compact = source.replace(/\s/g, "");
  const supported = compact.replace(/[^A-Za-z0-9_+\-*/^()=.#]/g, "");
  const supportedRatio = compact.length ? supported.length / compact.length : 0;
  const reasons = [];
  if (!source) reasons.push("blank");
  if (lines.length > 20) reasons.push("too-many-lines");
  if (supportedRatio < 0.75) reasons.push("unsupported-characters");
  const reviewReasons = [];
  if (Number(confidence) < 60) reviewReasons.push("low-confidence");
  if (supportedRatio < 0.9) reviewReasons.push("unsupported-characters");
  return {
    ok: reasons.length === 0,
    needsReview: reviewReasons.length > 0,
    reasons,
    reviewReasons,
    lineCount: lines.length,
    supportedRatio,
  };
}

function compactGlyphText(value) {
  return String(value || "").normalize("NFKC").replace(/\s/g, "");
}

function classifyVariableGlyph(glyph) {
  const text = compactGlyphText(glyph.text);
  if (/[yYg]/.test(text) || (Number(glyph.aspect) > 0 && Number(glyph.aspect) < 0.9)) return "y";
  if (/[zZ]/.test(text)) return "z";
  return "x";
}

function classifyValueGlyph(glyph) {
  const text = compactGlyphText(glyph.text);
  if (glyph.isEquals || text.includes("=")) return { value: "=", kind: "operator" };
  if (glyph.isPlus || text.includes("+") || text === "4") return { value: "+", kind: "operator" };
  if (glyph.isMinus || text === "-" || text === "_") return { value: "-", kind: "operator" };
  if (/[*/^()]/.test(text)) return { value: text.match(/[*/^()]/)[0], kind: "operator" };
  const exactDigit = text.match(/[0-9]/);
  if (exactDigit) {
    const digit = exactDigit[0] === "5" && Number(glyph.inkCentroidX) > 0.56 ? "3" : exactDigit[0];
    return { value: digit, kind: "word" };
  }

  if (Number(glyph.aspect) > 0 && Number(glyph.aspect) < 0.38 && !/[yYg]/.test(text)) {
    return { value: "1", kind: "word" };
  }
  if (/^[oOQDpPe]+$/.test(text)) {
    return { value: "0", kind: "word" };
  }
  if ((!text || text.length > 1) && Number(glyph.aspect) >= 0.9) {
    return { value: classifyVariableGlyph(glyph), kind: "word" };
  }
  const confusedDigit = text.match(/[ZBASbGTgq]/);
  if (confusedDigit) {
    const replacements = { Z: "2", B: "3", S: "3", A: "4", b: "6", G: "6", T: "7", g: "9", q: "9" };
    return { value: replacements[confusedDigit[0]], kind: "word" };
  }
  return { value: classifyVariableGlyph(glyph), kind: "word" };
}

function formatGlyphTokens(tokens) {
  let output = "";
  let previousKind = null;
  for (const token of tokens) {
    if (!token.value) continue;
    if (token.kind === "operator") {
      output = `${output.trimEnd()} ${token.value} `;
    } else if (previousKind === "word" && /\d$/.test(output) && /^\d$/.test(token.value)) {
      output += token.value;
    } else {
      output += output && !output.endsWith(" ") ? ` ${token.value}` : token.value;
    }
    previousKind = token.kind;
  }
  return output.trim().replace(/\s+/g, " ");
}

export function reconstructOcrGlyphLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const glyphs = Array.isArray(line) ? line : [];
      if (!glyphs.length) return "";
      const equalityIndex = glyphs.findIndex((glyph) => glyph.isEquals || compactGlyphText(glyph.text).includes("="));
      const tokens = glyphs.map((glyph, index) => {
        if (index === 0 && equalityIndex === 1) {
          return { value: classifyVariableGlyph(glyph), kind: "word" };
        }
        return classifyValueGlyph(glyph);
      });
      return formatGlyphTokens(tokens);
    })
    .filter(Boolean)
    .join("\n");
}

export function runProgram(source) {
  const normalized = normalizeSource(source);
  if (normalized.length > MAX_SOURCE_LENGTH) throw new PaperCodeError("Bài viết quá dài");
  const rawLines = normalized.split("\n");
  if (rawLines.length > MAX_LINES) throw new PaperCodeError("Bài viết có quá nhiều dòng");
  const variables = Object.create(null);
  const lines = [];

  rawLines.forEach((raw, index) => {
    const withoutComment = raw.split("#", 1)[0].trim();
    if (!withoutComment) return;
    try {
      const assignment = withoutComment.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (withoutComment.includes("=") && !assignment) throw new PaperCodeError("Phép gán cần có dạng tên = biểu thức");
      if (assignment) {
        const [, name, expression] = assignment;
        if (expression.includes("=")) throw new PaperCodeError("Mỗi dòng chỉ được có một dấu =");
        const value = evaluateExpression(expression, variables);
        variables[name] = value;
        lines.push({ lineNo: index + 1, source: raw.trim(), kind: "assignment", name, value, display: `${name} = ${formatNumber(value)}` });
      } else {
        const value = evaluateExpression(withoutComment, variables);
        lines.push({ lineNo: index + 1, source: raw.trim(), kind: "expression", value, display: formatNumber(value) });
      }
    } catch (error) {
      const message = error instanceof PaperCodeError ? error.message : "Không thể tính dòng này";
      lines.push({ lineNo: index + 1, source: raw.trim(), kind: "error", error: message });
    }
  });
  return { variables: { ...variables }, lines, ok: lines.length > 0 && lines.every((line) => line.kind !== "error") };
}
