"use client";

import { useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useSession } from "next-auth/react";
import type { FocalObject, FocalStatus } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";
import { FocalRetryButton } from "./FocalRetryButton";

const STATUS_LABELS: Record<FocalStatus, string> = {
  composing: "COMPOSING_",
  ready: "READY_",
  awaiting_approval: "AWAITING_APPROVAL_",
  delivering: "DELIVERING_",
  delivered: "DELIVERED_",
  active: "ACTIVE_",
  paused: "PAUSED_",
  failed: "FAILED_",
};

const STATUS_COLORS: Record<FocalStatus, string> = {
  composing: "bg-[var(--cykan)]",
  ready: "bg-[var(--cykan)]",
  awaiting_approval: "bg-[var(--warn)]",
  delivering: "bg-[var(--cykan)]",
  delivered: "bg-[var(--cykan)]",
  active: "bg-[var(--cykan)]",
  paused: "bg-[var(--warn)]",
  failed: "bg-[var(--danger)]",
};

const TYPE_LABELS: Record<FocalObject["type"], string> = {
  message_draft: "MSG_DRAFT",
  message_receipt: "MSG_RECEIPT",
  brief: "BRIEF_DATA",
  outline: "OUTLINE_REF",
  report: "REPORT_LOG",
  doc: "DOC_SPEC",
  watcher_draft: "WATCHER_DRAFT",
  watcher_active: "WATCHER_ACTIVE",
  mission_draft: "MISSION_DRAFT",
  mission_active: "MISSION_ACTIVE",
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
        if (!focal.sourcePlanId) throw new Error("Missing plan ID");
        const threadId = activeThreadId ?? focal.threadId;
        if (!threadId) throw new Error("Missing thread ID");
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
        response = await fetch(`/api/v2/missions/${focal.missionId}/pause`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } else if (kind === "resume" && focal.missionId) {
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
      onActionComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <header className="flex items-center justify-between mb-20 pb-10 border-b border-white/[0.05]">
        <div className="flex items-center gap-8">
          <div
            className={`w-2 h-2 rounded-full ${STATUS_COLORS[focal.status]} ${focal.status === "composing" || focal.status === "delivering" ? "animate-pulse" : ""}`}
            style={focal.status === "composing" || focal.status === "delivering" ? { boxShadow: "0 0 15px var(--cykan)" } : undefined}
          />
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-mono font-black uppercase tracking-[0.6em] text-white/20">{TYPE_LABELS[focal.type]}</span>
            <span className="w-1 h-1 rounded-full bg-white/5" />
            <span className={`text-[11px] font-mono font-black uppercase tracking-[0.6em] ${focal.status === "awaiting_approval" ? "text-[var(--warn)]" : focal.status === "failed" ? "text-[var(--danger)]" : "text-white/40"}`}>
              {STATUS_LABELS[focal.status]}
            </span>
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-white/10">
          {focal.sourcePlanId && (
            <span>PLAN_ID: {focal.sourcePlanId.slice(0, 12)}</span>
          )}
        </div>
      </header>

      <h1 className="text-[56px] font-black text-white leading-[1] mb-16 tracking-tighter uppercase">{focal.title}</h1>

      {focal.body && (
        <div className="prose prose-invert max-w-none">
          <div className="text-[19px] leading-[1.8] text-white/80 font-normal whitespace-pre-wrap">{focal.body}</div>
        </div>
      )}

      {!focal.body && focal.summary && (
        <p className="text-[19px] leading-[1.8] text-white/80 font-normal">{focal.summary}</p>
      )}

      {focal.sections && focal.sections.length > 0 && (
        <div className="mt-24 space-y-16">
          {focal.sections.map((section, i) => (
            <div key={i} className="border-t border-white/[0.05] pt-12">
              {section.heading && (
                <h3 className="text-[11px] font-mono font-black uppercase tracking-[0.8em] text-[var(--cykan)] mb-8 opacity-50">{section.heading}</h3>
              )}
              <div className="text-[17px] leading-[1.8] text-white/70 font-normal">{section.body}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-12 p-6 bg-[var(--danger)]/5 border-l-2 border-[var(--danger)] font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--danger)]">
          ERROR_LOG: {error}
        </div>
      )}

      <footer className="mt-20 pt-10 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-8 text-[9px] font-mono uppercase tracking-[0.2em] text-white/10">
          {focal.wordCount ? <span>METRIC: {focal.wordCount}_WORDS</span> : null}
          {focal.provider ? <span>SOURCE: {focal.provider}</span> : null}
        </div>

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
              className="px-8 py-4 text-[11px] font-mono font-black uppercase tracking-[0.3em] bg-[var(--cykan)] text-black hover:tracking-[0.5em] transition-all duration-500 shadow-2xl"
            />
          ) : (
            <button
              className={`px-8 py-4 text-[11px] font-mono font-black uppercase tracking-[0.3em] transition-all duration-500 hover:tracking-[0.5em] shadow-2xl ${
                focal.primaryAction.kind === "approve"
                  ? "bg-white text-black"
                  : "bg-[var(--cykan)] text-black"
              }`}
              onClick={handlePrimaryAction}
              disabled={isLoading}
            >
              {isLoading ? "..." : focal.primaryAction.label}
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
    if (!activeThreadId) return;
    try {
      const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
      if (res.ok) {
        const data = await res.json();
        const mappedFocal = data.focalObject ? mapFocalObject(data.focalObject, activeThreadId) : null;
        const secondary: FocalObject[] = [];
        if (data.secondaryObjects && Array.isArray(data.secondaryObjects)) {
          for (const obj of data.secondaryObjects) {
            const mapped = mapFocalObject(obj, activeThreadId);
            if (mapped) secondary.push(mapped);
          }
        }
        hydrateThreadState(mappedFocal, secondary.slice(0, 3));
      }
    } catch (_err) {}
  };

  if (!focal) {
    if (compact) return null;
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center relative z-10">
          <div
            className="w-24 h-24 flex items-center justify-center mx-auto mb-8 animate-pulse"
            style={{
              background: "radial-gradient(circle, rgba(163,255,0,0.1) 0%, transparent 70%)",
            }}
          >
            <span className="text-4xl text-[var(--cykan)] opacity-20">◉</span>
          </div>
          <p className="text-[10px] font-mono font-black uppercase tracking-[0.5em] text-white/10">Waiting_For_Data</p>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="max-w-none px-10 py-10">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-black">
      <div className="max-w-5xl mx-auto px-16 py-20 min-h-full">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    </div>
  );
}
