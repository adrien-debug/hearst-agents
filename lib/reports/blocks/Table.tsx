"use client";

/**
 * Table dense — header sticky, mono pour les colonnes numériques, lignes
 * alternées invisibles (juste hover). Pas de pagination en V1 — on cap le
 * nombre de rows à `limit` (défaut 50).
 */

import { useState, useMemo } from "react";
import { fmtNumber, fmtCurrency } from "./format";

type Row = Record<string, unknown>;

export interface TableProps {
  data: ReadonlyArray<Row>;
  /** Colonnes à afficher dans cet ordre. Défaut : toutes les clés du 1er row. */
  columns?: ReadonlyArray<string>;
  /** Override du label affiché par colonne. */
  labels?: Readonly<Record<string, string>>;
  /** Hint de format par colonne. */
  formats?: Readonly<Record<string, "number" | "currency" | "date" | "text">>;
  /** Devise pour les colonnes en currency. */
  currency?: string;
  /** Limite hard côté UI. */
  limit?: number;
}

export function Table({
  data,
  columns,
  labels,
  formats,
  currency = "EUR",
  limit = 50,
}: TableProps) {
  const cols = useMemo(
    () => columns ?? (data.length > 0 ? Object.keys(data[0]) : []),
    [columns, data],
  );

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return data.slice(0, limit);
    return [...data]
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const an = typeof av === "number" ? av : Number(av);
        const bn = typeof bv === "number" ? bv : Number(bv);
        if (Number.isFinite(an) && Number.isFinite(bn)) {
          return sortDir === "asc" ? an - bn : bn - an;
        }
        const sa = String(av ?? "");
        const sb = String(bv ?? "");
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      })
      .slice(0, limit);
  }, [data, sortKey, sortDir, limit]);

  if (cols.length === 0 || data.length === 0) {
    return (
      <div
        className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
        style={{ padding: "var(--space-6)" }}
      >
        Aucune donnée
      </div>
    );
  }

  const handleSort = (col: string) => {
    if (sortKey === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
  };

  return (
    <div
      role="table"
      aria-label="Données du report"
      className="w-full overflow-auto"
      style={{ maxHeight: "var(--space-32)" }}
    >
      <table
        className="w-full"
        style={{
          borderCollapse: "collapse",
          fontSize: "inherit",
        }}
      >
        <thead
          style={{
            position: "sticky",
            top: 0,
            background: "var(--bg-soft)",
            zIndex: 1,
          }}
        >
          <tr>
            {cols.map((col) => {
              const isSorted = sortKey === col;
              const indicator = isSorted ? (sortDir === "asc" ? "▲" : "▼") : "";
              return (
                <th
                  key={col}
                  scope="col"
                  onClick={() => handleSort(col)}
                  className="t-9 font-mono uppercase text-[var(--text-muted)] cursor-pointer select-none text-left"
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    borderBottom: "1px solid var(--surface-2)",
                    letterSpacing: "0.15em",
                  }}
                >
                  {labels?.[col] ?? col} {indicator && <span style={{ color: "var(--cykan)" }}>{indicator}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className="hover:bg-[var(--surface-1)] transition-colors"
              style={{ transitionDuration: "120ms" }}
            >
              {cols.map((col) => {
                const v = row[col];
                const fmt = formats?.[col] ?? inferFormat(v);
                const cellStr = formatCell(v, fmt, currency);
                const isNum = fmt === "number" || fmt === "currency";
                return (
                  <td
                    key={col}
                    className={`t-11 ${isNum ? "font-mono tabular-nums text-right" : "text-[var(--text-soft)]"}`}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderBottom: "1px solid var(--line)",
                      color: isNum ? "var(--text-soft)" : undefined,
                    }}
                  >
                    {cellStr}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > limit && (
        <div
          className="t-9 font-mono uppercase tracking-[0.2em] text-[var(--text-faint)]"
          style={{ padding: "var(--space-3) var(--space-3)" }}
        >
          {limit} / {data.length} rows
        </div>
      )}
    </div>
  );
}

function inferFormat(v: unknown): "number" | "currency" | "date" | "text" {
  if (typeof v === "number") return "number";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
  return "text";
}

function formatCell(
  v: unknown,
  fmt: "number" | "currency" | "date" | "text",
  currency: string,
): string {
  if (v === null || v === undefined) return "—";
  if (fmt === "number") return fmtNumber(v);
  if (fmt === "currency") return fmtCurrency(v, currency, { compact: true });
  if (fmt === "date" && typeof v === "string") {
    // Affichage court FR : "12 avr." plutôt que "2026-04-12T00:00:00Z"
    try {
      return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
    } catch {
      return v;
    }
  }
  return String(v);
}
