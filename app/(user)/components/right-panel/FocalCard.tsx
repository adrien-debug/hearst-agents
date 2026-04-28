"use client";

/**
 * FocalCard — strate FOCAL du RightPanel.
 *
 * Quand un focal est actif : grosse carte cliquable (glyph 64, type, titre 2
 * lignes, status pill). Click → `useFocalStore.show()` qui ouvre la surface
 * focal centrale.
 *
 * Quand pas de focal : empty state graphique (glyph silhouette opacité 0.3
 * + label discret).
 *
 * Sous la carte : 3 chips secondary objects (28×28) avec mini-glyph + tooltip.
 */

import { useFocalStore } from "@/stores/focal";
import { AssetGlyphSVG } from "../right-panel-helpers";

interface FocalCardProps {
  focalObject?: unknown;
  secondaryObjects?: unknown[];
  activeThreadId: string | null;
}

const STATUS_PILL: Record<string, { label: string; color: string; bg: string }> = {
  composing:          { label: "composing",   color: "var(--cykan)",        bg: "var(--cykan-bg-active)" },
  ready:              { label: "ready",       color: "var(--cykan)",        bg: "var(--cykan-bg-active)" },
  awaiting_approval:  { label: "à valider",   color: "var(--warn)",         bg: "rgba(245,158,11,0.10)" },
  delivering:         { label: "delivering",  color: "var(--cykan)",        bg: "var(--cykan-bg-active)" },
  delivered:          { label: "delivered",   color: "var(--text-soft)",    bg: "var(--surface-2)" },
  active:             { label: "active",      color: "var(--cykan)",        bg: "var(--cykan-bg-active)" },
  paused:             { label: "paused",      color: "var(--warn)",         bg: "rgba(245,158,11,0.10)" },
  failed:             { label: "échec",       color: "var(--danger)",       bg: "rgba(239,68,68,0.10)" },
};

const getProp = (obj: unknown, key: string): string | undefined => {
  if (typeof obj !== "object" || obj === null) return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
};

export function FocalCard({ focalObject, secondaryObjects }: FocalCardProps) {
  const show = useFocalStore((s) => s.show);
  const setFocalFromSecondary = useFocalStore((s) => s.setFocal);

  if (!focalObject) {
    return (
      <div
        className="border-b border-[var(--border-shell)] flex items-center gap-4 px-4"
        style={{ height: "180px" }}
      >
        <span
          className="shrink-0 w-16 h-16 text-[var(--text-faint)]"
          style={{ opacity: 0.3 }}
          aria-hidden
        >
          <AssetGlyphSVG type="brief" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="t-9 font-mono tracking-[0.22em] uppercase text-[var(--text-ghost)] mb-2">
            FOCAL
          </p>
          <p className="t-13 text-[var(--text-faint)] leading-snug">
            Aucun focal sélectionné.
          </p>
          <p className="t-11 text-[var(--text-ghost)] mt-1">
            Choisis un asset ci-dessous.
          </p>
        </div>
      </div>
    );
  }

  const objectType = getProp(focalObject, "objectType") || "unknown";
  const title = getProp(focalObject, "title") || "Untitled";
  const status = getProp(focalObject, "status") || "";
  const pill = STATUS_PILL[status];

  return (
    <div
      className="border-b border-[var(--border-shell)] flex flex-col gap-2 px-4 py-4"
      style={{ height: "180px" }}
    >
      <button
        type="button"
        onClick={show}
        className="flex-1 min-h-0 flex items-center gap-4 cursor-pointer text-left rounded-sm overflow-hidden hover:bg-[var(--cykan-bg-active)] transition-colors"
        style={{ background: "var(--cykan-bg-hover)", borderLeft: "3px solid var(--cykan)", padding: "var(--space-3)" }}
        title="Ouvrir le focal"
      >
        <span
          className="shrink-0 w-16 h-16 text-[var(--cykan)]"
          aria-hidden
        >
          <AssetGlyphSVG type={objectType} />
        </span>
        <span className="flex-1 min-w-0 flex flex-col gap-1.5">
          <span
            className="t-9 font-mono tracking-[0.22em] uppercase font-semibold"
            style={{ color: "var(--cykan)" }}
          >
            {objectType}
          </span>
          <span
            className="t-13 font-medium text-[var(--text)] leading-snug"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </span>
          {pill && (
            <span
              className="self-start inline-flex items-center t-9 font-mono tracking-[0.18em] uppercase px-2 py-0.5 rounded-sm"
              style={{ color: pill.color, background: pill.bg }}
            >
              {pill.label}
            </span>
          )}
        </span>
      </button>

      {secondaryObjects && secondaryObjects.length > 0 && (
        <div className="flex items-center gap-2 shrink-0">
          {secondaryObjects.slice(0, 3).map((obj, idx) => {
            const sType = getProp(obj, "objectType") || "doc";
            const sTitle = getProp(obj, "title") || "Untitled";
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  // Promote secondary as new focal — store handles it.
                  if (typeof obj === "object" && obj !== null) {
                    setFocalFromSecondary(obj as Parameters<typeof setFocalFromSecondary>[0]);
                  }
                }}
                title={sTitle}
                className="w-7 h-7 p-1 rounded-sm text-[var(--text-faint)] hover:text-[var(--cykan)] hover:bg-[var(--surface-2)] transition-colors"
                aria-label={sTitle}
              >
                <AssetGlyphSVG type={sType} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
