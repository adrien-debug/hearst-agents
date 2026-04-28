/**
 * Évaluateur d'expressions whitelisté pour les transforms `filter` et `derive`.
 *
 * Ne JAMAIS utiliser eval/Function/import dynamique : tout passe par un
 * petit parseur récursif descendant + un évaluateur AST. Aucun accès global,
 * pas de this, pas de prototype chain.
 *
 * Grammaire :
 *
 *   expr       := or
 *   or         := and ( "||" and )*
 *   and        := not ( "&&" not )*
 *   not        := "!" not | comparison
 *   comparison := sum ( ( "==" | "!=" | "<" | "<=" | ">" | ">=" ) sum )?
 *   sum        := product ( ( "+" | "-" ) product )*
 *   product    := unary ( ( "*" | "/" | "%" ) unary )*
 *   unary      := "-" unary | atom
 *   atom       := NUMBER | STRING | TRUE | FALSE | NULL
 *               | IDENT ( "(" args? ")" )?
 *               | "(" expr ")"
 *   args       := expr ( "," expr )*
 *
 * Identifiers (sans parens) sont résolus dans la row courante.
 * Identifiers (avec parens) sont des fonctions whitelistées.
 */

// ── Tokenizer ──────────────────────────────────────────────

type TokenKind =
  | "NUMBER"
  | "STRING"
  | "IDENT"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "EOF";

interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

const KEYWORDS = new Set(["true", "false", "null"]);
const TWO_CHAR_OPS = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const ONE_CHAR_OPS = new Set(["<", ">", "+", "-", "*", "/", "%", "!"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // whitespace
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    // string littéral
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let value = "";
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          const next = src[i + 1];
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
        } else {
          value += src[i];
          i++;
        }
      }
      if (i >= n) throw new ExprError(`chaîne non terminée`, start);
      i++; // skip closing quote
      tokens.push({ kind: "STRING", value, pos: start });
      continue;
    }

    // nombre
    if ((c >= "0" && c <= "9") || (c === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
      const start = i;
      while (i < n && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) i++;
      tokens.push({ kind: "NUMBER", value: src.slice(start, i), pos: start });
      continue;
    }

    // identifier (champ ou fonction)
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      const start = i;
      while (
        i < n &&
        ((src[i] >= "a" && src[i] <= "z") ||
          (src[i] >= "A" && src[i] <= "Z") ||
          (src[i] >= "0" && src[i] <= "9") ||
          src[i] === "_" ||
          src[i] === ".")
      ) i++;
      tokens.push({ kind: "IDENT", value: src.slice(start, i), pos: start });
      continue;
    }

    // parens / virgule
    if (c === "(") { tokens.push({ kind: "LPAREN", value: "(", pos: i }); i++; continue; }
    if (c === ")") { tokens.push({ kind: "RPAREN", value: ")", pos: i }); i++; continue; }
    if (c === ",") { tokens.push({ kind: "COMMA", value: ",", pos: i }); i++; continue; }

    // opérateurs (2 chars puis 1 char)
    const two = c + (src[i + 1] ?? "");
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ kind: "OP", value: two, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ kind: "OP", value: c, pos: i });
      i++;
      continue;
    }

    throw new ExprError(`caractère inattendu '${c}'`, i);
  }

  tokens.push({ kind: "EOF", value: "", pos: n });
  return tokens;
}

// ── AST ─────────────────────────────────────────────────────

export type ExprAst =
  | { kind: "lit"; value: unknown }
  | { kind: "field"; name: string }
  | { kind: "fn"; name: string; args: ExprAst[] }
  | { kind: "unary"; op: "!" | "-"; expr: ExprAst }
  | { kind: "binary"; op: BinaryOp; left: ExprAst; right: ExprAst };

type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||";

