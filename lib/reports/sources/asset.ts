/**
 * Adapter Asset — pull un asset existant comme dataset (CSV/JSON → Tabular).
 *
 * Cas d'usage : un report qui consomme la sortie d'un autre report (chaining),
 * ou un user qui upload un fichier puis veut l'utiliser comme source.
 *
 * V1 : on lit `assets.content_ref` qui peut contenir soit du contenu inline
 * (créé via `create_artifact`), soit un storage key (R2/S3) pour lequel on
 * appelle le storage backend.
 */

import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { Tabular, Row } from "@/lib/reports/engine/tabular";

export interface FetchAssetInput {
  assetId: string;
  format?: "json" | "csv";
}

export interface FetchAssetResult {
  rows: Tabular;
  ok: boolean;
  error?: string;
}

export async function fetchAsset(input: FetchAssetInput): Promise<FetchAssetResult> {
  const sb = getServerSupabase();
  if (!sb) {
    return { rows: [], ok: false, error: "Supabase non configuré" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb2 = sb as any;
  const { data, error } = await sb2
    .from("assets")
    .select("id, content_ref, kind, provenance")
    .eq("id", input.assetId)
    .maybeSingle();

  if (error || !data) {
    return { rows: [], ok: false, error: `asset ${input.assetId} introuvable` };
  }

  const contentRef: string | null = data.content_ref ?? null;
  if (!contentRef) {
    return { rows: [], ok: false, error: "asset sans contentRef" };
  }

  let raw: string;
  if (looksLikeUrl(contentRef)) {
    try {
      const res = await fetch(contentRef);
      if (!res.ok) return { rows: [], ok: false, error: `HTTP ${res.status} sur asset URL` };
      raw = await res.text();
    } catch (err) {
      return {
        rows: [],
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    raw = contentRef;
  }

  const format = input.format ?? "json";
  try {
    const rows = format === "csv" ? parseCsv(raw) : parseJson(raw);
    return { rows, ok: true };
  } catch (err) {
    return {
      rows: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.slice(0, 8));
}

function parseJson(raw: string): Tabular {
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed.map(normalizeRow);
  if (parsed && typeof parsed === "object") {
    // single row
    return [parsed as Row];
  }
  return [];
}

function normalizeRow(item: unknown): Row {
  if (item === null || item === undefined) return {};
  if (typeof item === "object" && !Array.isArray(item)) return item as Row;
  return { value: item };
}

/**
 * Parser CSV minimal : RFC 4180-friendly, gère les quotes doubles et
 * échappements ("foo""bar" → foo"bar). Pas de support du multi-line dans
 * un champ pour rester simple — assez pour des exports d'apps standard.
 */
function parseCsv(raw: string): Tabular {
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: Row = {};
    for (let j = 0; j < headers.length; j++) {
      const v = cells[j] ?? null;
      row[headers[j]] = coerce(v);
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  cells.push(cur);
  return cells;
}

function coerce(v: string | null): unknown {
  if (v === null) return null;
  if (v === "") return null;
  // bool
  if (v === "true") return true;
  if (v === "false") return false;
  // number (avec point décimal seulement, pas de séparateur de milliers)
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}
