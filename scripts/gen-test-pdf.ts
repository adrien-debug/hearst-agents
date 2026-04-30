/**
 * Génère un PDF de test représentatif pour validation visuelle / QA.
 *
 * Usage : npx tsx scripts/gen-test-pdf.ts
 * Output : /tmp/test-report.pdf
 */

import { exportPdf } from "@/lib/reports/export/pdf";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";
import fs from "node:fs";

const meta: ReportMeta = {
  title: "Founder Cockpit",
  summary:
    "Snapshot mensuel des indicateurs clés cross-app : MRR, pipeline ouvert, backlog email, semaine à venir, vélocité commits.",
  domain: "founder",
  persona: "founder",
  cadence: "monthly",
  confidentiality: "internal",
};

const payload: RenderPayload = {
  __reportPayload: true,
  specId: "00000000-0000-4000-8000-100000000001",
  version: 1,
  generatedAt: 1714521600000,
  blocks: [
    {
      id: "kpi_mrr",
      type: "kpi",
      label: "MRR",
      layout: { col: 1, row: 0 },
      data: { value: 124500, delta: 12.4, sparkline: [80, 85, 92, 100, 108, 116, 124] },
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
      id: "kpi_emails",
      type: "kpi",
      label: "Emails en attente",
      layout: { col: 1, row: 0 },
      data: { value: 23, delta: -45.0, sparkline: null },
      props: {},
    },
    {
      id: "kpi_velocity",
      type: "kpi",
      label: "Commits 7j",
      layout: { col: 1, row: 0 },
      data: { value: 47, delta: 8.1, sparkline: null },
      props: {},
    },
    {
      id: "tbl_customers",
      type: "table",
      label: "Top clients par MRR",
      layout: { col: 4, row: 1 },
      data: [
        { client: "Acme Corp", mrr: 18500, trend: 12.4, status: "active" },
        { client: "Globex Inc", mrr: 14200, trend: -2.1, status: "active" },
        { client: "Initech", mrr: 9800, trend: 0, status: "churned" },
        { client: "Hooli", mrr: 7400, trend: 35.2, status: "active" },
        { client: "Pied Piper", mrr: 5600, trend: 8.7, status: "active" },
      ],
      props: {},
    },
    {
      id: "bar_revenue",
      type: "bar",
      label: "Revenus par segment",
      layout: { col: 4, row: 2 },
      data: [
        { segment: "Enterprise", value: 65000 },
        { segment: "Mid-market", value: 38000 },
        { segment: "SMB", value: 21500 },
        { segment: "Startup", value: 7800 },
      ],
      props: { labelField: "segment", valueField: "value" },
    },
    {
      id: "waterfall_pnl",
      type: "waterfall",
      label: "Décomposition MRR M-1 → M",
      layout: { col: 4, row: 3 },
      data: [],
      props: {
        currency: "EUR",
        data: [
          { label: "MRR M-1", value: 110000, type: "neutral" },
          { label: "Nouveaux clients", value: 18000, type: "positive" },
          { label: "Expansion", value: 4500, type: "positive" },
          { label: "Churn", value: -8000, type: "negative" },
          { label: "MRR M", value: 124500, type: "neutral" },
        ],
      },
    },
    {
      id: "bullet_targets",
      type: "bullet",
      label: "Atteinte des objectifs trimestriels",
      layout: { col: 4, row: 4 },
      data: [],
      props: {
        items: [
          { label: "MRR cible", actual: 124500, target: 130000 },
          { label: "Nouveaux logos", actual: 12, target: 10 },
          { label: "NPS", actual: 52, target: 50 },
          { label: "Vélocité commits", actual: 47, target: 60 },
        ],
      },
    },
    {
      id: "cohort_retention",
      type: "cohort_triangle",
      label: "Rétention par cohorte",
      layout: { col: 4, row: 5 },
      data: [],
      props: {
        asPercent: true,
        cohorts: [
          { label: "2024-09", values: [1.0, 0.92, 0.85, 0.81, 0.78, 0.75] },
          { label: "2024-10", values: [1.0, 0.89, 0.83, 0.79, 0.76] },
          { label: "2024-11", values: [1.0, 0.91, 0.84, 0.80] },
          { label: "2024-12", values: [1.0, 0.93, 0.87] },
          { label: "2025-01", values: [1.0, 0.94] },
          { label: "2025-02", values: [1.0] },
        ],
      },
    },
  ],
  scalars: {},
};

async function main(): Promise<void> {
  const result = await exportPdf({
    payload,
    meta,
    narration:
      "Le mois d'avril marque une accélération nette de la croissance. Le MRR franchit la barre symbolique des 120k€ en hausse de 12,4% par rapport au mois précédent — la meilleure performance depuis le passage à l'offre Enterprise en septembre.\n\nDeux signaux méritent attention. Premièrement, la baisse de 3,2% du pipeline ouvert traduit une accélération du cycle de vente plus qu'un essoufflement de la prospection : le ratio deals fermés / deals ouverts atteint 38% ce mois-ci contre 28% en moyenne sur le trimestre. Deuxièmement, la diminution de 45% du backlog email indique que la mise en place du triage IA a porté ses fruits — un gain net de 4 heures hebdomadaires.\n\nLes prochaines semaines doivent confirmer la trajectoire d'expansion sur les comptes Enterprise. Les deux signatures attendues en mai (Acme et Globex) représentent à elles seules 8% du MRR cible Q2.",
    fileName: "founder-cockpit-test",
  });

  fs.writeFileSync("/tmp/test-report.pdf", result.buffer);
  console.log("OK", result.size, "bytes →", "/tmp/test-report.pdf");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
