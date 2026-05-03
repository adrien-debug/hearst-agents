"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { SectionHeader } from "../ui/SectionHeader";
import { useRunReportSuggestion } from "../right-panel/useRunReportSuggestion";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { useVoiceStore } from "@/stores/voice";
import type { CockpitTodayPayload } from "@/lib/cockpit/today";

interface QuickActionsGridProps {
  data: CockpitTodayPayload;
}

type TileTone = "cykan" | "gold" | "neutral";
type TileStatus = "ready" | "partial" | null;

interface Tile {
  id: string;
  eyebrow: string;
  title: string;
  tone: TileTone;
  status: TileStatus;
  onClick: () => void;
  loading: boolean;
}

const TONE_BORDER: Record<TileTone, string> = {
  cykan: "var(--cykan)",
  gold: "var(--gold)",
  neutral: "var(--text-decor-25, var(--border-default))",
};

const TONE_BG: Record<TileTone, string> = {
  cykan: "var(--cykan-surface)",
  gold: "var(--gold-surface)",
  neutral: "var(--surface-1)",
};

export function QuickActionsGrid({ data }: QuickActionsGridProps) {
  const router = useRouter();
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const { runningSpecs, runSuggestion } = useRunReportSuggestion(activeThreadId);
  const setMode = useStageStore((s) => s.setMode);
  const setVoiceActive = useVoiceStore((s) => s.setVoiceActive);

  const tiles: Tile[] = useMemo(() => {
    const list: Tile[] = [];

    // 1. Suggestions ML (cykan)
    for (const s of data.suggestions.slice(0, 3)) {
      list.push({
        id: `sug-${s.id}`,
        eyebrow: `Suggéré · ${s.requiredApps[0] ?? "système"}`,
        title: s.title,
        tone: "cykan",
        status: s.status,
        loading: runningSpecs.has(s.id),
        onClick: () => void runSuggestion(s.id, s.title),
      });
    }

    // 2. Favoris (gold)
    for (const f of data.favoriteReports.slice(0, 3)) {
      list.push({
        id: `fav-${f.id}`,
        eyebrow: `Favori · ${f.domain}`,
        title: f.title,
        tone: "gold",
        status: null,
        loading: runningSpecs.has(f.id),
        onClick: () => void runSuggestion(f.id, f.title),
      });
    }

    // 3. Universelles (neutral) — toujours présentes pour combler jusqu'à 6
    const universals: Tile[] = [
      {
        id: "u-compose",
        eyebrow: "Composer",
        title: "Nouveau message",
        tone: "neutral",
        status: null,
        loading: false,
        onClick: () => setMode({ mode: "chat" }),
      },
      {
        id: "u-voice",
        eyebrow: "Voice",
        title: "Brief vocal",
        tone: "neutral",
        status: null,
        loading: false,
        onClick: () => {
          setVoiceActive(true);
          setMode({ mode: "voice" });
        },
      },
      {
        id: "u-mission",
        eyebrow: "Mission",
        title: "Planifier une mission",
        tone: "neutral",
        status: null,
        loading: false,
        onClick: () => router.push("/missions"),
      },
    ];
    for (const u of universals) {
      if (list.length >= 6) break;
      list.push(u);
    }

    return list.slice(0, 6);
  }, [data.suggestions, data.favoriteReports, runningSpecs, runSuggestion, setMode, setVoiceActive, router]);

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="Actions rapides">
      <SectionHeader label="Actions rapides" />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
          gap: "var(--space-2)",
          flex: 1,
          minHeight: 0,
        }}
      >
        {tiles.map((t, idx) => (
          <button
            key={t.id}
            type="button"
            onClick={t.onClick}
            disabled={t.loading}
            className="group flex h-full min-h-0 flex-col gap-2 overflow-hidden text-left transition-colors duration-(--duration-base) ease-(--ease-standard) disabled:opacity-60 disabled:cursor-wait focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cykan)]"
            style={{
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              background: TONE_BG[t.tone],
              border: `1px solid ${TONE_BORDER[t.tone]}`,
            }}
          >
            {/* Pas de justify-between sur le même axe qu’un line-clamp (-webkit-box) : chevauchement WebKit. */}
            <span className="shrink-0 t-10 font-medium text-[var(--text-faint)] truncate leading-tight">
              {t.eyebrow}
            </span>
            <div className="min-h-0 flex-1 overflow-hidden">
              <p className="t-13 font-medium leading-snug text-[var(--text-l1)] transition-colors line-clamp-2 group-hover:text-[var(--cykan)]">
                {t.loading ? "…" : t.title}
              </p>
            </div>
            <div
              className="mt-auto flex shrink-0 items-center justify-between gap-2"
              style={{
                paddingTop: "var(--space-2)",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <span className="t-9 font-light text-[var(--text-faint)]">
                {t.status === "ready"
                  ? "Prêt"
                  : t.status === "partial"
                    ? "Partiel"
                    : "\u00a0"}
              </span>
              <span className="t-9 font-mono tabular-nums text-[var(--text-faint)]">{idx + 1}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
