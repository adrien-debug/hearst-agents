"use client";

/**
 * FocalRetryButton — Shared retry action component
 *
 * Handles retry logic for failed focal objects (missions, plans, runs).
 * Used by FocalStage and RightPanelContent for consistency.
 */

import { useState } from "react";
import { toast } from "@/app/hooks/use-toast";
import { consumeOrchestrateSseResponse } from "@/lib/engine/orchestrator/consume-sse-response";

interface FocalRetryButtonProps {
  /** Mission ID if focal is a mission */
  missionId?: string;
  /** Source plan ID if focal is derived from a plan */
  sourcePlanId?: string;
  /** Thread ID for orchestrate (conversation scope) */
  threadId?: string;
  /** Fields for canonical `focal_context` on POST /api/orchestrate */
  focalTitle?: string;
  focalObjectType?: string;
  focalStatus?: string;
  /** Optional: callback after successful retry */
  onSuccess?: () => void;
  /** Optional: custom label */
  label?: string;
  /** Optional: custom className for styling */
  className?: string;
  /** Optional: compact mode (smaller button) */
  compact?: boolean;
}

function buildFocalContext(params: {
  sourcePlanId?: string;
  threadId?: string;
  focalTitle?: string;
  focalObjectType?: string;
  focalStatus?: string;
}): { id: string; objectType: string; title: string; status: string } | undefined {
  const { sourcePlanId, threadId, focalTitle, focalObjectType, focalStatus } = params;
  if (!sourcePlanId && !threadId) return undefined;

  const id = sourcePlanId ?? threadId ?? "unknown";
  const objectType =
    focalObjectType?.trim() ||
    (sourcePlanId ? "execution_plan" : "thread");

  return {
    id,
    objectType,
    title: (focalTitle ?? "Focal").slice(0, 200),
    status: focalStatus ?? "failed",
  };
}

export function FocalRetryButton({
  missionId,
  sourcePlanId,
  threadId,
  focalTitle,
  focalObjectType,
  focalStatus,
  onSuccess,
  label = "Réessayer",
  className,
  compact = false,
}: FocalRetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      if (missionId) {
        const res = await fetch(`/api/v2/missions/${missionId}/run`, {
          method: "POST",
          credentials: "include",
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || "Mission retry failed");
        }

        toast.success("Mission relancée", "La mission a été redémarrée avec succès");
        onSuccess?.();
        return;
      }

      if (sourcePlanId || threadId) {
        const focal_context = buildFocalContext({
          sourcePlanId,
          threadId,
          focalTitle,
          focalObjectType,
          focalStatus,
        });

        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            message: "Reprends depuis la dernière erreur",
            thread_id: threadId,
            focal_context,
          }),
        });

        const outcome = await consumeOrchestrateSseResponse(res);
        if (!outcome.ok) {
          throw new Error(outcome.error);
        }

        toast.success("Reprise lancée", "Le système va réessayer l'opération");
        onSuccess?.();
        return;
      }

      toast.warning("Réessai non disponible", "Impossible de déterminer comment réessayer cette opération");
    } catch (error) {
      console.error("[FocalRetryButton] Retry failed:", error);
      toast.error("Échec du réessai", error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsRetrying(false);
    }
  };

  const baseClasses = compact
    ? "px-4 py-2 text-[10px] font-mono font-black uppercase tracking-[0.2em]"
    : "px-8 py-4 text-[11px] font-mono font-black uppercase tracking-[0.3em]";

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={isRetrying}
      className={
        className ||
        `${baseClasses} bg-[var(--cykan)] hover:tracking-[0.5em] text-black transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl`
      }
      title={isRetrying ? "Réessai en cours..." : "Réessayer l'opération"}
    >
      {isRetrying ? "..." : label}
    </button>
  );
}
