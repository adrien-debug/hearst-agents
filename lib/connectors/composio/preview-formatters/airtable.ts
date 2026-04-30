/**
 * Airtable preview formatters.
 */

import { footer, header, line, preview } from "./shared";

export function formatAirtableCreateRecord(args: Record<string, unknown>): string {
  const baseId = String(args.base_id ?? args.baseId ?? args.base ?? "—");
  const tableId = String(args.table_id ?? args.tableId ?? args.table ?? "—");
  const fields = (args.fields ?? args.record_fields ?? {}) as Record<string, unknown>;
  const fieldKeys = Object.keys(fields);

  const sample = fieldKeys
    .slice(0, 6)
    .map((k) => `${k}=${preview(String(fields[k]), 60)}`)
    .join(", ");

  const lines = [
    line("Base", baseId),
    line("Table", tableId),
    fieldKeys.length > 0
      ? line("Champs", `${fieldKeys.length} champ(s) — ${sample}`)
      : line("Champs", "(aucun)"),
  ];

  return [header("AIRTABLE", "Créer un record"), ...lines, footer()].join("\n");
}
