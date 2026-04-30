/**
 * Charts minimalistes éditoriaux — sparkline, bar, funnel, waterfall,
 * bullet, cohort. Tracé direct via primitives pdfkit (line / rect / fill).
 *
 * Style : lignes fines accent or, ink dark pour les valeurs, pas d'axes
 * surchargés. Inspiré de l'esthétique éditoriale (FT charts, NYT print).
 */

import { COLORS, FONT_SIZES, SPACE, RULES, PAGE } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

export interface ChartBox {
  x: number;
  y: number;
  width: number;
  height: number;
  embedded: boolean;
}

// ── Sparkline ─────────────────────────────────────────────
export function renderSparkline(
  doc: PDFKit.PDFDocument,
  values: number[],
  box: ChartBox,
): void {
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = box.width / (values.length - 1);

  doc.save();
  doc.lineWidth(RULES.regular).strokeColor(COLORS.accent);
  values.forEach((v, i) => {
    const px = box.x + i * stepX;
    const py = box.y + box.height - ((v - min) / range) * box.height;
    if (i === 0) doc.moveTo(px, py);
    else doc.lineTo(px, py);
  });
  doc.stroke();
  doc.restore();
}

// ── Bar / Funnel / Pareto ────────────────────────────────
export interface BarChartInput {
  rows: Array<Record<string, unknown>>;
  /** Champ catégorie (label). */
  labelField?: string;
  /** Champ valeur. */
  valueField?: string;
  embedded: boolean;
}

export function renderBarChart(
  doc: PDFKit.PDFDocument,
  input: BarChartInput,
): void {
  const labelField = input.labelField ?? Object.keys(input.rows[0] ?? {})[0];
  const valueField =
    input.valueField ??
    Object.keys(input.rows[0] ?? {}).find(
      (k) => typeof input.rows[0]?.[k] === "number",
    ) ??
    "";

  if (!labelField || !valueField || input.rows.length === 0) return;

  const visible = input.rows.slice(0, 12);
  const values = visible.map((r) => Number(r[valueField] ?? 0));
  const max = Math.max(...values, 1);

  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const labelWidth = 140;
  const valueWidth = 70;
  const barAreaWidth = width - labelWidth - valueWidth - SPACE.s4;
  const rowHeight = 22;

  setFont(doc, "sans", input.embedded);
  doc.fontSize(FONT_SIZES.small).fillColor(COLORS.ink);

  visible.forEach((row, i) => {
    const y = doc.y + i * rowHeight;
    const value = values[i];
    const barW = (value / max) * barAreaWidth;

    // Label gauche
    setFont(doc, "sans", input.embedded);
    doc.fillColor(COLORS.ink).text(
      String(row[labelField] ?? "—"),
      x,
      y + 4,
      { width: labelWidth - SPACE.s2, lineBreak: false, ellipsis: true },
    );

    // Bar
    const barX = x + labelWidth;
    const barY = y + 6;
    doc.save();
    // Bar background (rule baseline)
    doc
      .rect(barX, barY + 4, barAreaWidth, 0.5)
      .fill(COLORS.rule);
    // Bar fill
    doc.rect(barX, barY, barW, 8).fill(COLORS.accent);
    doc.restore();

    // Valeur droite
    setFont(doc, "sansSemiBold", input.embedded);
    doc
      .fillColor(COLORS.ink)
      .text(
        value.toLocaleString("fr-FR", { maximumFractionDigits: 1 }),
        x + labelWidth + barAreaWidth + SPACE.s2,
        y + 4,
        { width: valueWidth, align: "right", lineBreak: false },
      );
  });

  doc.y = doc.y + visible.length * rowHeight + SPACE.s2;
}

// ── Waterfall ────────────────────────────────────────────
export interface WaterfallInput {
  data: Array<{ label: string; value: number; type: string }>;
  currency?: string;
  embedded: boolean;
}

