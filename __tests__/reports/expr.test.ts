/**
 * Tests de l'évaluateur d'expressions whitelisté.
 * Doit être 100% sûr : pas d'eval, pas d'accès global, pas d'effet de bord.
 */

import { describe, expect, it } from "vitest";
import { compileExpr, evaluate, ExprError } from "@/lib/reports/engine/expr";

describe("evaluate — littéraux et identifiers", () => {
  it("évalue les nombres", () => {
    expect(evaluate("42", {})).toBe(42);
    expect(evaluate("3.14", {})).toBe(3.14);
    expect(evaluate("0", {})).toBe(0);
  });

  it("évalue les strings entre quotes simples ou doubles", () => {
    expect(evaluate('"hello"', {})).toBe("hello");
    expect(evaluate("'world'", {})).toBe("world");
    expect(evaluate('"a\\nb"', {})).toBe("a\nb");
  });

  it("évalue true/false/null (case insensitive)", () => {
    expect(evaluate("true", {})).toBe(true);
    expect(evaluate("FALSE", {})).toBe(false);
    expect(evaluate("null", {})).toBe(null);
  });

  it("résout un identifier dans la row", () => {
    expect(evaluate("amount", { amount: 100 })).toBe(100);
    expect(evaluate("name", { name: "Alice" })).toBe("Alice");
  });

  it("retourne undefined pour un identifier absent", () => {
    expect(evaluate("missing", {})).toBeUndefined();
  });

  it("résout les chemins pointés (user.email)", () => {
    expect(evaluate("user.email", { user: { email: "x@y.z" } })).toBe("x@y.z");
  });
});

describe("evaluate — arithmétique", () => {
  it("addition, soustraction, multiplication, division", () => {
    expect(evaluate("1 + 2", {})).toBe(3);
    expect(evaluate("10 - 4", {})).toBe(6);
    expect(evaluate("3 * 4", {})).toBe(12);
    expect(evaluate("20 / 4", {})).toBe(5);
    expect(evaluate("17 % 5", {})).toBe(2);
  });

  it("priorité des opérateurs", () => {
    expect(evaluate("1 + 2 * 3", {})).toBe(7);
    expect(evaluate("(1 + 2) * 3", {})).toBe(9);
    expect(evaluate("10 - 2 - 3", {})).toBe(5); // gauche-associatif
  });

  it("unaire moins", () => {
    expect(evaluate("-5", {})).toBe(-5);
    expect(evaluate("-(2 + 3)", {})).toBe(-5);
  });

  it("division par zéro → null", () => {
    expect(evaluate("10 / 0", {})).toBeNull();
    expect(evaluate("10 % 0", {})).toBeNull();
  });

  it("arithmétique avec champ non-numérique → null", () => {
    expect(evaluate("amount + 1", { amount: "abc" })).toBeNull();
  });

  it("coerce string-numérique vers number", () => {
    expect(evaluate("amount + 1", { amount: "9" })).toBe(10);
  });
});

describe("evaluate — comparaisons", () => {
  it("égalités", () => {
    expect(evaluate("1 == 1", {})).toBe(true);
    expect(evaluate("1 != 2", {})).toBe(true);
    expect(evaluate('"a" == "a"', {})).toBe(true);
  });

  it("ordre numérique", () => {
    expect(evaluate("5 < 10", {})).toBe(true);
    expect(evaluate("5 >= 5", {})).toBe(true);
    expect(evaluate("a < b", { a: 3, b: 7 })).toBe(true);
  });

  it("ordre lexicographique sur strings", () => {
    expect(evaluate('"apple" < "banana"', {})).toBe(true);
  });

  it("comparaison avec null → false", () => {
    expect(evaluate("missing < 5", {})).toBe(false);
    expect(evaluate("a > b", { a: null, b: 5 })).toBe(false);
  });

  it("équivalence loose number ↔ string numérique", () => {
    expect(evaluate("5 == '5'", {})).toBe(true);
    expect(evaluate("'5' == 5", {})).toBe(true);
  });
});

