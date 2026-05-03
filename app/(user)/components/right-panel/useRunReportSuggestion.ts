"use client";

import { useState, useCallback } from "react";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useStageStore } from "@/stores/stage";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { toast } from "@/app/hooks/use-toast";

export interface UseRunReportSuggestion {
  runningSpecs: Set<string>;
  runSuggestion: (specId: string, title: string) => Promise<void>;
}

/**
 * Hook partagé : déclenche un report du catalogue (POST
 * `/api/v2/reports/[specId]/run`), état de chargement par `specId`, ouverture
 * du focal sur l'asset.
 *
 * Câblage :
 * - L’API ne persiste l’asset que si `threadId` est fourni → sans thread
 *   actif, on crée un thread « Rapports » (même principe qu’un premier envoi
 *   chat) pour obtenir un `assetId` et l’enregistrer côté `storeAsset`.
 * - Le focal (préview report) n’est rendu que dans `ChatStage` → depuis le
 *   mode `cockpit`, on bascule vers `chat` avec ce thread pour afficher le
 *   rapport sans changer le comportement quand on est déjà en conversation.
 */
export function useRunReportSuggestion(
  activeThreadId: string | null,
): UseRunReportSuggestion {
  const [runningSpecs, setRunningSpecs] = useState<Set<string>>(new Set());

  const runSuggestion = useCallback(
    async (specId: string, title: string) => {
      setRunningSpecs((prev) => new Set(prev).add(specId));

      const nav = useNavigationStore.getState();
      let threadId = activeThreadId;
      let createdThreadForThisRun = false;
      if (!threadId) {
        threadId = nav.addThread("Rapports", nav.surface);
        createdThreadForThisRun = true;
      }

      try {
        const res = await fetch(
          `/api/v2/reports/${encodeURIComponent(specId)}/run`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threadId }),
            credentials: "include",
          },
        );
        if (!res.ok) {
          const detail = await res
            .json()
            .then((j) => (typeof j?.error === "string" ? j.error : ""))
            .catch(() => "");
          throw new Error(
            detail ? `HTTP ${res.status} — ${detail}` : `HTTP ${res.status}`,
          );
        }
        const data = (await res.json()) as {
          assetId: string | null;
          title: string;
        };
        if (data.assetId) {
          useFocalStore.getState().setFocal(
            assetToFocal(
              { id: data.assetId, name: data.title ?? title, type: "report" },
              threadId,
            ),
          );
          if (useStageStore.getState().current.mode === "cockpit") {
            useStageStore.getState().setMode({ mode: "chat", threadId });
          }
          toast.success("Report généré", data.title ?? title);
        } else {
          console.warn(
            "[useRunReportSuggestion] run OK but assetId null",
            specId,
          );
          toast.success("Rapport calculé", "Aucun asset enregistré (vérifie la persistance).");
        }
      } catch (err) {
        if (createdThreadForThisRun) {
          nav.removeThread(threadId);
        }
        toast.error(
          "Échec génération",
          err instanceof Error ? err.message : "Erreur inconnue",
        );
      } finally {
        setRunningSpecs((prev) => {
          const next = new Set(prev);
          next.delete(specId);
          return next;
        });
      }
    },
    [activeThreadId],
  );

  return { runningSpecs, runSuggestion };
}
