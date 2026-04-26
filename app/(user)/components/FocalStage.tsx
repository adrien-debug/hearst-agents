"use client";

import { useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useSession } from "next-auth/react";
import type { FocalObject, FocalStatus } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";
import { FocalRetryButton } from "./FocalRetryButton";

// Status labels for user-facing display
const STATUS_LABELS: Record<FocalStatus, string> = {
  composing: "En rédaction",
  ready: "Prêt",
  awaiting_approval: "Validation requise",
  delivering: "Envoi en cours",
  delivered: "Envoyé",
  active: "Actif",
  paused: "En pause",
  failed: "Échoué",
};

// Status colors for visual indicators
const STATUS_COLORS: Record<FocalStatus, string> = {
  composing: "bg-cyan-400",
  ready: "bg-emerald-400",
  awaiting_approval: "bg-amber-400",
  delivering: "bg-blue-400",
  delivered: "bg-emerald-500",
  active: "bg-emerald-400",
  paused: "bg-yellow-400",
  failed: "bg-red-400",
};

// Type labels for user-facing display
const TYPE_LABELS: Record<FocalObject["type"], string> = {
  message_draft: "Message",
  message_receipt: "Message envoyé",
  brief: "Synthèse",
  outline: "Plan",
  report: "Rapport",
  doc: "Document",
  watcher_draft: "Surveillance",
  watcher_active: "Surveillance active",
  mission_draft: "Mission",
  mission_active: "Mission active",
};

