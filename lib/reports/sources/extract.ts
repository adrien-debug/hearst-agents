/**
 * Helpers d'extraction de Tabular depuis des réponses hétérogènes (Composio,
 * Google, HTTP). Convention :
 *
 *   - Si la réponse contient déjà un Array → on l'utilise.
 *   - Sinon on cherche en cascade :  data.items, data.data.items, data.results,
 *     data.data, data (si ressemble à un Tabular), .messages, .events, .files.
 *   - Sinon → []  (pipeline continue avec dataset vide, narration le mentionnera).
 *
 * Retourne TOUJOURS un Array<Record<string, unknown>>. Les éléments scalaires
 * (string/number) sont enveloppés en `{ value: x }`.
 */

import type { Tabular, Row } from "@/lib/reports/engine/tabular";

const COMMON_ARRAY_KEYS = [
  "items",
  "results",
  "rows",
  "records",
  "data",
  "messages",
  "events",
  "files",
  "threads",
  "list",
] as const;

export function extractTabular(payload: unknown, depth = 0): Tabular {
  if (depth > 4) return []; // garde-fou contre une exploration trop profonde

  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeRow(item));
  }

  if (payload === null || payload === undefined) return [];
  if (typeof payload !== "object") {
    // valeur scalaire isolée
    return [{ value: payload as unknown }];
  }

  const obj = payload as Record<string, unknown>;

  // 1. Cherche une clé connue contenant un Array
  for (const key of COMMON_ARRAY_KEYS) {
    const v = obj[key];
    if (Array.isArray(v)) return v.map(normalizeRow);
  }

  // 2. Cherche une clé connue contenant un sous-objet à explorer récursivement
  for (const key of COMMON_ARRAY_KEYS) {
    const v = obj[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = extractTabular(v, depth + 1);
      if (inner.length > 0) return inner;
    }
  }

  // 3. Si l'objet ressemble à une seule row (clés primitives), retourne un singleton
  if (looksLikeRow(obj)) return [obj as Row];

  // 4. Sinon, prend la première value qui est un Array
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) return v.map(normalizeRow);
  }

  return [];
}

function normalizeRow(item: unknown): Row {
  if (item === null || item === undefined) return {};
  if (typeof item === "object" && !Array.isArray(item)) {
    return item as Row;
  }
  return { value: item };
}

function looksLikeRow(obj: Record<string, unknown>): boolean {
  // Heuristique : si toutes les valeurs sont primitives ou null, c'est une row.
  // Sinon (au moins un sous-objet/sub-array), c'est plutôt une enveloppe.
  const values = Object.values(obj);
  if (values.length === 0) return false;
  return values.every(
    (v) =>
      v === null ||
      v === undefined ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean",
  );
}

/**
 * Applique le mapping optionnel d'un SourceRef (`{ from, to }[]`) pour
 * renommer/projeter les champs vers un schéma canonique.
 */
export function applyMapping(
  rows: Tabular,
  mapping: ReadonlyArray<{ from: string; to: string }> | undefined,
): Tabular {
  if (!mapping || mapping.length === 0) return rows;
  return rows.map((row) => {
    const out: Row = { ...row };
    for (const { from, to } of mapping) {
      if (Object.prototype.hasOwnProperty.call(row, from)) {
        out[to] = row[from];
      }
    }
    return out;
  });
}
