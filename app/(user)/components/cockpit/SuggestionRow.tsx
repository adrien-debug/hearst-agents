"use client";

/**
 * SuggestionRow — Action row "lance ce report" pour le cockpit.
 *
 * Pattern repris du CockpitInbox.SuggestionRow existant : un POST sur
 * /api/v2/reports/[specId]/run, navigation focal asset au succès. Sortie
 * en composant standalone pour pouvoir réutiliser hors inbox.
 */

import { useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";
import { toast } from "@/app/hooks/use-toast";

export interface SuggestionRowProps {
  specId: string;
  title: string;
  description: string;
  status: "ready" | "partial";
  missingApps: ReadonlyArray<string>;
  requiredCount: number;
  onLaunched?: () => void;
}

export function SuggestionRow(props: SuggestionRowProps) {
  const setStageMode = useStageStore((s) => s.setMode);
  const [isLaunching, setIsLaunching] = useState(false);

  const isReady = props.status === "ready";
  const connected = props.requiredCount - props.missingApps.length;

  const onClick = async () => {
    if (isLaunching) return;
    setIsLaunching(true);

    try {
      const res = await fetch(`/api/v2/reports/${encodeURIComponent(props.specId)}/run`, {
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
              { id: data.assetId, name: data.title ?? props.title, type: "report" },
              null,
            ),
          );
        setStageMode({ mode: "asset", assetId: data.assetId });
      }
      toast.success("Report lancé", props.title);
      props.onLaunched?.();
    } catch (err) {
      setIsLaunching(false);
      toast.error("Échec lancement", err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLaunching}
      data-testid={`cockpit-suggestion-${props.specId}`}
      data-suggestion-status={props.status}
      className="halo-suggestion flex items-center justify-between text-left disabled:opacity-50"
      style={{
        padding: "var(--space-4)",
        gap: "var(--space-4)",
        borderLeft: "2px solid var(--cykan)",
      }}
    >
      <div className="flex-1 min-w-0">
        <p
          className="t-13 truncate"
          style={{ fontWeight: 500, color: "var(--text-l0)" }}
        >
          {props.title}
        </p>
        <p
          className="t-11 truncate"
          style={{ color: "var(--text-faint)", marginTop: "var(--space-1)" }}
        >
          {props.description}
        </p>
      </div>

      <span
        className="t-9 font-medium shrink-0"
        style={{ color: isReady ? "var(--cykan)" : "var(--text-faint)" }}
      >
        {isLaunching
          ? "lance…"
          : isReady
            ? "lancer"
            : `${connected}/${props.requiredCount}`}
      </span>
    </button>
  );
}