export function renderWaterfall(
  doc: PDFKit.PDFDocument,
  input: WaterfallInput,
): void {
  if (input.data.length === 0) return;

  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const labelW = 180;
  const typeW = 80;
  const valueW = width - labelW - typeW;
  const rowH = 18;
  const cur = input.currency ?? "EUR";

  const headerY = doc.y;
  setFont(doc, "sansSemiBold", input.embedded);
  doc.fontSize(FONT_SIZES.eyebrow).fillColor(COLORS.muted);
  doc.text("ÉTAPE", x, headerY, {
    width: labelW,
    characterSpacing: 1.0,
    lineBreak: false,
  });
  doc.text("TYPE", x + labelW, headerY, {
    width: typeW,
    characterSpacing: 1.0,
    lineBreak: false,
  });
  doc.text("MONTANT", x + labelW + typeW, headerY, {
    width: valueW,
    align: "right",
    characterSpacing: 1.0,
    lineBreak: false,
  });
  doc.y = headerY + SPACE.s4;
  doc.save();
  doc
    .lineWidth(RULES.hairline)
    .strokeColor(COLORS.accent)
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .stroke();
  doc.restore();
  doc.y += SPACE.s2;

  for (const it of input.data) {
    const y = doc.y;
    setFont(doc, "sans", input.embedded);
    const typeColor =
      it.type === "positive" || it.type === "increase"
        ? COLORS.positive
        : it.type === "negative" || it.type === "decrease"
          ? COLORS.negative
          : COLORS.muted;
    doc
      .fontSize(FONT_SIZES.small)
      .fillColor(COLORS.ink)
      .text(it.label, x, y, { width: labelW, lineBreak: false, ellipsis: true });
    doc
      .fillColor(typeColor)
      .text(it.type, x + labelW, y, { width: typeW, lineBreak: false });
    doc
      .fillColor(COLORS.ink)
      .text(
        `${it.value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${cur}`,
        x + labelW + typeW,
        y,
        { width: valueW, align: "right", lineBreak: false },
      );
    doc.y = y + rowH;
  }
}

// ── Bullet ───────────────────────────────────────────────
export interface BulletInput {
  items: Array<{ label: string; actual: number; target: number }>;
  embedded: boolean;
}

export function renderBullet(doc: PDFKit.PDFDocument, input: BulletInput): void {
  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const labelW = 160;
  const trackW = width - labelW - 80;
  const rowH = 26;

  setFont(doc, "sans", input.embedded);
  doc.fontSize(FONT_SIZES.small);

  for (const it of input.items) {
    const y = doc.y;
    const ratio = it.target !== 0 ? Math.min(it.actual / it.target, 1.5) : 0;
    const barW = trackW * Math.min(ratio, 1);
    const overflowW = ratio > 1 ? trackW * (ratio - 1) : 0;

    doc
      .fillColor(COLORS.ink)
      .text(it.label, x, y + 4, { width: labelW - SPACE.s2, lineBreak: false, ellipsis: true });

    // Track baseline
    doc.save();
    doc
      .rect(x + labelW, y + 8, trackW, 6)
      .fill(COLORS.rule);
    // Filled bar
    const barColor = ratio >= 1 ? COLORS.positive : ratio >= 0.7 ? COLORS.accent : COLORS.warn;
    doc.rect(x + labelW, y + 8, barW, 6).fill(barColor);
    // Overflow
    if (overflowW > 0) {
      doc.rect(x + labelW + barW, y + 8, overflowW, 6).fill(COLORS.accent);
    }
    // Target marker (vertical line at target = trackW)
    doc
      .lineWidth(1)
      .strokeColor(COLORS.ink)
      .moveTo(x + labelW + trackW, y + 6)
      .lineTo(x + labelW + trackW, y + 16)
      .stroke();
    doc.restore();

    setFont(doc, "sansSemiBold", input.embedded);
    doc
      .fillColor(COLORS.ink)
      .text(`${(ratio * 100).toFixed(0)}%`, x + labelW + trackW + SPACE.s2, y + 4, {
        width: 60,
        align: "right",
        lineBreak: false,
      });
    setFont(doc, "sans", input.embedded);
    doc.y = y + rowH;
  }
}
