/**
 * Daily Brief — rendu PDF éditorial 2 pages.
 *
 * Architecture : on réutilise *exactement* les helpers du pipeline report
 * (cover / chrome / section header / prose / table) pour rester aligné avec
 * le langage visuel HEARST OS — Source Serif + accent or, sections numérotées,
 * fond cover dark.
 *
 * Layout :
 *   Page 01 — COVER
 *   Page 02 — MANIFESTE (Lead + 3 sections People / Decisions / Signals)
 *   Page 03 — AGENDA (Table des events du jour)
 *   Page 04 — INBOX & PRs (Tables emails / PRs / issues)
 *
 * Le `lead` injecté dans `renderCover.subtitle` est cap 200 chars pour rester
 * lisible en italic accent or 14pt.
 */

import PDFDocument from "pdfkit";
import { BRAND, FONT_SIZES, PAGE, SPACE, COLORS } from "@/lib/reports/export/pdf-tokens";
import { registerFonts, setFont } from "@/lib/reports/export/pdf-fonts";
import { renderCover } from "@/lib/reports/export/pdf-cover";
import { renderPageChrome, renderSectionHeader } from "@/lib/reports/export/pdf-section";
import { renderProse } from "@/lib/reports/export/pdf-blocks/prose";
import { renderTable } from "@/lib/reports/export/pdf-blocks/table";
import type { DailyBriefData, DailyBriefNarration } from "./types";

interface DailyBriefPdfInput {
  data: DailyBriefData;
  narration: DailyBriefNarration;
  /** Date affichée sur la cover. ISO YYYY-MM-DD ou Date object. */
  date?: Date;
}

interface DailyBriefPdfResult {
  buffer: Buffer<ArrayBufferLike>;
  contentType: string;
  fileName: string;
  size: number;
}

