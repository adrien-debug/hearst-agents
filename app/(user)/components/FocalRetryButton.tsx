"use client";

/**
 * FocalRetryButton — Shared retry action component
 *
 * Handles retry logic for failed focal objects (missions, plans, runs).
 * Used by FocalStage and RightPanelContent for consistency.
 */

import { useState } from "react";
import { toast } from "@/app/hooks/use-toast";

interface FocalRetryButtonProps {
  /** Mission ID if focal is a mission */
  missionId?: string;
  /** Source plan ID if focal is derived from a plan */
  sourcePlanId?: string;
  /** Thread ID for orchestrate fallback */
  threadId?: string;
  /** Optional: callback after successful retry */
  onSuccess?: () => void;
  /** Optional: custom label */
  label?: string;
  /** Optional: custom className for styling */
  className?: string;
  /** Optional: compact mode (smaller button) */
  compact?: boolean;
}

export function FocalRetryButton({
  missionId,
  sourcePlanId,
  threadId,
  onSuccess,
  label = "Réessayer",
  className,
  compact = false,
}: FocalRetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);

    try {
      // Strategy 1: Mission retry
      if (missionId) {
        const res = await fetch(`/api/v2/missions/${missionId}/run`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Mission retry failed");
        }

        toast.success("Mission relancée", "La mission a été redémarrée avec succès");
        onSuccess?.();
        return;
      }

      // Strategy 2: Plan/Run retry via orchestrate
      if (sourcePlanId || threadId) {
        const res = await fetch("/api/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Reprends depuis la dernière erreur",
            thread_id: threadId,
            focal_context: sourcePlanId ? { sourcePlanId } : undefined,
          }),
        });

        if (!res.ok) {
          throw new Error("Orchestrate retry failed");
        }

        toast.success("Reprise lancée", "Le système va réessayer l'opération");
        onSuccess?.();
        return;
      }

      // No retry strategy available
      toast.warning("Réessai non disponible", "Impossible de déterminer comment réessayer cette opération");
    } catch (error) {
      console.error("[FocalRetryButton] Retry failed:", error);
      toast.error("Échec du réessai", error instanceof Error ? error.message : "Une erreur est survenue");
    } finally {
      setIsRetrying(false);
    }
  };

  const baseClasses = compact
    ? "px-3 py-1.5 text-xs"
    : "px-4 py-2 text-sm";

  return (
    <button
      onClick={handleRetry}
      disabled={isRetrying}
      className={
        className ||
        `${baseClasses} bg-[var(--cykan)] hover:bg-[var(--cykan)]/90 text-black rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`
      }
      title={isRetrying ? "Réessai en cours..." : "Réessayer l'opération"}
    >
      {isRetrying ? "…" : label}
    </button>
  );
}
