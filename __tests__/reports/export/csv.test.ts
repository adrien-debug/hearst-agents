/**
 * Tests export CSV — vérifie l'échappement RFC 4180 + les sections par bloc.
 */

import { describe, it, expect } from "vitest";
import { exportCsv, _renderPayloadCsv } from "@/lib/reports/export/csv";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

const meta: ReportMeta = {
  title: "Csv Test",
  summary: "",
  domain: "founder",
  persona: "founder",
  cadence: "ad-hoc",
  confidentiality: "internal",
};

const payload: RenderPayload = {
  __reportPayload: true,
  specId: "spec-csv",
  version: 1,
  generatedAt: 1_700_000_000_000,
  blocks: [
    {
      id: "kpi_arr",
      type: "kpi",
      label: "ARR",
      layout: { col: 1, row: 0 },
      data: { value: 100, delta: 5 },
      props: {},
    },
    {
      id: "table_top",
      type: "table",
      label: "Top",
      layout: { col: 4, row: 1 },
      data: [
        { name: "ACME, Inc.", value: 50, note: 'Quote: "stable"' },
        { name: "Globex", value: 30, note: "Multi\nline" },
      ],
      props: {},
    },
  ],
  scalars: {},
};

describe("exportCsv", () => {
  it("buffer CSV non-vide, content-type text/csv, BOM en tête", async () => {
    const result = await exportCsv({ payload, meta, narration: null });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.contentType.startsWith("text/csv")).toBe(true);
    expect(result.fileName.endsWith(".csv")).toBe(true);
    // BOM UTF-8 = 0xEF 0xBB 0xBF
    expect(result.buffer[0]).toBe(0xef);
    expect(result.buffer[1]).toBe(0xbb);
    expect(result.buffer[2]).toBe(0xbf);
  });

  it("inclut un header par bloc + escape RFC 4180", () => {
    const csv = _renderPayloadCsv(payload);
    expect(csv).toContain("# block:kpi_arr");
    expect(csv).toContain("# block:table_top");
    // virgule dans la valeur → cellule entre guillemets
    expect(csv).toContain('"ACME, Inc."');
    // " échappés en ""
    expect(csv).toContain('"Quote: ""stable"""');
    // newline dans la cellule → cellule quotée
    expect(csv).toMatch(/"Multi\nline"/);
  });
});
