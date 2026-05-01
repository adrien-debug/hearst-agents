"use client";

/**
 * Démo ReportSpecEditor — utilise un spec dérivé de founder-cockpit, enrichi
 * d'un block Gantt avec données inline pour la preview.
 *
 * Permet à l'utilisateur de :
 *   1. visualiser la liste des blocks d'un report
 *   2. toggler leur visibilité
 *   3. valider via Apply → JSON pretty-print du spec final affiché en bas
 */

import { useState } from "react";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import { ReportSpecEditor } from "@/app/(user)/components/reports/ReportSpecEditor";
import { buildFounderCockpit } from "@/lib/reports/catalog/founder-cockpit";

const DEMO_SCOPE = {
  tenantId: "demo-tenant",
  workspaceId: "demo-workspace",
  userId: "demo-user",
} as const;

function buildDemoSpec(): ReportSpec {
  // On part du founder-cockpit, on injecte des `previewValue` pour les KPI et
  // on ajoute un block Gantt avec données inline (props.range + props.tasks).
  const base = buildFounderCockpit(DEMO_SCOPE);

  const enrichedBlocks = base.blocks.map((b) => {
    if (b.type === "kpi") {
      // Injecte des valeurs preview pour visualiser dans l'éditeur sans fetch.
      const previewByLabel: Record<string, { value: number; delta?: number }> = {
        MRR: { value: 48_500, delta: 0.082 },
        "Pipeline ouvert": { value: 312_000, delta: -0.041 },
        "Emails en attente": { value: 23 },
        "Commits 7j": { value: 41, delta: 0.18 },
      };
      const preset = previewByLabel[b.label ?? ""] ?? { value: 0 };
      return {
        ...b,
        props: {
          ...b.props,
          previewValue: preset.value,
          previewDelta: preset.delta ?? null,
          previewSparkline: [10, 14, 12, 18, 22, 19, 25],
        },
      };
    }
    if (b.type === "sparkline") {
      return {
        ...b,
        props: {
          ...b.props,
          previewRows: Array.from({ length: 12 }, (_, i) => ({
            n: 4 + Math.round(Math.sin(i / 2) * 3 + i / 3),
          })),
          field: "n",
        },
      };
    }
    if (b.type === "table") {
      return {
        ...b,
        props: {
          ...b.props,
          previewRows: [
            { summary: "Sync produit", start: "2026-05-02T10:00:00Z" },
            { summary: "Comité finance", start: "2026-05-03T14:00:00Z" },
            { summary: "Demo client A", start: "2026-05-05T09:30:00Z" },
          ],
        },
      };
    }
    return b;
  });

  // Ajoute un block Gantt avec données inline pour démontrer le nouveau bloc.
  const ganttBlock = {
    id: "gantt_roadmap",
    type: "gantt" as const,
    label: "Roadmap Q2",
    dataRef: "calendar_week",
    layout: { col: 4 as const, row: 2 },
    props: {
      range: { start: "2026-05-01", end: "2026-06-30" },
      tasks: [
        {
          id: "spec",
          label: "Spec technique",
          start: "2026-05-01",
          end: "2026-05-10",
          progress: 1,
        },
        {
          id: "build",
          label: "Implémentation core",
          start: "2026-05-11",
          end: "2026-06-05",
          progress: 0.65,
          dependsOn: ["spec"],
        },
        {
          id: "test",
          label: "Tests & QA",
          start: "2026-06-01",
          end: "2026-06-20",
          progress: 0.2,
          dependsOn: ["build"],
        },
        {
          id: "release",
          label: "Release v1",
          start: "2026-06-20",
          end: "2026-06-30",
          progress: 0,
          dependsOn: ["test"],
        },
      ],
    },
  };

  return {
    ...base,
    blocks: [...enrichedBlocks, ganttBlock],
  };
}

export default function ReportEditorDemoPage() {
  const [demoSpec] = useState<ReportSpec>(() => buildDemoSpec());
  const [appliedSpec, setAppliedSpec] = useState<ReportSpec | null>(null);
  const [showJson, setShowJson] = useState(false);

  return (
    <div
      className="flex-1 flex flex-col min-h-0 overflow-y-auto"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="flex flex-col"
        style={{
          padding: "var(--space-8)",
          gap: "var(--space-6)",
          maxWidth: "var(--space-32)",
          width: "100%",
          margin: "0 auto",
        }}
      >
        <header className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <h1 className="t-15 text-[var(--text)]">Report Spec Editor</h1>
          <p className="t-13 text-[var(--text-muted)]">
            Aperçu visuel d&apos;un ReportSpec — toggler la visibilité des blocks
            puis Apply pour figer la sélection finale.
          </p>
        </header>

        <ReportSpecEditor spec={demoSpec} onChange={setAppliedSpec} />

        <section
          className="flex flex-col"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            border: "1px solid var(--card-flat-border)",
            background: "var(--card-flat-bg)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <div className="flex items-center justify-between">
            <span
              className="t-9 font-mono uppercase text-[var(--text-muted)]"
                         >
              Spec final {appliedSpec ? "(applied)" : "(en attente)"}
            </span>
            <button
              type="button"
              onClick={() => setShowJson((v) => !v)}
              className="t-9 font-mono uppercase text-[var(--text-muted)] hover:text-[var(--text-soft)] transition-colors"
              style={{
                                padding: "var(--space-1) var(--space-3)",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius-xs)",
                background: "transparent",
              }}
            >
              {showJson ? "Hide JSON" : "Show JSON"}
            </button>
          </div>
          {showJson && (
            <pre
              className="t-9 font-mono text-[var(--text-soft)] overflow-x-auto"
              style={{
                padding: "var(--space-4)",
                background: "var(--surface-1)",
                border: "1px solid var(--surface-2)",
                borderRadius: "var(--radius-xs)",
                lineHeight: 1.5,
              }}
            >
              {JSON.stringify(appliedSpec ?? demoSpec, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
