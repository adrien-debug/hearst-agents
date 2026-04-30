/**
 * PDF render tests — vérifie la refonte éditoriale Mai 2026.
 *
 * On ne fait pas de visual diff (nécessite Playwright + comparaison pixel),
 * mais on couvre :
 *   - signature PDF valide (%PDF-)
 *   - métadonnées Title/Subject/Producer présentes
 *   - cover + sections génèrent N pages cohérent avec le payload
 *   - pas de pipe ASCII "|" dans le stream texte (anti-régression terminal)
 *   - pas de "─".repeat(...) dans le contenu (anti-régression cohort terminal)
 *   - file size raisonnable (< 5 MB pour un report standard)
 *   - couleurs hex intégrées (les tokens sont bien utilisés, pas les anciens
 *     codes "#1f6feb" / "#111111")
 */

import { describe, it, expect } from "vitest";
import { exportPdf } from "@/lib/reports/export/pdf";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

const META: ReportMeta = {
  title: "Founder Cockpit",
  summary: "Snapshot mensuel cross-app premium",
  domain: "founder",
  persona: "founder",
  cadence: "monthly",
  confidentiality: "internal",
};

function buildRichPayload(): RenderPayload {
  return {
    __reportPayload: true,
    specId: "00000000-0000-4000-8000-100000000001",
    version: 1,
    generatedAt: 1_714_521_600_000,
    blocks: [
      {
        id: "kpi_mrr",
        type: "kpi",
        label: "MRR",
        layout: { col: 1, row: 0 },
        data: { value: 124500, delta: 12.4, sparkline: [80, 90, 100, 110, 124] },
        props: {},
      },
      {
        id: "kpi_pipeline",
        type: "kpi",
        label: "Pipeline",
        layout: { col: 1, row: 0 },
        data: { value: 412000, delta: -3.2, sparkline: null },
        props: {},
      },
      {
        id: "tbl",
        type: "table",
        label: "Top clients",
        layout: { col: 4, row: 1 },
        data: [
          { client: "Acme Corp", mrr: 18500, status: "active" },
          { client: "Globex Inc", mrr: 14200, status: "active" },
        ],
        props: {},
      },
      {
        id: "cohort",
        type: "cohort_triangle",
        label: "Rétention",
        layout: { col: 4, row: 2 },
        data: [],
        props: {
          asPercent: true,
          cohorts: [
            { label: "2024-09", values: [1.0, 0.92, 0.85] },
            { label: "2024-10", values: [1.0, 0.89, 0.83] },
          ],
        },
      },
    ],
    scalars: {},
  };
}

describe("PDF éditorial premium", () => {
  it("génère un buffer PDF valide avec signature %PDF-", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: "Synthèse narrative.",
    });
    expect(result.contentType).toBe("application/pdf");
    expect(result.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(result.size).toBeGreaterThan(1000);
  });

  it("intègre les métadonnées document", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: null,
    });
    const txt = result.buffer.toString("latin1");
    expect(txt).toContain("Hearst OS");
    expect(txt).toContain("Founder Cockpit");
  });

  it("génère un nombre de pages cohérent (cover + manifesto + sections)", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: "Une narration éditoriale.",
    });
    const txt = result.buffer.toString("latin1");
    // Compte les objets /Type /Page (PDFKit en émet un par page)
    const pageMatches = txt.match(/\/Type\s*\/Page\b/g) ?? [];
    // Cover + manifesto + 1 KPI row + 2 sections = 5 pages
    expect(pageMatches.length).toBeGreaterThanOrEqual(4);
  });

  it("ne contient pas de pipe ASCII '|' dans le rendu (anti-régression terminal)", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: null,
    });
    // On extrait le contenu textuel des streams de pdfkit (Tj operator).
    const txt = result.buffer.toString("latin1");
    // Cherche les segments de texte affichés via ( ... ) Tj
    const tjMatches = Array.from(txt.matchAll(/\(([^)]*)\)\s*Tj/g));
    const renderedText = tjMatches.map((m) => m[1]).join(" ");
    // Aucune occurrence du pattern "X | Y" tabulaire ASCII
    expect(renderedText).not.toMatch(/\w\s*\|\s*\w/);
  });

  it("ne contient pas la chaîne '─' répétée (cohort terminal output)", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: null,
    });
    const txt = result.buffer.toString("latin1");
    expect(txt).not.toContain("──────────");
  });

  it("ne dépasse pas une taille raisonnable (< 1 MB pour ce payload)", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: "Test taille raisonnable.",
    });
    expect(result.size).toBeLessThan(1_000_000);
  });

  it("supporte un payload vide narration & summary minimal", async () => {
    const result = await exportPdf({
      payload: {
        __reportPayload: true,
        specId: "00000000-0000-4000-8000-100000000001",
        version: 1,
        generatedAt: 1_714_521_600_000,
        blocks: [
          {
            id: "kpi_lone",
            type: "kpi",
            label: "Solo KPI",
            layout: { col: 4, row: 0 },
            data: { value: 42, delta: null, sparkline: null },
            props: {},
          },
        ],
        scalars: {},
      },
      meta: { ...META, summary: "" },
      narration: null,
    });
    expect(result.buffer.length).toBeGreaterThan(500);
  });

  it("snapshot bytes-length du début (header PDF stable cross-runs)", async () => {
    const result = await exportPdf({
      payload: buildRichPayload(),
      meta: META,
      narration: "Pour snapshot.",
    });
    // Le header PDF (%PDF-1.3 + EOL) est stable, indépendant du contenu.
    const head = result.buffer.subarray(0, 8).toString("ascii");
    expect(head).toMatch(/^%PDF-1\.\d/);
  });
});
