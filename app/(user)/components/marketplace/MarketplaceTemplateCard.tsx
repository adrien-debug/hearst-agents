"use client";

/**
 * MarketplaceTemplateCard — card cliquable pour un template de la marketplace.
 *
 * Affiche : kind glyph, title, description courte, auteur, tags chips,
 * rating stars, clone count. Tokens uniquement (CLAUDE.md §1).
 */

import Link from "next/link";
import type { MarketplaceTemplateSummary } from "@/lib/marketplace/types";

interface MarketplaceTemplateCardProps {
  template: MarketplaceTemplateSummary;
}

const KIND_LABELS: Record<string, string> = {
  workflow: "Workflow",
  report_spec: "Rapport",
  persona: "Persona",
};

const KIND_GLYPHS: Record<string, string> = {
  workflow: "▶",
  report_spec: "▦",
  persona: "◉",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function MarketplaceTemplateCard({ template }: MarketplaceTemplateCardProps) {
  const kindLabel = KIND_LABELS[template.kind] ?? template.kind;
  const glyph = KIND_GLYPHS[template.kind] ?? "·";
  const author = template.authorDisplayName?.trim() || "Anonyme";

  return (
    <Link
      href={`/marketplace/${template.id}`}
      data-testid={`marketplace-card-${template.id}`}
      className="flex flex-col transition-colors"
      style={{
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--bg-elev)",
        border: template.isFeatured
          ? "1px solid var(--cykan)"
          : "1px solid var(--line-strong)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <header
        className="flex items-baseline justify-between"
        style={{ gap: "var(--space-2)" }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <span
            className="t-13"
            style={{ color: "var(--cykan)" }}
            aria-hidden
          >
            {glyph}
          </span>
          <span className="t-11 font-light text-[var(--text-faint)]">
            {kindLabel}
          </span>
          {template.isFeatured && (
            <span className="t-11 font-medium text-[var(--cykan)]">
              · Featured
            </span>
          )}
        </div>
        <RatingChip avg={template.ratingAvg} count={template.ratingCount} />
      </header>

      <h3
        className="t-15 font-medium text-[var(--text)]"
        style={{ lineHeight: "var(--leading-snug)" }}
      >
        {escapeHtml(template.title)}
      </h3>

      {template.description && (
        <p className="t-11 text-[var(--text-muted)]" style={{ lineHeight: "var(--leading-normal)" }}>
          {escapeHtml(template.description.slice(0, 160))}
          {template.description.length > 160 ? "…" : ""}
        </p>
      )}

      {template.tags.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: "var(--space-1)" }}>
          {template.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="t-11 font-light text-[var(--text-faint)]"
              style={{
                padding: "var(--space-0) var(--space-2)",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius-pill)",
              }}
            >
              {escapeHtml(tag)}
            </span>
          ))}
        </div>
      )}

      <footer
        className="flex items-center justify-between"
        style={{ gap: "var(--space-2)", marginTop: "var(--space-1)" }}
      >
        <span className="t-11 font-light text-[var(--text-faint)]">
          {escapeHtml(author)}
        </span>
        <span className="t-9 font-mono text-[var(--text-faint)]">
          {template.cloneCount} clone{template.cloneCount === 1 ? "" : "s"}
        </span>
      </footer>
    </Link>
  );
}

function RatingChip({ avg, count }: { avg: number; count: number }) {
  if (count === 0) {
    return (
      <span className="t-9 font-mono text-[var(--text-faint)]">—</span>
    );
  }
  return (
    <span
      className="t-9 font-mono"
      style={{ color: "var(--cykan)" }}
      title={`${avg.toFixed(1)} / 5 — ${count} note${count === 1 ? "" : "s"}`}
    >
      ★ {avg.toFixed(1)} ({count})
    </span>
  );
}
