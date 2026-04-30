"use client";

/**
 * QuickLaunch — CTA principal du cockpit.
 *
 * Bouton primaire "Lancer une mission" qui ouvre le Commandeur (Cmd+K) +
 * 3 reports favoris en pills de raccourci. Pas de friction : un click =
 * une action utile.
 */

import { useState } from "react";
import { useStageStore } from "@/stores/stage";
import { useFocalStore } from "@/stores/focal";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";
import { toast } from "@/app/hooks/use-toast";

export interface QuickLaunchProps {
  favoriteReports: ReadonlyArray<{ id: string; title: string; domain: string }>;
}

export function QuickLaunch({ favoriteReports }: QuickLaunchProps) {
  const setCommandeurOpen = useStageStore((s) => s.setCommandeurOpen);
  const setStageMode = useStageStore((s) => s.setMode);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const launchReport = async (specId: string, title: string) => {
    if (pendingId) return;
    setPendingId(specId);
    try {
      const res = await fetch(`/api/v2/reports/${encodeURIComponent(specId)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { assetId: string | null; title: string };

      if (data.assetId && !isPlaceholderAssetId(data.assetId)) {
        useFocalStore
          .getState()
          .setFocal(
            assetToFocal(
              { id: data.assetId, name: data.title ?? title, type: "report" },
              null,
            ),
          );
        setStageMode({ mode: "asset", assetId: data.assetId });
      }
      toast.success("Report lancé", title);
    } catch (err) {
      toast.error("Échec lancement", err instanceof Error ? err.message : "Erreur");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      <button
        type="button"
        onClick={() => setCommandeurOpen(true)}
        data-testid="cockpit-quick-launch"
        className="card-depth flex items-center justify-between text-left w-full"
        style={{
          padding: "var(--space-5) var(--space-6)",
          cursor: "pointer",
        }}
      >
        <div className="flex flex-col" style={{ gap: "var(--space-1)" }}>
          <span
            className="t-15"
            style={{ fontWeight: 500, color: "var(--text-l0)" }}
          >
            Lancer une mission
          </span>
          <span
            className="t-11"
            style={{ color: "var(--text-faint)" }}
          >
            Décris ton intention, Hearst orchestre.
          </span>
        </div>
        <span
          className="t-9 font-mono uppercase"
          style={{
            letterSpacing: "var(--tracking-marquee)",
            color: "var(--cykan)",
          }}
        >
          ⌘K
        </span>
      </button>

      {favoriteReports.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}>
          {favoriteReports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => launchReport(r.id, r.title)}
              disabled={pendingId !== null}
              data-testid={`cockpit-favorite-${r.id}`}
              className="rounded-pill flex items-center transition-colors disabled:opacity-50"
              style={{
                padding: "var(--space-2) var(--space-4)",
                gap: "var(--space-2)",
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-l1)",
                cursor: "pointer",
                transitionDuration: "var(--duration-base)",
                transitionTimingFunction: "var(--ease-standard)",
              }}
            >
              <span className="t-11" style={{ fontWeight: 500 }}>
                {pendingId === r.id ? "lance…" : r.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
