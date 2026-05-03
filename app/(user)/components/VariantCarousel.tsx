"use client";

/**
 * VariantCarousel — Affichage visuel des variants d'un asset.
 *
 * Remplace AssetVariantTabs en mode plus carrousel : chaque variant
 * existant ou potentiel est rendu en preview (thumbnail image, waveform
 * audio simplifiée, frame still video, snippet code).
 *
 * États supportés :
 *  - `ready`     → preview cliquable + actions Regenerate/Fork
 *  - `pending`/`generating` → spinner subtle
 *  - `failed`    → preview Error + bouton Regenerate
 *  - aucun variant pour ce kind → empty card avec CTA Générer
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssetVariant, AssetVariantKind } from "@/lib/assets/variants";
import { Action } from "./ui";

interface VariantCarouselProps {
  assetId: string;
  /** Texte/contexte source pour la génération (asset.contentRef ou narration). */
  sourceText?: string;
  /** Variant kind par défaut à mettre en avant au mount. */
  defaultKind?: AssetVariantKind;
}

const KIND_LABEL: Record<AssetVariantKind, string> = {
  text: "Texte",
  audio: "Audio",
  video: "Vidéo",
  slides: "Slides",
  site: "Site",
  image: "Image",
  code: "Code",
};

const SUPPORTED_KINDS: ReadonlyArray<AssetVariantKind> = [
  "audio",
  "video",
  "image",
  "code",
];

const POLL_INTERVAL_MS = 4_000;