describe("evaluate — booléens", () => {
  it("AND, OR, NOT", () => {
    expect(evaluate("true && true", {})).toBe(true);
    expect(evaluate("true && false", {})).toBe(false);
    expect(evaluate("false || true", {})).toBe(true);
    expect(evaluate("!true", {})).toBe(false);
    expect(evaluate("!false", {})).toBe(true);
  });

  it("court-circuit logique sur valeurs falsy", () => {
    expect(evaluate("missing && 1", {})).toBe(false);
    expect(evaluate("0 || 'fallback'", {})).toBe(true);
  });

  it("expression complexe", () => {
    const row = { age: 25, status: "active", country: "FR" };
    expect(evaluate("age >= 18 && status == 'active'", row)).toBe(true);
    expect(evaluate("country == 'US' || country == 'FR'", row)).toBe(true);
    expect(evaluate("!(country == 'US')", row)).toBe(true);
  });
});

describe("evaluate — fonctions whitelistées", () => {
  it("lower, upper", () => {
    expect(evaluate("lower('FOO')", {})).toBe("foo");
    expect(evaluate("upper('foo')", {})).toBe("FOO");
  });

  it("contains, startsWith, endsWith", () => {
    expect(evaluate("contains(name, 'lic')", { name: "Alice" })).toBe(true);
    expect(evaluate("startsWith(name, 'A')", { name: "Alice" })).toBe(true);
    expect(evaluate("endsWith(name, 'e')", { name: "Alice" })).toBe(true);
    expect(evaluate("contains(name, 'X')", { name: "Alice" })).toBe(false);
  });

  it("coalesce", () => {
    expect(evaluate("coalesce(missing, fallback, 'default')", { fallback: "ok" })).toBe("ok");
    expect(evaluate("coalesce(missing, null, 'last')", {})).toBe("last");
  });

  it("isNull, isNotNull", () => {
    expect(evaluate("isNull(x)", { x: null })).toBe(true);
    expect(evaluate("isNull(x)", {})).toBe(true);
    expect(evaluate("isNotNull(x)", { x: 0 })).toBe(true);
  });

  it("dateDiff en jours", () => {
    expect(evaluate("dateDiff('d', a, b)", { a: "2024-01-01", b: "2024-01-11" })).toBe(10);
    expect(evaluate("dateDiff('w', a, b)", { a: "2024-01-01", b: "2024-01-15" })).toBe(2);
  });

  it("num() coerce robustement", () => {
    expect(evaluate("num('42.5')", {})).toBe(42.5);
    expect(evaluate("num('abc')", {})).toBeNull();
    expect(evaluate("num(true)", {})).toBe(1);
  });

  it("rejette une fonction inconnue", () => {
    expect(() => evaluate("eval('hack')", {})).toThrow(/fonction inconnue/);
  });
});

describe("compileExpr — sécurité", () => {
  it("rejette un caractère inattendu", () => {
    expect(() => compileExpr("a @ b")).toThrow(ExprError);
  });

  it("rejette une chaîne non terminée", () => {
    expect(() => compileExpr('"unterminated')).toThrow(/non terminée/);
  });

  it("rejette des tokens en trop", () => {
    expect(() => compileExpr("1 + 2 3")).toThrow(/tokens en trop/);
  });

  it("rejette une parenthèse non fermée", () => {
    expect(() => compileExpr("(1 + 2")).toThrow();
  });

  it("ne permet jamais d'accès au prototype global", () => {
    // Aucun moyen de référencer "this", "global", "process" — ce sont juste
    // des identifiers résolus dans la row, qui retournent undefined.
    expect(evaluate("constructor", {})).toBeUndefined();
    expect(evaluate("__proto__", {})).toBeUndefined();
  });
});
