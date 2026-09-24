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