export function VariantCarousel({
  assetId,
  sourceText,
  defaultKind,
}: VariantCarouselProps) {
  const [variants, setVariants] = useState<AssetVariant[]>([]);
  const [activeKind, setActiveKind] = useState<AssetVariantKind>(
    defaultKind ?? "audio",
  );
  const [generating, setGenerating] = useState<AssetVariantKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchVariants = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v2/assets/${encodeURIComponent(assetId)}/variants`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.variants)) {
        setVariants(data.variants as AssetVariant[]);
      }
    } catch {
      // silent — re-tenté au prochain poll
    }
  }, [assetId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchVariants est async : setVariants ne s'appelle qu'après await, pas synchrone
    void fetchVariants();
  }, [fetchVariants]);

  useEffect(() => {
    const inProgress = variants.some(
      (v) => v.status === "pending" || v.status === "generating",
    );
    if (!inProgress) return;
    const timer = setInterval(() => {
      void fetchVariants();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [variants, fetchVariants]);

  const variantByKind = useMemo(() => {
    const map = new Map<AssetVariantKind, AssetVariant>();
    for (const v of variants) {
      // Garde le dernier (les variants sont triés par created_at desc côté DB
      // dans la majorité des cas — on laisse le dernier écraser pour avoir
      // le plus récent par kind).
      map.set(v.kind, v);
    }
    return map;
  }, [variants]);

  const requestVariant = useCallback(
    async (kind: AssetVariantKind) => {
      setGenerating(kind);
      setError(null);
      try {
        const requestBody: Record<string, unknown> = { kind };
        if (kind === "video") {
          requestBody.scriptText = sourceText;
          requestBody.prompt = sourceText;
          requestBody.provider = "runway";
        } else {
          requestBody.text = sourceText;
        }
        const res = await fetch(
          `/api/v2/assets/${encodeURIComponent(assetId)}/variants`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || data.error || "Échec génération");
          return;
        }
        await fetchVariants();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur réseau");
      } finally {
        setGenerating(null);
      }
    },
    [assetId, sourceText, fetchVariants],
  );

  const active = variantByKind.get(activeKind);

  return (
    <section
      data-testid="variant-carousel"
      className="border-t border-[var(--surface-2)]"
      style={{ paddingTop: "var(--space-6)", marginTop: "var(--space-6)" }}
      aria-label="Variants alternatifs"
    >
      <header
        className="flex items-center justify-between"
        style={{ marginBottom: "var(--space-4)" }}
      >
        <span className="t-11 font-light text-[var(--text-faint)]">
          VARIANTS · {variants.length}
        </span>
        {error && (
          <span className="t-11 font-medium text-[var(--danger)]">
            {error}
          </span>
        )}
      </header>

      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${SUPPORTED_KINDS.length}, minmax(0, 1fr))`,
          gap: "var(--space-3)",
          marginBottom: "var(--space-6)",
        }}
      >
        {SUPPORTED_KINDS.map((kind) => {
          const variant = variantByKind.get(kind);
          const isActive = activeKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              data-testid={`variant-tile-${kind}`}
              data-active={isActive}
              className="flex flex-col text-left"
              style={{
                padding: "var(--space-3)",
                background: isActive ? "var(--cykan-surface)" : "var(--surface-1)",
                border: `1px solid ${isActive ? "var(--cykan)" : "var(--border-shell)"}`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                gap: "var(--space-2)",
                transition: "border-color var(--duration-fast) var(--ease-standard)",
              }}
            >
              <VariantThumbnail variant={variant} kind={kind} />
              <div className="flex items-center justify-between" style={{ gap: "var(--space-2)" }}>
                <span
                  className={`t-11 font-light ${
                    isActive ? "text-[var(--cykan)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {KIND_LABEL[kind]}
                </span>
                <StatusDot status={variant?.status} />
              </div>
            </button>
          );
        })}
      </div>

      <ActiveVariantPanel
        kind={activeKind}
        variant={active}
        generating={generating === activeKind}
        onRegenerate={() => requestVariant(activeKind)}
        onFork={() => requestVariant(activeKind)}
      />
    </section>
  );
}

function StatusDot({ status }: { status?: string }) {
  let color = "var(--text-ghost)";
  if (status === "ready") {
    color = "var(--cykan)";
  } else if (status === "failed") {
    color = "var(--danger)";
  } else if (status === "pending" || status === "generating") {
    color = "var(--warn)";
  }
  return (
    <span
      className={`rounded-pill ${status === "pending" || status === "generating" ? "animate-pulse" : ""}`}
      style={{ width: "var(--space-1)", height: "var(--space-1)", background: color }}
      aria-hidden
    />
  );
}

function VariantThumbnail({
  variant,
  kind,
}: {
  variant?: AssetVariant;
  kind: AssetVariantKind;
}) {
  const baseStyle: React.CSSProperties = {
    aspectRatio: "16 / 9",
    background: "var(--bg-elev)",
    border: "1px solid var(--surface-2)",
    borderRadius: "var(--radius-xs)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  };

  if (!variant || variant.status !== "ready" || !variant.storageUrl) {
    return (
      <div style={baseStyle}>
        <span className="t-11 font-light text-[var(--text-faint)]">
          {variant?.status === "failed"
            ? "Échec"
            : variant?.status === "pending" || variant?.status === "generating"
              ? "Génération…"
              : KIND_LABEL[kind]}
        </span>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div style={baseStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={variant.storageUrl}
          alt="aperçu image"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div style={baseStyle}>
        <Waveform />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div style={baseStyle}>
        <span className="t-13 text-[var(--cykan)]">▶</span>
      </div>
    );
  }

  if (kind === "code") {
    return (
      <div style={baseStyle}>
        <span className="t-9 font-mono text-[var(--cykan)]">{"</>"}</span>
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      <span className="t-11 font-light text-[var(--text-faint)]">
        {KIND_LABEL[kind]}
      </span>
    </div>
  );
}

function Waveform() {
  // SVG waveform statique — visuel uniquement.
  const bars = [12, 18, 8, 22, 14, 26, 10, 20, 16, 24, 12, 18];
  return (
    <svg viewBox="0 0 120 30" width="60%" height="60%" aria-hidden>
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 10 + 2}
          y={(30 - h) / 2}
          width={4}
          height={h}
          fill="var(--cykan)"
          opacity={0.7}
        />
      ))}
    </svg>
  );
}

interface ActiveVariantPanelProps {
  kind: AssetVariantKind;
  variant?: AssetVariant;
  generating: boolean;
  onRegenerate: () => void;
  onFork: () => void;
}

function ActiveVariantPanel({
  kind,
  variant,
  generating,
  onRegenerate,
  onFork,
}: ActiveVariantPanelProps) {
  if (!variant) {
    return (
      <div
        className="flex flex-col"
        style={{
          padding: "var(--space-6)",
          background: "var(--surface-1)",
          border: "1px dashed var(--border-shell)",
          borderRadius: "var(--radius-md)",
          gap: "var(--space-3)",
        }}
      >
        <p className="t-13 font-light text-[var(--text-muted)]">
          Pas encore de variant {KIND_LABEL[kind]}. Génère-en un à partir
          du contenu source.
        </p>
        <Action
          variant="primary"
          tone="brand"
          onClick={onRegenerate}
          loading={generating}
          className="self-start"
        >
          {`Générer ${KIND_LABEL[kind]}`}
        </Action>
      </div>
    );
  }

  const isReady = variant.status === "ready" && !!variant.storageUrl;
  const isFailed = variant.status === "failed";

  return (
    <div
      className="flex flex-col"
      style={{
        padding: "var(--space-5)",
        background: "var(--surface-1)",
        border: `1px solid ${isFailed ? "var(--danger)" : "var(--border-shell)"}`,
        borderRadius: "var(--radius-md)",
        gap: "var(--space-4)",
      }}
    >
      <header className="flex items-center justify-between" style={{ gap: "var(--space-3)" }}>
        <span className="t-13 font-medium text-[var(--text-l1)]">
          {KIND_LABEL[kind]} · <span className="font-light text-[var(--text-faint)]">{variant.status}</span>
        </span>
        <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={generating}
            className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--cykan)] transition-colors duration-base"
            style={{
              padding: "var(--space-1) var(--space-3)",
              background: "transparent",
              border: "1px solid var(--border-shell)",
              borderRadius: "var(--radius-xs)",
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "…" : "Re-générer"}
          </button>
          <button
            type="button"
            onClick={onFork}
            disabled={generating}
            className="t-11 font-light text-[var(--text-muted)] hover:text-[var(--cykan)]"
            style={{
              padding: "var(--space-1) var(--space-3)",
              background: "transparent",
              border: "1px solid var(--border-shell)",
              borderRadius: "var(--radius-xs)",
              cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
            title="Fork — créer un nouveau variant à partir de celui-ci"
          >
            Fork
          </button>
        </div>
      </header>

      {isReady && variant.storageUrl && kind === "audio" && (
        <audio controls className="w-full" preload="metadata" src={variant.storageUrl} />
      )}
      {isReady && variant.storageUrl && kind === "image" && (
        <a
          href={variant.storageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full"
          style={{ borderRadius: "var(--radius-md)", overflow: "hidden" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={variant.storageUrl} alt="variant image" style={{ width: "100%" }} />
        </a>
      )}
      {isReady && variant.storageUrl && kind === "video" && (
        <video controls className="w-full" preload="metadata" src={variant.storageUrl} />
      )}
      {isReady && variant.storageUrl && kind === "code" && (
        <a
          href={variant.storageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="t-11 font-mono text-[var(--cykan)] hover:underline"
        >
          Ouvrir l&apos;output {variant.storageUrl}
        </a>
      )}
      {isFailed && variant.error && (
        <p className="t-11 font-mono text-[var(--danger)]">{variant.error}</p>
      )}
    </div>
  );
}
