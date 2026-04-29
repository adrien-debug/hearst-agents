"use client";

import { useState, useCallback } from "react";
import { useFocalStore } from "@/stores/focal";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { toast } from "@/app/hooks/use-toast";

export interface UseRunReportSuggestion {
  runningSpecs: Set<string>;
  runSuggestion: (specId: string, title: string) => Promise<void>;
}

/**
 * Hook partagé entre GeneralDashboard et AssetsGrid : déclenche un report
 * du catalogue (POST /api/v2/reports/[specId]/run), maintient la liste des
 * specs en cours pour masquage optimistic, ouvre le focal sur l'asset
 * généré.
 */
export function useRunReportSuggestion(
  activeThreadId: string | null,
): UseRunReportSuggestion {
  const [runningSpecs, setRunningSpecs] = useState<Set<string>>(new Set());

  const runSuggestion = useCallback(
    async (specId: string, title: string) => {
      setRunningSpecs((prev) => new Set(prev).add(specId));
      try {
        const res = await fetch(
          `/api/v2/reports/${encodeURIComponent(specId)}/run`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threadId: activeThreadId ?? undefined }),
            credentials: "include",
          },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          assetId: string | null;
          title: string;
        };
        if (data.assetId) {
          useFocalStore.getState().setFocal(
            assetToFocal(
              { id: data.assetId, name: data.title ?? title, type: "report" },
              activeThreadId,
            ),
          );
        }
        toast.success("Report généré", title);
      } catch (err) {
        setRunningSpecs((prev) => {
          const next = new Set(prev);
          next.delete(specId);
          return next;
        });
        toast.error(
          "Échec génération",
          err instanceof Error ? err.message : "Erreur inconnue",
        );
      }
    },
    [activeThreadId],
  );

  return { runningSpecs, runSuggestion };
}