// ── Parser (récursif descendant) ────────────────────────────

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  parse(): ExprAst {
    const ast = this.parseOr();
    if (this.peek().kind !== "EOF") {
      throw new ExprError(`tokens en trop`, this.peek().pos);
    }
    return ast;
  }

  private peek(): Token { return this.tokens[this.i]; }
  private next(): Token { return this.tokens[this.i++]; }

  private match(kind: TokenKind, value?: string): Token | null {
    const tok = this.peek();
    if (tok.kind === kind && (value === undefined || tok.value === value)) {
      this.i++;
      return tok;
    }
    return null;
  }

  private parseOr(): ExprAst {
    let left = this.parseAnd();
    while (this.match("OP", "||")) {
      const right = this.parseAnd();
      left = { kind: "binary", op: "||", left, right };
    }
    return left;
  }

  private parseAnd(): ExprAst {
    let left = this.parseNot();
    while (this.match("OP", "&&")) {
      const right = this.parseNot();
      left = { kind: "binary", op: "&&", left, right };
    }
    return left;
  }

  private parseNot(): ExprAst {
    if (this.match("OP", "!")) {
      return { kind: "unary", op: "!", expr: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): ExprAst {
    const left = this.parseSum();
    const tok = this.peek();
    if (tok.kind === "OP" && ["==", "!=", "<", "<=", ">", ">="].includes(tok.value)) {
      this.i++;
      const right = this.parseSum();
      return { kind: "binary", op: tok.value as BinaryOp, left, right };
    }
    return left;
  }

  private parseSum(): ExprAst {
    let left = this.parseProduct();
    while (true) {
      const tok = this.peek();
      if (tok.kind === "OP" && (tok.value === "+" || tok.value === "-")) {
        this.i++;
        const right = this.parseProduct();
        left = { kind: "binary", op: tok.value, left, right };
      } else break;
    }
    return left;
  }

  private parseProduct(): ExprAst {
    let left = this.parseUnary();
    while (true) {
      const tok = this.peek();
      if (tok.kind === "OP" && (tok.value === "*" || tok.value === "/" || tok.value === "%")) {
        this.i++;
        const right = this.parseUnary();
        left = { kind: "binary", op: tok.value, left, right };
      } else break;
    }
    return left;
  }

  private parseUnary(): ExprAst {
    if (this.match("OP", "-")) {
      return { kind: "unary", op: "-", expr: this.parseUnary() };
    }
    return this.parseAtom();
  }

  private parseAtom(): ExprAst {
    const tok = this.peek();

    if (tok.kind === "NUMBER") {
      this.i++;
      const n = Number(tok.value);
      if (!Number.isFinite(n)) throw new ExprError(`nombre invalide '${tok.value}'`, tok.pos);
      return { kind: "lit", value: n };
    }

    if (tok.kind === "STRING") {
      this.i++;
      return { kind: "lit", value: tok.value };
    }

    if (tok.kind === "IDENT") {
      this.i++;
      const lower = tok.value.toLowerCase();
      if (KEYWORDS.has(lower)) {
        if (lower === "true") return { kind: "lit", value: true };
        if (lower === "false") return { kind: "lit", value: false };
        return { kind: "lit", value: null };
      }
      // Appel de fonction si suivi de "("
      if (this.match("LPAREN")) {
        const args: ExprAst[] = [];
        if (this.peek().kind !== "RPAREN") {
          args.push(this.parseOr());
          while (this.match("COMMA")) {
            args.push(this.parseOr());
          }
        }
        if (!this.match("RPAREN")) {
          throw new ExprError(`')' attendue`, this.peek().pos);
        }
        return { kind: "fn", name: tok.value, args };
      }
      return { kind: "field", name: tok.value };
    }

    if (this.match("LPAREN")) {
      const inner = this.parseOr();
      if (!this.match("RPAREN")) {
        throw new ExprError(`')' attendue`, this.peek().pos);
      }
      return inner;
    }

    throw new ExprError(`atome attendu`, tok.pos);
  }
}

// ── Erreur typée ────────────────────────────────────────────

export class ExprError extends Error {
  constructor(message: string, public pos: number) {
    super(`expr: ${message} (pos ${pos})`);
    this.name = "ExprError";
  }
}

// ── Évaluateur ──────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * Fonctions pures whitelistées. Ajouter ici uniquement des opérations sans
 * effet de bord, déterministes, et bornées en complexité.
 */
const FUNCTIONS: Record<string, (...args: unknown[]) => unknown> = {
  lower: (s) => (typeof s === "string" ? s.toLowerCase() : s),
  upper: (s) => (typeof s === "string" ? s.toUpperCase() : s),
  abs: (n) => (typeof n === "number" ? Math.abs(n) : NaN),
  length: (v) => {
    if (typeof v === "string") return v.length;
    if (Array.isArray(v)) return v.length;
    return 0;
  },
  contains: (s, sub) => typeof s === "string" && typeof sub === "string" && s.includes(sub),
  startsWith: (s, p) => typeof s === "string" && typeof p === "string" && s.startsWith(p),
  endsWith: (s, p) => typeof s === "string" && typeof p === "string" && s.endsWith(p),
  coalesce: (...vals) => vals.find((v) => v !== null && v !== undefined) ?? null,
  isNull: (v) => v === null || v === undefined,
  isNotNull: (v) => v !== null && v !== undefined,
  /** dateDiff(unit, a, b) — unit ∈ {d, w, m, y}. Retourne floor(b - a). */
  dateDiff: (unit, a, b) => {
    const ta = parseDate(a);
    const tb = parseDate(b);
    if (ta === null || tb === null) return null;
    const ms = tb - ta;
    switch (unit) {
      case "d": return Math.floor(ms / 86_400_000);
      case "w": return Math.floor(ms / (7 * 86_400_000));
      case "m": return Math.floor(ms / (30 * 86_400_000));
      case "y": return Math.floor(ms / (365 * 86_400_000));
      default: return null;
    }
  },
  /** num(v) — coerce vers number, retourne null si impossible. */
  num: (v) => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (typeof v === "boolean") return v ? 1 : 0;
    return null;
  },
};