function FocalContent({ focal, onActionComplete }: { focal: FocalObject; onActionComplete: () => void }) {
  const { data: session } = useSession();
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePrimaryAction = async () => {
    if (!focal.primaryAction) return;

    const kind = focal.primaryAction.kind;
    setIsLoading(true);
    setError(null);

    try {
      let response: Response;

      if (kind === "approve") {
        // Approve plan
        if (!focal.sourcePlanId) {
          throw new Error("Missing plan ID for approval");
        }
        const threadId = activeThreadId ?? focal.threadId;
        if (!threadId) {
          throw new Error("Missing thread ID for approval");
        }
        response = await fetch(`/api/v2/plans/${focal.sourcePlanId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
            userId: session?.user?.email ?? "anonymous",
            connectedProviders: [],
          }),
        });
      } else if (kind === "pause" && focal.missionId) {
        // Pause mission
        response = await fetch(`/api/v2/missions/${focal.missionId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else if (kind === "resume" && focal.missionId) {
        // Resume mission
        response = await fetch(`/api/v2/missions/${focal.missionId}/resume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else {
        throw new Error(`Unsupported action: ${kind}`);
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `Action failed: ${response.status}`);
      }

      // Refresh focal state
      onActionComplete();
    } catch (err) {
      console.error("[FocalStage] Action failed:", err);
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Document header — editorial, minimal */}
      <header className="flex items-center justify-between mb-10 pb-4 border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <div
            className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[focal.status]} ${focal.status === "composing" || focal.status === "delivering" ? "animate-pulse" : ""}`}
            style={focal.status === "composing" || focal.status === "delivering" ? { boxShadow: "0 0 8px var(--cykan)" } : undefined}
          />
          <div className="flex items-center gap-2 text-xs">
            <span className="uppercase tracking-wider text-[var(--text-muted)] font-medium">{TYPE_LABELS[focal.type]}</span>
            <span className="text-[var(--text-faint)]">·</span>
            <span className={`${focal.status === "awaiting_approval" ? "text-[var(--warn)]" : focal.status === "failed" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
              {STATUS_LABELS[focal.status]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 halo-mono-meta">
          {focal.sourcePlanId && (
            <span className="text-[10px] text-[var(--text-faint)]">plan:{focal.sourcePlanId.slice(0, 6)}</span>
          )}
        </div>
      </header>

      {/* Title — principal document heading */}
      <h1 className="text-2xl font-semibold text-[var(--text)] leading-tight mb-8 tracking-tight">{focal.title}</h1>

      {/* Body content — improved readability */}
      {focal.body && (
        <div className="prose prose-invert max-w-none">
          <div className="halo-body whitespace-pre-wrap">{focal.body}</div>
        </div>
      )}

      {!focal.body && focal.summary && (
        <p className="halo-body">{focal.summary}</p>
      )}

      {/* Sections — editorial spacing with Halo borders */}
      {focal.sections && focal.sections.length > 0 && (
        <div className="mt-10 space-y-8">
          {focal.sections.map((section, i) => (
            <div key={i} className="border-l-2 border-[var(--line)] pl-4">
              {section.heading && (
                <h3 className="halo-mono-label mb-3">{section.heading}</h3>
              )}
              <p className="halo-body">{section.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-8 p-3 rounded bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Document footer — minimal metadata + action */}
      <footer className="mt-12 pt-6 border-t border-[var(--line)] flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
          {focal.wordCount ? <span>{focal.wordCount} mots</span> : null}
          {focal.provider ? <span>via {focal.provider}</span> : null}
        </div>

        {/* Primary action — contextual, minimal */}
        {focal.primaryAction ? (
          focal.primaryAction.kind === "retry" ? (
            <FocalRetryButton
              missionId={focal.missionId}
              sourcePlanId={focal.sourcePlanId}
              threadId={focal.threadId ?? activeThreadId ?? undefined}
              focalTitle={focal.title}
              focalObjectType={focal.type}
              focalStatus={focal.status}
              label={focal.primaryAction.label}
              onSuccess={onActionComplete}
              className="px-5 py-2.5 text-sm font-medium bg-[var(--cykan)] text-black hover:bg-[var(--cykan)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-lg"
            />
          ) : (
            <button
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                focal.primaryAction.kind === "approve"
                  ? "bg-[var(--warn)] text-black hover:bg-[var(--warn)]/90 disabled:opacity-50"
                  : focal.primaryAction.kind === "pause"
                  ? "bg-yellow-500 text-black hover:bg-yellow-500/90 disabled:opacity-50"
                  : focal.primaryAction.kind === "resume"
                  ? "bg-[var(--money)] text-black hover:bg-[var(--money)]/90 disabled:opacity-50"
                  : "bg-[var(--cykan)] text-black hover:bg-[var(--cykan)]/90 disabled:opacity-50"
              }`}
              onClick={handlePrimaryAction}
              disabled={isLoading}
            >
              {isLoading ? "…" : focal.primaryAction.label}
            </button>
          )
        ) : null}
      </footer>
    </div>
  );
}

interface FocalStageProps {
  compact?: boolean;
}

export function FocalStage({ compact = false }: FocalStageProps = {}) {
  const focal = useFocalStore((s) => s.focal);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const hydrateThreadState = useFocalStore((s) => s.hydrateThreadState);

  const handleActionComplete = async () => {
    // Refresh focal state from API
    if (!activeThreadId) return;

    try {
      const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
      if (res.ok) {
        const data = await res.json();

        // Use shared utility from lib/core/types/focal
        const mappedFocal = data.focalObject ? mapFocalObject(data.focalObject, activeThreadId) : null;
        const secondary: FocalObject[] = [];
        if (data.secondaryObjects && Array.isArray(data.secondaryObjects)) {
          for (const obj of data.secondaryObjects) {
            const mapped = mapFocalObject(obj, activeThreadId);
            if (mapped) secondary.push(mapped);
          }
        }
        // Atomic rehydratation without full page reload
        hydrateThreadState(mappedFocal, secondary.slice(0, 3));
      }
    } catch (_err) {
      // Silent fail - focal state remains unchanged
    }
  };

  if (!focal) {
    if (compact) return null;
    return (
      <div className="flex-1 flex items-center justify-center halo-idle-glow">
        <div className="text-center relative z-10">
          <div
            className="w-16 h-16 flex items-center justify-center mx-auto mb-4 animate-halo-breathe"
            style={{
              background: "linear-gradient(180deg, rgba(0,229,255,0.08) 0%, transparent 100%)",
              border: "1px solid rgba(0,229,255,0.15)",
            }}
          >
            <span className="text-2xl text-[var(--cykan)]" style={{ textShadow: "0 0 12px rgba(0,229,255,0.5)" }}>◉</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">En attente de contenu...</p>
          <p className="text-xs text-[var(--text-faint)] mt-2">Commencez une conversation dans le champ ci-dessous</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="max-w-none">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--bg)]">
      <div className="max-w-3xl mx-auto px-8 py-12 min-h-full">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    </div>
  );
}
