"use client";

/**
 * CockpitInbox — Liste inbox-first dense pour le mode cockpit.
 *
 * 3 sections (Suggestions IA / Threads récents / Assets récents) avec
 * empty states qui font DISPARAÎTRE la section au lieu d'afficher du
 * scaffolding vide. Si tout est vide → empty state célébratoire.
 *
 * Données :
 *  - Suggestions : GET /api/v2/right-panel → reportSuggestions[]
 *  - Threads : useNavigationStore.threads triés par lastActivity DESC
 *  - Assets : GET /api/v2/right-panel → assets[]
 *
 * Polling 30s. Pas de SSE — l'écran d'accueil n'a pas besoin de live.
 */

import { useEffect, useState } from "react";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { useFocalStore } from "@/stores/focal";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { toast } from "@/app/hooks/use-toast";
import { AssetGlyphSVG, formatRelativeTime } from "../right-panel-helpers";
import type {
  RightPanelData,
  RightPanelAsset,
  RightPanelReportSuggestion,
} from "@/lib/core/types";

const POLL_MS = 30_000;
const MAX_THREADS = 5;
const MAX_ASSETS = 5;
const MAX_SUGGESTIONS = 3;

export function CockpitInbox() {
  const threads = useNavigationStore((s) => s.threads);
  const setStageMode = useStageStore((s) => s.setMode);

  const [suggestions, setSuggestions] = useState<RightPanelReportSuggestion[]>([]);
  const [assets, setAssets] = useState<RightPanelAsset[]>([]);
  const [runningSpecs, setRunningSpecs] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchData = async () => {
      try {
        const res = await fetch("/api/v2/right-panel", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as RightPanelData;
        if (cancelled) return;
        setSuggestions(data.reportSuggestions ?? []);
        setAssets(data.assets ?? []);
      } catch {
        // Non-fatal : retry au prochain tick
      }
    };

    void fetchData();
    timer = setInterval(fetchData, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const recentThreads = [...threads]
    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
    .slice(0, MAX_THREADS);

  const visibleSuggestions = suggestions
    .filter((s) => !runningSpecs.has(s.specId))
    .slice(0, MAX_SUGGESTIONS);

  const recentAssets = assets.slice(0, MAX_ASSETS);

  const allEmpty =
    visibleSuggestions.length === 0 && recentThreads.length === 0 && recentAssets.length === 0;

  const onSuggestionClick = async (s: RightPanelReportSuggestion) => {
    setRunningSpecs((prev) => new Set(prev).add(s.specId));
    try {
      const res = await fetch(`/api/v2/reports/${encodeURIComponent(s.specId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { assetId: string | null; title: string };
      if (data.assetId) {
        useFocalStore
          .getState()
          .setFocal(
            assetToFocal(
              { id: data.assetId, name: data.title ?? s.title, type: "report" },
              null,
            ),
          );
      }
      toast.success("Report généré", s.title);
    } catch (err) {
      setRunningSpecs((prev) => {
        const next = new Set(prev);
        next.delete(s.specId);
        return next;
      });
      toast.error("Échec génération", err instanceof Error ? err.message : "Erreur");
    }
  };

  const onThreadClick = (threadId: string) => {
    setStageMode({ mode: "chat", threadId });
  };

  const onAssetClick = (assetId: string) => {
    setStageMode({ mode: "asset", assetId });
  };

  if (allEmpty) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ gap: "var(--space-6)", padding: "var(--space-12)" }}
      >
        <span
          className="block text-[var(--cykan)] opacity-30 halo-cyan-md t-34"
          style={{ height: "var(--height-stage-empty-icon)" }}
          aria-hidden
        >
          ◉
        </span>
        <p className="t-15 font-medium tracking-tight text-[var(--text)]">
          Hearst attend ton premier signal.
        </p>
        <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          ⌘K pour démarrer · demande, ou laisse l{"'"}agent proposer
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full" style={{ gap: "var(--space-8)" }}>
      {visibleSuggestions.length > 0 && (
        <Section label="Suggestions" count={visibleSuggestions.length}>
          {visibleSuggestions.map((s) => (
            <SuggestionRow key={s.specId} suggestion={s} onClick={() => onSuggestionClick(s)} />
          ))}
        </Section>
      )}

      {recentThreads.length > 0 && (
        <Section label="Threads récents" count={recentThreads.length}>
          {recentThreads.map((t) => (
            <ThreadRow
              key={t.id}
              name={t.name}
              lastActivity={t.lastActivity}
              onClick={() => onThreadClick(t.id)}
            />
          ))}
        </Section>
      )}

      {recentAssets.length > 0 && (
        <Section label="Assets récents" count={recentAssets.length}>
          {recentAssets.map((a) => (
            <AssetRow key={a.id} asset={a} onClick={() => onAssetClick(a.id)} />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col" style={{ gap: "var(--space-3)" }}>
      <header className="flex items-center justify-between pb-2 border-b border-[var(--border-default)]">
        <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
          {label}
        </span>
        <span className="t-9 font-mono tracking-display text-[var(--text-faint)]">
          {count.toString().padStart(2, "0")}
        </span>
      </header>
      <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
        {children}
      </div>
    </section>
  );
}

function SuggestionRow({
  suggestion,
  onClick,
}: {
  suggestion: RightPanelReportSuggestion;
  onClick: () => void;
}) {
  const isReady = suggestion.status === "ready";
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between border-l-2 border-l-[var(--cykan)] hover:bg-[var(--surface-1)] transition-colors"
      style={{ padding: "var(--space-3)" }}
    >
      <div className="flex-1 min-w-0">
        <p className="t-13 font-medium text-[var(--text)] truncate">{suggestion.title}</p>
        <p className="t-9 text-[var(--text-faint)] truncate mt-0.5">{suggestion.description}</p>
      </div>
      <span
        className="t-9 font-mono uppercase tracking-marquee ml-3 shrink-0"
        style={{ color: isReady ? "var(--cykan)" : "var(--text-faint)" }}
      >
        {isReady
          ? "lancer"
          : `${suggestion.requiredApps.length - suggestion.missingApps.length}/${suggestion.requiredApps.length}`}
      </span>
    </button>
  );
}

function ThreadRow({
  name,
  lastActivity,
  onClick,
}: {
  name: string;
  lastActivity: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center justify-between hover:bg-[var(--surface-1)] transition-colors"
      style={{ padding: "var(--space-3)" }}
    >
      <div className="flex items-center min-w-0" style={{ gap: "var(--space-3)" }}>
        <span
          className="rounded-pill bg-[var(--text-ghost)] shrink-0"
          style={{ width: "var(--space-1)", height: "var(--space-1)" }}
        />
        <p className="t-13 text-[var(--text)] truncate">{name}</p>
      </div>
      <span className="t-9 font-mono tracking-display text-[var(--text-faint)] shrink-0 ml-3">
        {formatRelativeTime(lastActivity)}
      </span>
    </button>
  );
}

function AssetRow({ asset, onClick }: { asset: RightPanelAsset; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center hover:bg-[var(--surface-1)] transition-colors"
      style={{ padding: "var(--space-3)", gap: "var(--space-3)" }}
    >
      <span className="w-5 h-5 text-[var(--text-muted)] shrink-0">
        <AssetGlyphSVG type={asset.type} />
      </span>
      <p className="flex-1 t-13 text-[var(--text)] truncate">{asset.name}</p>
      <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] shrink-0">
        {asset.type}
      </span>
    </button>
  );
}
