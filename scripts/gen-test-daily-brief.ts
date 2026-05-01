/**
 * Smoke test : génère un PDF Daily Brief avec données fictives → /tmp.
 * Usage : npx tsx scripts/gen-test-daily-brief.ts
 */

import { writeFileSync } from "node:fs";
import { renderDailyBriefPdf } from "@/lib/daily-brief/pdf";
import type {
  DailyBriefData,
  DailyBriefNarration,
} from "@/lib/daily-brief/types";

const data: DailyBriefData = {
  emails: [
    {
      id: "m1",
      subject: "Term sheet — 2 points à reclarifier ce matin",
      sender: "Sarah Martin <sarah@sequoia.com>",
      snippet: "Bonjour, voici 2 points sur la term sheet…",
      receivedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
      isRead: false,
    },
    {
      id: "m2",
      subject: "MSA v3 prêt, signature DocuSign ce midi",
      sender: "Marc Dubois <marc@acme.com>",
      snippet: "Salut, MSA v3 envoyé en signature…",
      receivedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      isRead: true,
    },
    {
      id: "m3",
      subject: "Bug staging /api/runs sur les 3 derniers déploiements",
      sender: "Léa <lea@hearst-os.com>",
      snippet: "Salut, je viens de voir un 500…",
      receivedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      isRead: false,
    },
  ],
  slack: [
    {
      id: "s1",
      channel: "#engineering",
      user: "Pierre",
      text: "CI rouge sur main depuis 2h, blocking pour toute mise en prod",
      ts: "1714539600.001",
    },
  ],
  calendar: [
    {
      id: "c1",
      title: "Review Series A avec Sarah",
      startTime: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
      endTime: new Date(new Date().setHours(9, 45, 0, 0)).toISOString(),
      isAllDay: false,
      attendees: ["sarah@sequoia.com", "adrien@hearst-os.com"],
      location: "Zoom",
    },
    {
      id: "c2",
      title: "Signature Acme avec Marc",
      startTime: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
      endTime: new Date(new Date().setHours(12, 0, 0, 0)).toISOString(),
      isAllDay: false,
      attendees: ["marc@acme.com"],
      location: null,
    },
  ],
  github: [
    {
      id: "1",
      number: 241,
      title: "migrate v2 mission scheduler",
      state: "open",
      repo: "hearst-os",
      author: "Pierre",
      url: "https://github.com/hearst/hearst-os/pull/241",
      updatedAt: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    },
    {
      id: "2",
      number: 244,
      title: "fix race condition stream",
      state: "open",
      repo: "hearst-os",
      author: "Léa",
      url: "https://github.com/hearst/hearst-os/pull/244",
      updatedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    },
  ],
  linear: [
    {
      id: "L1",
      identifier: "ENG-118",
      title: "staging /api/runs 500 récurrent",
      state: "In Progress",
      priority: 1,
      assignee: "Léa",
      url: "https://linear.app/x/issue/ENG-118",
      updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    },
  ],
  sources: ["gmail", "slack", "calendar", "github", "linear"],
  generatedAt: Date.now(),
  targetDate: new Date().toISOString().slice(0, 10),
};

const narration: DailyBriefNarration = {
  lead:
    "Matinée à fort enjeu : la term sheet Sequoia se reclarifie en parallèle de la signature Acme. Le staging encore instable côté backend pèse sur la confiance opérationnelle.",
  people:
    "Sarah attend 2 retours précis sur la term sheet avant 9h00 — pas un email-fleuve, deux décisions chiffrées. Marc envoie le DocuSign à midi, MSA v3 déjà validé. Léa pousse #244 prête à merger mais bloque sur ENG-118.",
  decisions:
    "Trancher les deux points term sheet avant le call 9h. Confirmer la fenêtre signature Acme (11h30, pas de glissement). Décider si on bloque le merge de #244 (Léa) sur la résolution ENG-118 ou si on fast-tracke pour soulager le staging.",
  signals:
    "CI rouge sur main signalée par Pierre — blocking pour toute mise en prod. PR #241 sans review depuis 2 jours, sortir Pierre du focus pour 30 min. ENG-118 reste P1 tant qu'on n'a pas trace claire du root cause.",
  costUsd: 0.05,
};

async function main() {
  const pdf = await renderDailyBriefPdf({ data, narration });
  const outPath = "/tmp/test-daily-brief.pdf";
  writeFileSync(outPath, pdf.buffer);
  console.log(`OK ${pdf.size} bytes → ${outPath}`);
  console.log(`File name : ${pdf.fileName}`);
}

void main();
