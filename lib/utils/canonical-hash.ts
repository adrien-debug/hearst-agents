/**
 * Hash canonique stable d'une valeur arbitraire pour comparaison structurelle.
 *
 * Utilisé par la loop detection de l'AI pipeline (et tout autre besoin de
 * "même contenu sémantique" → "même hash"). Avant : `JSON.stringify(args)`
 * direct, fragile :
 *   - ordre des clés objet non garanti d'un appel à l'autre
 *   - floats (0.1 + 0.2 ≠ 0.3) → fausses différences
 *   - undefined dans tableaux sérialisé en null → bruit
 *
 * Approche :
 *   1. Sérialise l'input avec clés objet triées récursivement (canonical
 *      JSON RFC 8785 simplifié — pas de full JCS, on n'en a pas besoin).
 *   2. Hash SHA-256 → 64 hex chars stable cross-Node-version.
 *
 * Déterministe. Pure function. Pas d'IO.
 */

import { createHash } from "node:crypto";

/**
 * Sérialise une valeur en JSON canonique : clés objet triées en lexico,
 * arrays préservés (l'ordre EST sémantique), primitives JSON-safe.
 *
 * Limites volontaires :
 *   - undefined → null (matche JSON.stringify natif sur arrays).
 *   - Symbol / function / BigInt → throw (caller doit normaliser avant).
 *   - Cycles → throw (RangeError remontée par récursion).
 */
export function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "number") return Number.isFinite(value) ? String(value) : "null";
  if (t === "boolean") return value ? "true" : "false";
  if (t === "undefined") return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonicalStringify: unsupported type "${t}"`);
}

/**
 * Hash SHA-256 d'une valeur, sortie en hex.
 * Deux valeurs structurellement égales (mêmes clés, mêmes valeurs, ordre des
 * clés objet ignoré) ont toujours le même hash.
 */
export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}
