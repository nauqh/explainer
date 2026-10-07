// Parser for FunctionPlot expressions. Same grammar and precedence as the backend's
// check_expression (Python): ^ is right-associative and binds tighter than unary minus.

export type Fn = (vars: Record<string, number>) => number;

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  exp: Math.exp,
  log: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tanh: Math.tanh,
  max: Math.max,
  min: Math.min,
};

const TOKEN = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/y;

export function compile(source: string): Fn {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  for (let m; TOKEN.lastIndex < source.length && (m = TOKEN.exec(source)); ) {
    if (m[0].trim()) tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t: string) => {
    if (tokens[i] !== t) throw new Error(`expected '${t}' in '${source}'`);
    i++;
  };

  // expr := term (('+'|'-') term)*
  const expr = (): Fn => {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[i++];
      const a = left, b = term();
      left = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return left;
  };
  // term := unary (('*'|'/') unary)*
  const term = (): Fn => {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[i++];
      const a = left, b = unary();
      left = op === "*" ? (v) => a(v) * b(v) : (v) => a(v) / b(v);
    }
    return left;
  };
  // unary := ('-'|'+') unary | power
  const unary = (): Fn => {
    if (peek() === "-") { i++; const a = unary(); return (v) => -a(v); }
    if (peek() === "+") { i++; return unary(); }
    return power();
  };
  // power := atom ('^' unary)?   (the exponent may itself be signed, as in Python)
  const power = (): Fn => {
    const base = atom();
    if (peek() !== "^") return base;
    i++;
    const exp = unary();
    return (v) => Math.pow(base(v), exp(v));
  };
  const atom = (): Fn => {
    const t = tokens[i++];
    if (t === undefined) throw new Error(`unexpected end of '${source}'`);
    if (t === "(") { const e = expr(); eat(")"); return e; }
    if (/^[\d.]/.test(t)) { const n = Number(t); return () => n; }
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() === "(") {
        const f = FUNCTIONS[t];
        if (!f) throw new Error(`unknown function '${t}'`);
        i++;
        const args = [expr()];
        while (peek() === ",") { i++; args.push(expr()); }
        eat(")");
        return (v) => f(...args.map((a) => a(v)));
      }
      return (v) => {
        if (!(t in v)) throw new Error(`unknown name '${t}'`);
        return v[t];
      };
    }
    throw new Error(`unexpected '${t}' in '${source}'`);
  };

  const fn = expr();
  if (i < tokens.length) throw new Error(`unexpected '${tokens[i]}' in '${source}'`);
  return fn;
}
