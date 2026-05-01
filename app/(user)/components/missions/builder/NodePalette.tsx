"use client";

/**
 * NodePalette — palette de nodes droppables dans le canvas.
 * Click sur un type ajoute un node au centre du canvas (handler côté parent).
 */

import type { WorkflowNodeKind } from "@/lib/workflows/types";

interface PaletteEntry {
  kind: WorkflowNodeKind;
  label: string;
  defaultConfig?: Record<string, unknown>;
}

interface PaletteSection {
  title: string;
  entries: PaletteEntry[];
}

const SECTIONS: PaletteSection[] = [
  {
    title: "Triggers",
    entries: [
      {
        kind: "trigger",
        label: "Manuel",
        defaultConfig: { mode: "manual" },
      },
      {
        kind: "trigger",
        label: "Cron",
        defaultConfig: { mode: "cron", cron: "0 9 * * *" },
      },
      {
        kind: "trigger",
        label: "Webhook",
        defaultConfig: { mode: "webhook" },
      },
    ],
  },
  {
    title: "Actions",
    entries: [
      {
        kind: "tool_call",
        label: "Email — envoyer",
        defaultConfig: { tool: "gmail_send", args: { to: "", content: "" } },
      },
      {
        kind: "tool_call",
        label: "Slack — message",
        defaultConfig: {
          tool: "slack_send_message",
          args: { channel: "", content: "" },
        },
      },
      {
        kind: "tool_call",
        label: "Calendar — créer event",
        defaultConfig: {
          tool: "calendar_create_event",
          args: { title: "", start: "", end: "" },
        },
      },
      {
        kind: "tool_call",
        label: "Drive — créer doc",
        defaultConfig: {
          tool: "drive_create_doc",
          args: { title: "", content: "" },
        },
      },
      {
        kind: "tool_call",
        label: "Web — recherche",
        defaultConfig: { tool: "search_web", args: { query: "" } },
      },
    ],
  },
  {
    title: "Logic",
    entries: [
      {
        kind: "condition",
        label: "Condition",
        defaultConfig: { expression: "" },
      },
      {
        kind: "transform",
        label: "Transform",
        defaultConfig: { expression: "" },
      },
    ],
  },
  {
    title: "Approvals",
    entries: [
      {
        kind: "approval",
        label: "Validation humaine",
        defaultConfig: { preview: "Confirmer cette action ?" },
      },
    ],
  },
  {
    title: "Outputs",
    entries: [
      {
        kind: "output",
        label: "Asset final",
        defaultConfig: { payload: {} },
      },
    ],
  },
];

interface NodePaletteProps {
  onAdd: (entry: PaletteEntry) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{
        gap: "var(--space-6)",
        padding: "var(--space-4)",
        background: "var(--rail)",
      }}
    >
      <h2 className="halo-mono-label">Palette</h2>
      {SECTIONS.map((section) => (
        <div
          key={section.title}
          className="flex flex-col"
          style={{ gap: "var(--space-2)" }}
        >
          <h3 className="t-11 font-light text-[var(--text-faint)]">
            {section.title}
          </h3>
          <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
            {section.entries.map((entry, idx) => (
              <button
                key={`${section.title}-${entry.kind}-${idx}`}
                type="button"
                onClick={() => onAdd(entry)}
                className="flex items-center justify-between t-11 text-[var(--text)] hover:text-[var(--cykan)] hover:bg-[var(--surface-1)] transition-colors text-left rounded-md"
                style={{
                  padding: "var(--space-2) var(--space-3)",
                  border: "1px solid var(--border-soft)",
                }}
              >
                <span>{entry.label}</span>
                <span className="t-9 font-mono uppercase text-[var(--text-faint)]">
                  {entry.kind}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export type { PaletteEntry };
