"use client";

/**
 * SourceCitation — Wrapper qui rend les citations cliquables.
 *
 * Pattern : un report ou un block contient des markers `<sup data-source-id="s1">`
 * (ou ReactNodes équivalents) ; ce composant attache un tooltip au hover et
 * un clic qui drill-down vers la source originale.
 *
 * Format Source :
 *  - id     : identifiant unique du marker
 *  - url    : URL externe (si la source est web) → window.open
 *  - assetId: ID d'asset interne (si la source est un autre asset) → setStageMode asset
 *  - label  : libellé court affiché dans le tooltip
 *  - fetchedAt: timestamp ms — affiché dans le tooltip
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStageStore } from "@/stores/stage";

export interface Source {
  id: string;
  url?: string;
  assetId?: string;
  label: string;
  fetchedAt?: number;
}

interface SourceCitationProps {
  sources: ReadonlyArray<Source>;
  children: ReactNode;
}

const FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function SourceCitation({ sources, children }: SourceCitationProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Map id → source pour lookup rapide
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sups = Array.from(
      root.querySelectorAll<HTMLElement>("sup[data-source-id]"),
    );

    const handleEnter = (e: Event) => {
      const target = e.currentTarget as HTMLElement;
      const id = target.getAttribute("data-source-id");
      if (!id) return;
      const src = sourceById.get(id);
      if (!src) return;
      const rect = target.getBoundingClientRect();
      setActiveSource(src);
      setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
    };
    const handleLeave = () => {
      setActiveSource(null);
      setTooltipPos(null);
    };
    const handleClick = (e: Event) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLElement;
      const id = target.getAttribute("data-source-id");
      if (!id) return;
      const src = sourceById.get(id);
      if (!src) return;
      openSource(src);
    };

    sups.forEach((sup) => {
      sup.style.cursor = "pointer";
      sup.style.color = "var(--cykan)";
      sup.style.fontWeight = "500";
      sup.addEventListener("mouseenter", handleEnter);
      sup.addEventListener("mouseleave", handleLeave);
      sup.addEventListener("click", handleClick);
    });

    return () => {
      sups.forEach((sup) => {
        sup.removeEventListener("mouseenter", handleEnter);
        sup.removeEventListener("mouseleave", handleLeave);
        sup.removeEventListener("click", handleClick);
      });
    };
    // children peut changer ; sourceById est stable tant que sources ne change pas.
  }, [children, sourceById]);

  return (
    <div ref={containerRef} className="relative" data-testid="source-citation-root">
      {children}
      {activeSource && tooltipPos && (
        <div
          role="tooltip"
          data-testid="source-citation-tooltip"
          className="fixed z-50"
          style={{
            top: tooltipPos.y,
            left: tooltipPos.x,
            padding: "var(--space-3) var(--space-4)",
            background: "var(--surface-1)",
            border: "1px solid var(--cykan)",
            borderRadius: "var(--radius-xs)",
            maxWidth: "calc(var(--space-32) * 2)",
            boxShadow: "var(--shadow-card-hover)",
          }}
        >
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">
            SOURCE
          </p>
          <p
            className="t-11 font-light text-[var(--text)]"
            style={{ marginTop: "var(--space-1)" }}
          >
            {activeSource.label}
          </p>
          {activeSource.url && (
            <p
              className="t-9 font-mono text-[var(--text-muted)] truncate"
              style={{ marginTop: "var(--space-1)" }}
            >
              {activeSource.url}
            </p>
          )}
          {activeSource.fetchedAt && (
            <p
              className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]"
              style={{ marginTop: "var(--space-1)" }}
            >
              {FORMATTER.format(new Date(activeSource.fetchedAt))}
            </p>
          )}
          <button
            type="button"
            onClick={() => openSource(activeSource)}
            className="halo-on-hover t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]"
            style={{
              marginTop: "var(--space-2)",
              padding: "var(--space-1) var(--space-2)",
              background: "transparent",
              border: "1px solid var(--cykan)",
              borderRadius: "var(--radius-xs)",
              cursor: "pointer",
            }}
          >
            Ouvrir source
          </button>
        </div>
      )}
    </div>
  );
}

function openSource(src: Source): void {
  if (src.assetId) {
    useStageStore.getState().setMode({ mode: "asset", assetId: src.assetId });
    return;
  }
  if (src.url) {
    window.open(src.url, "_blank", "noopener,noreferrer");
  }
}
