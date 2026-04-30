"use client";

/**
 * /marketplace/[id] — détail d'un template + actions (cloner, noter, signaler).
 *
 * Preview minimal :
 *   - workflow → liste des nodes
 *   - report_spec → liste des blocks
 *   - persona → fiche
 *
 * Actions : cloner, noter (1-5 + commentaire), signaler (raison libre).
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "../../components/PageHeader";
import type {
  MarketplaceTemplate,
  MarketplaceRating,
} from "@/lib/marketplace/types";
import type { WorkflowGraph } from "@/lib/workflows/types";
import type { ReportSpec } from "@/lib/reports/spec/schema";

interface DetailResponse {
  template: MarketplaceTemplate;
  ratings: MarketplaceRating[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

const KIND_LABELS: Record<string, string> = {
  workflow: "Workflow",
  report_spec: "Rapport",
  persona: "Persona",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function MarketplaceDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Rate form
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");

  // Report form
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/v2/marketplace/templates/${id}`, {
          credentials: "include",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 404 ? "Template introuvable" : `HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as DetailResponse;
        if (!cancelled) setData(body);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleClone() {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/v2/marketplace/templates/${id}/clone`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        resourceId?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setFlash(`Clone échoué : ${body.error ?? `HTTP ${res.status}`}`);
        return;
      }
      // Redirige vers la ressource créée selon le kind.
      if (data?.template.kind === "workflow") {
        router.push(`/missions`);
      } else if (data?.template.kind === "report_spec") {
        router.push(`/reports`);
      } else if (data?.template.kind === "persona") {
        router.push(`/personas`);
      }
      setFlash("Template cloné dans ton espace.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "clone_failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRate() {
    if (rating < 1 || rating > 5) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/v2/marketplace/templates/${id}/rate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setFlash(`Note échouée : ${body.error ?? res.status}`);
        return;
      }
      setFlash("Merci pour la note.");
      // Refresh
      const fresh = await fetch(`/api/v2/marketplace/templates/${id}`, {
        credentials: "include",
      });
      if (fresh.ok) {
        const body = (await fresh.json()) as DetailResponse;
        setData(body);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleReport() {
    if (reportReason.trim().length < 3) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/v2/marketplace/templates/${id}/report`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setFlash(`Signalement échoué : ${body.error ?? res.status}`);
        return;
      }
      setFlash("Signalement envoyé.");
      setReportOpen(false);
      setReportReason("");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
        <PageHeader
          title="Marketplace"
          back={{ label: "Retour", href: "/marketplace" }}
        />
        <p className="px-12 py-8 t-13 text-[var(--danger)]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
        <PageHeader
          title="Marketplace"
          back={{ label: "Retour", href: "/marketplace" }}
        />
        <p className="px-12 py-8 t-11 font-light text-[var(--text-faint)]">
          Chargement…
        </p>
      </div>
    );
  }

  const tpl = data.template;
  const author = tpl.authorDisplayName?.trim() || "Anonyme";

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg text-text">
      <PageHeader
        title={tpl.title}
        subtitle={tpl.description ?? undefined}
        back={{ label: "Marketplace", href: "/marketplace" }}
        actions={
          <div className="flex" style={{ gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={() => void handleClone()}
              disabled={busy}
              data-testid="detail-clone"
              className="t-11 font-medium"
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--cykan)",
                color: "var(--text-on-cykan)",
                border: "1px solid var(--cykan)",
                borderRadius: "var(--radius-sm)",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Cloner
            </button>
            <button
              type="button"
              onClick={() => setReportOpen((v) => !v)}
              disabled={busy}
              className="t-11 font-light text-[var(--text-faint)] hover:text-[var(--danger)]"
              style={{ background: "transparent", border: "none", cursor: "pointer" }}
            >
              Signaler
            </button>
          </div>
        }
      />

      <div
        className="px-12 py-8 mx-auto w-full max-w-[min(100%,var(--width-actions))] flex flex-col"
        style={{ gap: "var(--space-6)" }}
      >
        {flash && (
          <p
            className="t-11 font-light"
            style={{ color: "var(--cykan)" }}
          >
            {flash}
          </p>
        )}

        {/* Méta */}
        <section
          className="flex flex-wrap"
          style={{ gap: "var(--space-3)" }}
        >
          <Chip>{KIND_LABELS[tpl.kind] ?? tpl.kind}</Chip>
          <Chip>par {escapeHtml(author)}</Chip>
          {tpl.tags.map((tag) => (
            <Chip key={tag}>{escapeHtml(tag)}</Chip>
          ))}
          <Chip>
            {tpl.cloneCount} clone{tpl.cloneCount === 1 ? "" : "s"}
          </Chip>
          {tpl.ratingCount > 0 && (
            <Chip>
              ★ {tpl.ratingAvg.toFixed(1)} ({tpl.ratingCount})
            </Chip>
          )}
        </section>

        {/* Preview */}
        <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <h2 className="t-13 text-[var(--text-soft)]">Aperçu</h2>
          {tpl.kind === "workflow" && (
            <WorkflowPreview graph={tpl.payload as WorkflowGraph} />
          )}
          {tpl.kind === "report_spec" && (
            <ReportPreview spec={tpl.payload as ReportSpec} />
          )}
          {tpl.kind === "persona" && (
            <PersonaPreview payload={tpl.payload as Record<string, unknown>} />
          )}
        </section>

        {/* Report form */}
        {reportOpen && (
          <section
            className="flex flex-col"
            style={{
              gap: "var(--space-3)",
              padding: "var(--space-4)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elev)",
            }}
          >
            <h3 className="t-13 text-[var(--text)]">Signaler ce template</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={3}
              placeholder="Raison (3-500 caractères)…"
              maxLength={500}
              className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none resize-none"
              style={{
                padding: "var(--space-2) var(--space-3)",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-1)",
              }}
            />
            <div
              className="flex items-center justify-end"
              style={{ gap: "var(--space-3)" }}
            >
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="t-11 font-light text-[var(--text-faint)]"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleReport()}
                disabled={busy || reportReason.trim().length < 3}
                className="t-11 font-medium"
                style={{
                  padding: "var(--space-2) var(--space-4)",
                  background: "var(--danger)",
                  color: "var(--text)",
                  border: "1px solid var(--danger)",
                  borderRadius: "var(--radius-sm)",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Envoyer
              </button>
            </div>
          </section>
        )}

        {/* Notation */}
        <section
          className="flex flex-col"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-4)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-elev)",
          }}
        >
          <h3 className="t-13 text-[var(--text)]">Donner une note</h3>
          <div className="flex" style={{ gap: "var(--space-2)" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                data-testid={`rate-${n}`}
                className="t-15"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: n <= rating ? "var(--cykan)" : "var(--text-ghost)",
                }}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Commentaire (optionnel)…"
            maxLength={500}
            className="block w-full bg-transparent t-13 text-[var(--text)] focus:outline-none resize-none"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-1)",
            }}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleRate()}
              disabled={busy || rating === 0}
              data-testid="rate-submit"
              className="t-11 font-medium"
              style={{
                padding: "var(--space-2) var(--space-4)",
                background: "var(--cykan)",
                color: "var(--text-on-cykan)",
                border: "1px solid var(--cykan)",
                borderRadius: "var(--radius-sm)",
                cursor: busy || rating === 0 ? "not-allowed" : "pointer",
                opacity: busy || rating === 0 ? 0.6 : 1,
              }}
            >
              Envoyer la note
            </button>
          </div>
        </section>

        {/* Ratings list */}
        {data.ratings.length > 0 && (
          <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            <h2 className="t-13 text-[var(--text-soft)]">
              Notes ({data.ratings.length})
            </h2>
            <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
              {data.ratings.map((r) => (
                <li
                  key={`${r.templateId}-${r.userId}`}
                  className="flex flex-col"
                  style={{
                    gap: "var(--space-1)",
                    padding: "var(--space-3)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-elev)",
                  }}
                >
                  <span className="t-11 font-medium text-[var(--cykan)]">
                    {"★".repeat(r.rating)}
                    {"·".repeat(5 - r.rating)}
                  </span>
                  {r.comment && (
                    <p className="t-11 text-[var(--text-soft)]">
                      {escapeHtml(r.comment)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="t-11 font-light text-[var(--text-faint)]"
      style={{
        padding: "var(--space-1) var(--space-2)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-pill)",
      }}
    >
      {children}
    </span>
  );
}

function WorkflowPreview({ graph }: { graph: WorkflowGraph }) {
  return (
    <ol
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      {graph.nodes.map((n, i) => (
        <li
          key={n.id}
          className="flex items-baseline"
          style={{ gap: "var(--space-2)" }}
        >
          <span className="t-9 font-mono text-[var(--text-faint)]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="t-11 font-medium text-[var(--cykan)]">
            {n.kind}
          </span>
          <span className="t-11 text-[var(--text)]">{escapeHtml(n.label)}</span>
        </li>
      ))}
    </ol>
  );
}

function ReportPreview({ spec }: { spec: ReportSpec }) {
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      <p className="t-11 text-[var(--text-muted)]">
        {spec.sources.length} source{spec.sources.length === 1 ? "" : "s"} ·{" "}
        {spec.transforms.length} transform{spec.transforms.length === 1 ? "" : "s"} ·{" "}
        {spec.blocks.length} block{spec.blocks.length === 1 ? "" : "s"}
      </p>
      <ul className="flex flex-col" style={{ gap: "var(--space-1)" }}>
        {spec.blocks.map((b) => (
          <li
            key={b.id}
            className="flex items-baseline"
            style={{ gap: "var(--space-2)" }}
          >
            <span className="t-11 font-medium text-[var(--cykan)]">
              {b.type}
            </span>
            <span className="t-11 text-[var(--text)]">
              {escapeHtml(b.label ?? b.id)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonaPreview({ payload }: { payload: Record<string, unknown> }) {
  const tone = typeof payload.tone === "string" ? payload.tone : null;
  const styleGuide = typeof payload.styleGuide === "string" ? payload.styleGuide : null;
  const systemPromptAddon =
    typeof payload.systemPromptAddon === "string" ? payload.systemPromptAddon : null;
  return (
    <div
      className="flex flex-col"
      style={{
        gap: "var(--space-2)",
        padding: "var(--space-4)",
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elev)",
      }}
    >
      {tone && (
        <p className="t-11 text-[var(--text-soft)]">
          Ton : <strong>{escapeHtml(tone)}</strong>
        </p>
      )}
      {styleGuide && (
        <p className="t-11 text-[var(--text-soft)] whitespace-pre-wrap">
          {escapeHtml(styleGuide)}
        </p>
      )}
      {systemPromptAddon && (
        <p
          className="t-11 text-[var(--text-muted)] whitespace-pre-wrap"
          style={{ fontStyle: "italic" }}
        >
          {escapeHtml(systemPromptAddon)}
        </p>
      )}
    </div>
  );
}