function parseDate(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  if (v instanceof Date) return v.getTime();
  return null;
}

/**
 * Lookup hiérarchique : "user.email" → row["user"]["email"].
 *
 * SÉCURITÉ : on n'accède qu'aux own properties via Object.hasOwn pour bloquer
 * la prototype chain ('constructor', '__proto__', 'toString', …). Sans ça,
 * une expression `constructor` retournerait Object → Function → exécution
 * de code arbitraire.
 */
function resolveField(row: Row, path: string): unknown {
  if (!path.includes(".")) {
    return hasOwn(row, path) ? row[path] : undefined;
  }
  const parts = path.split(".");
  let cur: unknown = row;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    if (!hasOwn(cur as Record<string, unknown>, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function evalAst(ast: ExprAst, row: Row): unknown {
  switch (ast.kind) {
    case "lit": return ast.value;
    case "field": return resolveField(row, ast.name);
    case "fn": {
      const fn = FUNCTIONS[ast.name];
      if (!fn) throw new ExprError(`fonction inconnue '${ast.name}'`, 0);
      const args = ast.args.map((a) => evalAst(a, row));
      return fn(...args);
    }
    case "unary": {
      const v = evalAst(ast.expr, row);
      if (ast.op === "!") return !truthy(v);
      // unary minus
      if (typeof v === "number") return -v;
      return null;
    }
    case "binary": return evalBinary(ast.op, evalAst(ast.left, row), evalAst(ast.right, row));
  }
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  return true;
}

function evalBinary(op: BinaryOp, a: unknown, b: unknown): unknown {
  // logiques avec court-circuit déjà géré côté AST en théorie ; ici a et b
  // sont déjà évalués, on reste sur de la sémantique simple.
  if (op === "&&") return truthy(a) && truthy(b);
  if (op === "||") return truthy(a) || truthy(b);

  // égalités : strictes mais avec coercion null/undefined.
  if (op === "==") return looseEq(a, b);
  if (op === "!=") return !looseEq(a, b);

  // comparaisons : numériques si les deux sont nombres, sinon lexicographiques.
  if (op === "<" || op === "<=" || op === ">" || op === ">=") {
    const cmp = compare(a, b);
    if (cmp === null) return false;
    if (op === "<") return cmp < 0;
    if (op === "<=") return cmp <= 0;
    if (op === ">") return cmp > 0;
    if (op === ">=") return cmp >= 0;
  }

  // arithmétique : null si l'un n'est pas un nombre fini.
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na === null || nb === null) return null;
  if (op === "+") return na + nb;
  if (op === "-") return na - nb;
  if (op === "*") return na * nb;
  if (op === "/") return nb === 0 ? null : na / nb;
  if (op === "%") return nb === 0 ? null : na % nb;
  return null;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  // compare nombres et strings numériques
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  if (typeof a === "string" && typeof b === "number") return Number(a) === b;
  return false;
}

function compare(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  // tentative numérique
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "boolean") return v ? 1 : 0;
  return null;
}

// ── API publique ────────────────────────────────────────────

const COMPILE_CACHE = new Map<string, ExprAst>();
const COMPILE_CACHE_MAX = 256;

export function compileExpr(src: string): ExprAst {
  const cached = COMPILE_CACHE.get(src);
  if (cached) return cached;
  const ast = new Parser(tokenize(src)).parse();
  if (COMPILE_CACHE.size >= COMPILE_CACHE_MAX) {
    // simple LRU light : drop le premier
    const firstKey = COMPILE_CACHE.keys().next().value;
    if (firstKey !== undefined) COMPILE_CACHE.delete(firstKey);
  }
  COMPILE_CACHE.set(src, ast);
  return ast;
}

export function evaluate(src: string, row: Row): unknown {
  return evalAst(compileExpr(src), row);
}

export function evaluateAst(ast: ExprAst, row: Row): unknown {
  return evalAst(ast, row);
}
