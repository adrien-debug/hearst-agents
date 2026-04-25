/**
 * PDF Artifact Generator — produces real .pdf files using PDFKit.
 *
 * Supports structured text with title, headings (##), bullet points, and body.
 * Files are saved through the existing file-storage pipeline.
 */

import PDFDocument from "pdfkit";
import path from "path";
import { saveAssetFile } from "./file-storage";
import type { AssetFileInfo } from "./types";

// PDFKit looks for font AFM files relative to its own install.
// Resolved lazily to avoid Turbopack treating require.resolve as a numeric chunk ID at import time.
function getFontDir(): string {
  try {
    const resolved = require.resolve("pdfkit/package.json");
    if (typeof resolved === "string") {
      return path.join(path.dirname(resolved), "js", "data");
    }
  } catch {
    // ignore — fonts will fall back to built-in
  }
  return path.join(process.cwd(), "node_modules", "pdfkit", "js", "data");
}

interface GeneratePdfInput {
  tenantId: string;
  runId: string;
  assetId: string;
  title: string;
  content: string;
}

export async function generatePdfArtifact(input: GeneratePdfInput): Promise<AssetFileInfo> {
  const safeName = input.title.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim() || "report";
  const fileName = `${safeName}.pdf`;

  const buffer = await renderPdf(input.title, input.content);

  return saveAssetFile({
    tenantId: input.tenantId,
    runId: input.runId,
    assetId: input.assetId,
    fileName,
    mimeType: "application/pdf",
    content: buffer,
  });
}

async function renderPdf(title: string, content: string): Promise<Buffer> {
  const FONT_DIR = getFontDir();
  return new Promise((resolve, reject) => {
    // Patch standard font lookup path for standalone / non-standard CWD
    const origResolve = (PDFDocument as unknown as Record<string, unknown>)._fontpath;
    if (!origResolve) {
      (PDFDocument as unknown as Record<string, unknown>)._fontpath = FONT_DIR;
    }

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: { Title: title, Creator: "HEARST OS" },
    });

    // Register standard fonts with absolute paths as fallback
    try {
      doc.registerFont("Helvetica", path.join(FONT_DIR, "Helvetica.afm"));
      doc.registerFont("Helvetica-Bold", path.join(FONT_DIR, "Helvetica-Bold.afm"));
    } catch {
      // Already registered or built-in — continue
    }

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Title
    doc.fontSize(20).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(0.5);

    // Date line
    const dateStr = new Date().toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.fontSize(9).font("Helvetica").fillColor("#888888").text(`Généré le ${dateStr}`, { align: "center" });
    doc.fillColor("#000000");
    doc.moveDown(1.5);

    // Render content line by line with basic markdown awareness
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        doc.moveDown(0.4);
        continue;
      }

      // H1 — # Heading
      if (/^# /.test(trimmed)) {
        doc.moveDown(0.6);
        doc.fontSize(16).font("Helvetica-Bold").text(trimmed.replace(/^# /, ""));
        doc.moveDown(0.3);
        continue;
      }

      // H2 — ## Heading
      if (/^## /.test(trimmed)) {
        doc.moveDown(0.5);
        doc.fontSize(14).font("Helvetica-Bold").text(trimmed.replace(/^## /, ""));
        doc.moveDown(0.2);
        continue;
      }

      // H3 — ### Heading
      if (/^### /.test(trimmed)) {
        doc.moveDown(0.4);
        doc.fontSize(12).font("Helvetica-Bold").text(trimmed.replace(/^### /, ""));
        doc.moveDown(0.2);
        continue;
      }

      // Bullet points
      if (/^[-*] /.test(trimmed)) {
        doc.fontSize(10).font("Helvetica").text(`  •  ${trimmed.replace(/^[-*] /, "")}`, {
          indent: 10,
        });
        continue;
      }

      // Numbered list
      if (/^\d+\.\s/.test(trimmed)) {
        doc.fontSize(10).font("Helvetica").text(`  ${trimmed}`, { indent: 10 });
        continue;
      }

      // Bold text **...**
      if (/\*\*/.test(trimmed)) {
        const plain = trimmed.replace(/\*\*/g, "");
        doc.fontSize(10).font("Helvetica-Bold").text(plain);
        doc.font("Helvetica");
        continue;
      }

      // Regular paragraph
      doc.fontSize(10).font("Helvetica").text(trimmed, { lineGap: 2 });
    }

    // Footer
    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#aaaaaa")
      .text("— HEARST OS — Rapport généré automatiquement", { align: "center" });

    doc.end();
  });
}
