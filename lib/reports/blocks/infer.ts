/**
 * Heuristiques d'inférence de champs sur une row.
 * Utilisé par les primitives quand `props.field` n'est pas explicite.
 */

type Row = Record<string, unknown>;

export function inferStringField(row: Row | undefined): string | null {
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string") return k;
  }
  return null;
}

export function inferNumericField(row: Row | undefined): string | null {
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number" && Number.isFinite(v)) return k;
  }
  return null;
}
