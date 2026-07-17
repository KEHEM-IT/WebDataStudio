/**
 * A tiny, sandboxed expression evaluator for Calculated Columns and
 * Conditional Values.
 *
 * IMPORTANT: Manifest V3's default extension-page CSP forbids `eval` and
 * `new Function` ("unsafe-eval"). We can't hand the user real JavaScript,
 * so this implements a minimal safe grammar instead:
 *
 *   literals   : "string", 'string', 123, true, false, null
 *   identifiers: bare column names, e.g. Price, First_Name
 *   operators  : + - * / %   == != > < >= <=   && || !   ( )
 *   functions  : upper() lower() trim() len() round() concat() includes()
 *
 * Identifiers resolve against the row's cell values at evaluation time.
 * There is no access to globals, DOM, chrome.*, or arbitrary function calls.
 */

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'eof' };

const FUNCTIONS = new Set(['upper', 'lower', 'trim', 'len', 'round', 'concat', 'includes']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) { out += src[j + 1]; j += 2; continue; }
        out += src[j]; j++;
      }
      tokens.push({ t: 'str', v: out });
      i = j + 1;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      tokens.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i;
      while (j < src.length && isIdentChar(src[j]!)) j++;
      const word = src.slice(i, j);
      if (word === 'true') tokens.push({ t: 'num', v: 1 });
      else if (word === 'false') tokens.push({ t: 'num', v: 0 });
      else if (word === 'null') tokens.push({ t: 'str', v: '' });
      else tokens.push({ t: 'ident', v: word });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%()<>!,'.includes(c)) {
      tokens.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in expression`);
  }
  tokens.push({ t: 'eof' });
  return tokens;
}

type EvalValue = string | number;
export type ExprContext = Record<string, EvalValue>;

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos]!; }
  private next(): Token { return this.tokens[this.pos++]!; }
  private expectOp(op: string): void {
    const t = this.next();
    if (t.t !== 'op' || t.v !== op) throw new Error(`Expected "${op}"`);
  }

  parse(ctx: ExprContext): EvalValue {
    const v = this.or(ctx);
    if (this.peek().t !== 'eof') throw new Error('Unexpected trailing input in expression');
    return v;
  }

  private or(ctx: ExprContext): EvalValue {
    let left = this.and(ctx);
    while (this.peek().t === 'op' && (this.peek() as { v: string }).v === '||') {
      this.next();
      const right = this.and(ctx);
      left = truthy(left) || truthy(right) ? 1 : 0;
    }
    return left;
  }

  private and(ctx: ExprContext): EvalValue {
    let left = this.equality(ctx);
    while (this.peek().t === 'op' && (this.peek() as { v: string }).v === '&&') {
      this.next();
      const right = this.equality(ctx);
      left = truthy(left) && truthy(right) ? 1 : 0;
    }
    return left;
  }

  private equality(ctx: ExprContext): EvalValue {
    let left = this.comparison(ctx);
    while (this.peek().t === 'op' && ['==', '!='].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const right = this.comparison(ctx);
      const eq = String(left) === String(right);
      left = (op === '==' ? eq : !eq) ? 1 : 0;
    }
    return left;
  }

  private comparison(ctx: ExprContext): EvalValue {
    let left = this.additive(ctx);
    while (this.peek().t === 'op' && ['>', '<', '>=', '<='].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const right = this.additive(ctx);
      const a = Number(left), b = Number(right);
      const r = op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : a <= b;
      left = r ? 1 : 0;
    }
    return left;
  }

  private additive(ctx: ExprContext): EvalValue {
    let left = this.multiplicative(ctx);
    while (this.peek().t === 'op' && ['+', '-'].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const right = this.multiplicative(ctx);
      if (op === '+' && (typeof left === 'string' || typeof right === 'string')) {
        left = String(left) + String(right);
      } else {
        left = op === '+' ? Number(left) + Number(right) : Number(left) - Number(right);
      }
    }
    return left;
  }

  private multiplicative(ctx: ExprContext): EvalValue {
    let left = this.unary(ctx);
    while (this.peek().t === 'op' && ['*', '/', '%'].includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const right = Number(this.unary(ctx));
      const l = Number(left);
      left = op === '*' ? l * right : op === '/' ? l / right : l % right;
    }
    return left;
  }

  private unary(ctx: ExprContext): EvalValue {
    if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '!') {
      this.next();
      return truthy(this.unary(ctx)) ? 0 : 1;
    }
    if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '-') {
      this.next();
      return -Number(this.unary(ctx));
    }
    return this.primary(ctx);
  }

  private primary(ctx: ExprContext): EvalValue {
    const t = this.next();
    if (t.t === 'num') return t.v;
    if (t.t === 'str') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = this.or(ctx);
      this.expectOp(')');
      return v;
    }
    if (t.t === 'ident') {
      if (this.peek().t === 'op' && (this.peek() as { v: string }).v === '(') {
        return this.callFunction(t.v, ctx);
      }
      return ctx[t.v] ?? '';
    }
    throw new Error('Unexpected token in expression');
  }

  private callFunction(name: string, ctx: ExprContext): EvalValue {
    if (!FUNCTIONS.has(name)) throw new Error(`Unknown function "${name}"`);
    this.expectOp('(');
    const args: EvalValue[] = [];
    if (!(this.peek().t === 'op' && (this.peek() as { v: string }).v === ')')) {
      args.push(this.or(ctx));
      while (this.peek().t === 'op' && (this.peek() as { v: string }).v === ',') {
        this.next();
        args.push(this.or(ctx));
      }
    }
    this.expectOp(')');
    switch (name) {
      case 'upper': return String(args[0] ?? '').toUpperCase();
      case 'lower': return String(args[0] ?? '').toLowerCase();
      case 'trim': return String(args[0] ?? '').trim();
      case 'len': return String(args[0] ?? '').length;
      case 'round': return Math.round(Number(args[0] ?? 0) * 10 ** Number(args[1] ?? 0)) / 10 ** Number(args[1] ?? 0);
      case 'concat': return args.map(String).join('');
      case 'includes': return String(args[0] ?? '').includes(String(args[1] ?? '')) ? 1 : 0;
      default: throw new Error(`Unknown function "${name}"`);
    }
  }
}

function truthy(v: EvalValue): boolean {
  return typeof v === 'number' ? v !== 0 : v.length > 0;
}

/** Evaluates a safe expression string against a row context and returns a
 *  display-ready string. Throws with a user-facing message on bad syntax. */
export function evaluateExpression(expression: string, ctx: ExprContext): string {
  const tokens = tokenize(expression);
  const value = new Parser(tokens).parse(ctx);
  return String(value);
}

/** Evaluates a boolean-ish condition expression (used by conditionalValue). */
export function evaluateCondition(expression: string, ctx: ExprContext): boolean {
  const tokens = tokenize(expression);
  const value = new Parser(tokens).parse(ctx);
  return truthy(value);
}