function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function fmtDateFile(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export async function renderDailyBriefPdf(
  input: DailyBriefPdfInput,
): Promise<DailyBriefPdfResult> {
  const date = input.date ?? new Date(input.data.targetDate);
  const totalSignals =
    input.data.emails.length +
    input.data.slack.length +
    input.data.calendar.length +
    input.data.github.length +
    input.data.linear.length;

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: {
      top: PAGE.marginY,
      bottom: PAGE.marginY,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
    autoFirstPage: false,
    info: {
      Title: `Daily Brief — ${fmtDateFile(date)}`,
      Subject: `Hearst OS — Personal CIA Briefing`,
      Producer: "Hearst OS",
      Creator: BRAND.name,
    },
  });

  const bufferPromise = bufferFromDoc(doc);
  const fontResult = registerFonts(doc);
  const embedded = fontResult.embedded;

  // ── Page 01 : COVER ─────────────────────────────────────────
  doc.addPage();
  renderCover(doc, {
    title: "Daily Brief",
    subtitle: clip(input.narration.lead, 200),
    description: `${totalSignals} signaux ingérés cross-app — ${input.data.sources.filter((s) => !s.endsWith(":error") && !s.endsWith(":empty")).join(", ") || "aucune source connectée"}.`,
    confidentiality: "internal",
    generatedAt: input.data.generatedAt,
    persona: "founder",
    cadence: "daily",
    dark: true,
    embedded,
  });

  let pageNumber = 2;

  // ── Page 02 : MANIFESTE (Lead + 3 sections) ────────────────
  doc.addPage();
  renderPageChrome(doc, {
    pageNumber,
    sectionTitle: "Manifeste",
    embedded,
  });
  doc.x = PAGE.marginX;
  doc.y = PAGE.marginY + SPACE.s8;

  renderSectionHeader(doc, {
    eyebrow: "01 — MANIFESTE",
    title: "Daily Brief",
    lead: clip(input.narration.lead, 240),
    embedded,
  });

  // Sous-sections People / Decisions / Signals + Action (optionnel, Migration B)
  const sections: Array<{ title: string; body: string }> = [
    { title: "Personnes", body: input.narration.people },
    { title: "Décisions", body: input.narration.decisions },
    { title: "Signaux", body: input.narration.signals },
  ];
  if (input.narration.action && input.narration.action.trim().length > 0) {
    sections.push({ title: "Action", body: input.narration.action });
  }
  for (const section of sections) {
    doc.y += SPACE.s4;
    setFont(doc, "sansSemiBold", embedded);
    doc
      .fontSize(FONT_SIZES.eyebrow)
      .fillColor(COLORS.accent)
      .text(section.title.toUpperCase(), doc.x, doc.y, {
        characterSpacing: 1.4,
      });
    doc.y += SPACE.s2;
    renderProse(doc, { text: section.body, embedded });
  }

  pageNumber += 1;

  // ── Page 03 : AGENDA ───────────────────────────────────────
  doc.addPage();
  renderPageChrome(doc, {
    pageNumber,
    sectionTitle: "Agenda",
    embedded,
  });
  doc.x = PAGE.marginX;
  doc.y = PAGE.marginY + SPACE.s8;

  renderSectionHeader(doc, {
    eyebrow: "02 — AGENDA",
    title: "Calendrier du jour",
    embedded,
  });

  if (input.data.calendar.length === 0) {
    setFont(doc, "serifItalic", embedded);
    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(COLORS.muted)
      .text("Aucun événement aujourd'hui.", doc.x, doc.y);
  } else {
    const rows = input.data.calendar.map((e) => ({
      Heure: e.isAllDay
        ? "toute la journée"
        : new Date(e.startTime).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Paris",
          }),
      Événement: clip(e.title, 60),
      Participants:
        e.attendees.length > 0
          ? clip(e.attendees.slice(0, 3).join(", "), 50)
          : "—",
    }));
    renderTable(doc, { rows, embedded });
  }

  pageNumber += 1;

  // ── Page 04 : INBOX + PRs/ISSUES ───────────────────────────
  doc.addPage();
  renderPageChrome(doc, {
    pageNumber,
    sectionTitle: "Inbox & Workflow",
    embedded,
  });
  doc.x = PAGE.marginX;
  doc.y = PAGE.marginY + SPACE.s8;

  renderSectionHeader(doc, {
    eyebrow: "03 — INBOX",
    title: "Emails 24h",
    embedded,
  });

  if (input.data.emails.length === 0) {
    setFont(doc, "serifItalic", embedded);
    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(COLORS.muted)
      .text("Aucun email récent (ou Gmail non connecté).", doc.x, doc.y);
  } else {
    const rows = input.data.emails.slice(0, 12).map((m) => ({
      Expéditeur: clip(m.sender, 28),
      Sujet: clip(m.subject, 60),
      Statut: m.isRead ? "lu" : "non lu",
    }));
    renderTable(doc, { rows, embedded });
  }

  // PRs (ajout après la table emails si on a la place)
  if (input.data.github.length > 0) {
    doc.y += SPACE.s8;
    renderSectionHeader(doc, {
      eyebrow: "04 — PRs OUVERTES",
      title: "GitHub",
      embedded,
    });
    const rows = input.data.github.slice(0, 8).map((p) => ({
      Repo: clip(p.repo, 24),
      PR: `#${p.number}`,
      Titre: clip(p.title, 50),
      Auteur: clip(p.author, 18),
    }));
    renderTable(doc, { rows, embedded });
  }

  if (input.data.linear.length > 0) {
    doc.y += SPACE.s8;
    renderSectionHeader(doc, {
      eyebrow: "05 — LINEAR",
      title: "Issues actives",
      embedded,
    });
    const rows = input.data.linear.slice(0, 8).map((i) => ({
      ID: i.identifier,
      Titre: clip(i.title, 50),
      Priorité:
        i.priority === 1
          ? "P1"
          : i.priority === 2
            ? "P2"
            : i.priority === 3
              ? "P3"
              : i.priority === 4
                ? "P4"
                : "—",
      Assignee: i.assignee ? clip(i.assignee, 18) : "—",
    }));
    renderTable(doc, { rows, embedded });
  }

  doc.end();
  const buffer = await bufferPromise;

  return {
    buffer,
    contentType: "application/pdf",
    fileName: `daily-brief-${fmtDateFile(date)}.pdf`,
    size: buffer.length,
  };
}
