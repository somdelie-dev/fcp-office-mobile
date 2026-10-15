/**
 * Evaluates calculator input such as "12.5×(3+4)−10%" without eval:
 * a small recursive-descent parser over + − × ÷, brackets, unary minus and
 * percent (a trailing % divides the number before it by 100).
 * Returns null while the expression is incomplete or invalid.
 */

type Token = { type: "num"; value: number } | { type: "op"; value: string };

const OPS = new Set(["+", "−", "×", "÷", "(", ")", "%"]);

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " ") {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      const text = input.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1 || text === ".") return null;
      tokens.push({ type: "num", value: Number(text) });
      i = j;
    } else if (OPS.has(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

export function evaluate(input: string): number | null {
  const parsed = tokenize(input);
  if (!parsed || parsed.length === 0) return null;
  const tokens: Token[] = parsed;
  let pos = 0;

  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.type === "op" && peek()?.value === v;

  // expr := term (("+" | "−") term)*
  function expr(): number | null {
    let left = term();
    while (left != null && (isOp("+") || isOp("−"))) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = term();
      if (right == null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  // term := factor (("×" | "÷") factor)*
  function term(): number | null {
    let left = factor();
    while (left != null && (isOp("×") || isOp("÷"))) {
      const op = (tokens[pos++] as { value: string }).value;
      const right = factor();
      if (right == null) return null;
      if (op === "÷" && right === 0) return null;
      left = op === "×" ? left * right : left / right;
    }
    return left;
  }

  // factor := "−" factor | primary "%"*
  function factor(): number | null {
    if (isOp("−")) {
      pos++;
      const v = factor();
      return v == null ? null : -v;
    }
    let v = primary();
    while (v != null && isOp("%")) {
      pos++;
      v = v / 100;
    }
    return v;
  }

  function primary(): number | null {
    const t = peek();
    if (!t) return null;
    if (t.type === "num") {
      pos++;
      return t.value;
    }
    if (t.value === "(") {
      pos++;
      const v = expr();
      // An unclosed bracket still previews, as if closed at the end.
      if (isOp(")")) pos++;
      return v;
    }
    return null;
  }

  const result = expr();
  if (result == null || pos !== tokens.length || !Number.isFinite(result))
    return null;
  // Trim float noise like 0.1 + 0.2 = 0.30000000000000004.
  return Number(result.toPrecision(12));
}

/** "1234567.5" -> "1 234 567.5" for the display. */
export function formatNumber(n: number) {
  if (Math.abs(n) >= 1e15) return n.toExponential(6);
  const [whole, frac] = String(n).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Groups the digits of every number inside an expression for display. */
export function formatExpression(expr: string) {
  return expr.replace(/\d+(\.\d*)?/g, (m) => {
    const [whole, frac] = m.split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return frac !== undefined ? `${grouped}.${frac}` : grouped;
  });
}
