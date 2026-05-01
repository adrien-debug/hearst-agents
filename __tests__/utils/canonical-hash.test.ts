import { describe, it, expect } from "vitest";
import { canonicalStringify, canonicalHash } from "@/lib/utils/canonical-hash";

describe("canonicalStringify", () => {
  it("trie les clés objet en lexico (ordre d'insertion ignoré)", () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe(canonicalStringify({ a: 2, b: 1 }));
  });

  it("préserve l'ordre des arrays (sémantique)", () => {
    expect(canonicalStringify([1, 2, 3])).not.toBe(canonicalStringify([3, 2, 1]));
  });

  it("récursion : tri stable sur objets imbriqués", () => {
    const a = { outer: { z: 1, a: 2 }, list: [{ b: 3, a: 4 }] };
    const b = { list: [{ a: 4, b: 3 }], outer: { a: 2, z: 1 } };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it("undefined → null (matche JSON.stringify natif sur arrays)", () => {
    expect(canonicalStringify(undefined)).toBe("null");
    expect(canonicalStringify([1, undefined, 3])).toBe("[1,null,3]");
  });

  it("primitives JSON-safe", () => {
    expect(canonicalStringify(null)).toBe("null");
    expect(canonicalStringify("hello")).toBe('"hello"');
    expect(canonicalStringify(42)).toBe("42");
    expect(canonicalStringify(true)).toBe("true");
    expect(canonicalStringify(false)).toBe("false");
  });

  it("NaN / Infinity → null", () => {
    expect(canonicalStringify(NaN)).toBe("null");
    expect(canonicalStringify(Infinity)).toBe("null");
    expect(canonicalStringify(-Infinity)).toBe("null");
  });

  it("throw sur types non sérialisables", () => {
    expect(() => canonicalStringify(Symbol("x"))).toThrow(TypeError);
    expect(() => canonicalStringify(() => 1)).toThrow(TypeError);
    expect(() => canonicalStringify(BigInt(1))).toThrow(TypeError);
  });

  it("escape correct des guillemets dans les clés", () => {
    expect(canonicalStringify({ 'a"b': 1 })).toBe('{"a\\"b":1}');
  });
});

describe("canonicalHash", () => {
  it("même contenu sémantique → même hash (ordre clés ignoré)", () => {
    const h1 = canonicalHash({ tool: "search", q: "test", limit: 10 });
    const h2 = canonicalHash({ limit: 10, q: "test", tool: "search" });
    expect(h1).toBe(h2);
  });

  it("contenu différent → hash différent", () => {
    const h1 = canonicalHash({ q: "test" });
    const h2 = canonicalHash({ q: "test2" });
    expect(h1).not.toBe(h2);
  });

  it("sortie stable cross-process : 64 hex chars (sha256)", () => {
    const hash = canonicalHash({ a: 1 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("résiste aux différences d'ordre dans args complexes (cas loop detection)", () => {
    const args1 = {
      input: "rappelle-moi tous les jours",
      schedule: "0 9 * * *",
      _preview: true,
      label: "daily",
    };
    const args2 = {
      _preview: true,
      label: "daily",
      schedule: "0 9 * * *",
      input: "rappelle-moi tous les jours",
    };
    expect(canonicalHash(args1)).toBe(canonicalHash(args2));
  });
});
