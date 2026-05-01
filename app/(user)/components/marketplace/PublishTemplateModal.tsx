"use client";

/**
 * PublishTemplateModal — formulaire de publication d'un template marketplace.
 *
 * Pré-rempli depuis la source (workflow / report spec / persona). Le payload
 * et le kind sont fournis par le caller (toolbar Studio/Builder/Personas).
 */

import { useState } from "react";
import { Action } from "../ui";

interface PublishTemplateModalProps {
  open: boolean;
  kind: "workflow" | "report_spec" | "persona";
  defaultTitle?: string;
  defaultDescription?: string;
  /** Payload prêt à publier (WorkflowGraph | ReportSpec | PersonaPayload). */
  payload: unknown;
  onClose: () => void;
  onPublished: (templateId: string) => void;
}

const KIND_LABELS: Record<string, string> = {
  workflow: "Workflow",
  report_spec: "Rapport",
  persona: "Persona",
};

export function PublishTemplateModal({
  open,
  kind,
  defaultTitle = "",
  defaultDescription = "",
  payload,
  onClose,
  onPublished,
}: PublishTemplateModalProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [tagsInput, setTagsInput] = useState("");
  const [authorDisplayName, setAuthorDisplayName] = useState("");
  const [anonymize, setAnonymize] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    setErr(null);
    if (!title.trim()) {
      setErr("Le titre est requis.");
      return;
    }
    setBusy(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5);
      const res = await fetch("/api/v2/marketplace/templates", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          description: description.trim() || undefined,
          payload,
          tags,
          anonymizeAuthor: anonymize,
          authorDisplayName: anonymize ? undefined : authorDisplayName.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(body.error ?? `publish_failed_${res.status}`);
        return;
      }
      const body = (await res.json()) as { template: { id: string } };
      onPublished(body.template.id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "publish_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="publish-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "var(--overlay-scrim)",
        backdropFilter: "blur(20px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg flex flex-col"
        style={{
          gap: "var(--space-4)",
          padding: "var(--space-6)",
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-card)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-baseline justify-between"
          style={{ gap: "var(--space-3)" }}
        >
          <h2 className="t-15 font-medium text-[var(--text)]">
            Publier au marketplace
          </h2>
          <span className="t-11 font-light text-[var(--text-faint)]">
            {KIND_LABELS[kind]}
          </span>
        </header>

        <Field label="Titre">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            data-testid="publish-title"
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>

        <Field label="Description (optionnel)">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            data-testid="publish-desc"
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none resize-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>

        <Field label="Tags (5 max, séparés par virgules)">
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="growth, sales, slack"
            data-testid="publish-tags"
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>

        <Field label="Nom d'auteur affiché (optionnel)">
          <input
            type="text"
            value={authorDisplayName}
            onChange={(e) => setAuthorDisplayName(e.target.value)}
            disabled={anonymize}
            placeholder="Adrien · Hearst"
            maxLength={80}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none disabled:opacity-50"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
        </Field>

        <label className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <input
            type="checkbox"
            checked={anonymize}
            onChange={(e) => setAnonymize(e.target.checked)}
            data-testid="publish-anonymize"
          />
          <span className="t-11 text-[var(--text-soft)]">
            Publier en anonyme (masquer le nom)
          </span>
        </label>

        {err && (
          <p className="t-11 font-medium text-[var(--danger)]">
            {err}
          </p>
        )}

        <div
          className="flex items-center justify-end"
          style={{ gap: "var(--space-2)" }}
        >
          <Action
            variant="secondary"
            tone="neutral"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Annuler
          </Action>
          <Action
            variant="primary"
            tone="brand"
            size="sm"
            onClick={() => void submit()}
            disabled={!title.trim()}
            loading={busy}
            testId="publish-confirm"
          >
            Publier
          </Action>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col" style={{ gap: "var(--space-2)" }}>
      <span className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}
