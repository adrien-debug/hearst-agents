"use client";

import { useEffect, useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { useSession } from "next-auth/react";
import type { FocalObject, FocalStatus } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";
import { FocalRetryButton } from "./FocalRetryButton";
import { ReportLayout, isReportPayload } from "./ReportLayout";

/**
 * Detects whether an asset content string is a renderable HTML document.
 * Heuristic — looks for a <html>/<!doctype>/<body> root, or recognizable tags.
 */
function isHtmlContent(content: string): boolean {
  const head = content.trim().slice(0, 200).toLowerCase();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.includes("<body") ||
    /<\/?(div|section|main|header|footer|p|span|h[1-6])\b/i.test(head)
  );
}

/**
 * Tente de parser un asset content en payload report. Renvoie null si le
 * contenu n'est pas un JSON ou ne porte pas le marqueur __reportPayload.
 */
function tryParseReportPayload(content: string): ReturnType<typeof JSON.parse> | null {
  const head = content.trim().slice(0, 50);
  if (!head.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(content);
    return isReportPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

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

  // Asset preview — fetched on demand when the focal originates from an asset.
  // The right-panel API only ships {id,name,type} for assets; the full content
  // lives behind /api/v2/assets/[id]. We fetch lazily on focal change.
  const sourceAssetId = focal.sourceAssetId;
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Reset preview au changement d'asset — pattern "Adjusting state on prop
  // change" appliqué au render. Évite cascade de renders d'un useEffect dédié.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [trackedAssetId, setTrackedAssetId] = useState<string | undefined>(sourceAssetId);
  if (trackedAssetId !== sourceAssetId) {
    setTrackedAssetId(sourceAssetId);
    setPreviewContent(null);
    setPreviewLoading(!!sourceAssetId);
  }

  useEffect(() => {
    if (!sourceAssetId) return;
    let cancelled = false;
    fetch(`/api/v2/assets/${encodeURIComponent(sourceAssetId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const content = (data?.asset?.content as string | undefined) ?? null;
        setPreviewContent(content);
      })
      .catch(() => {
        if (!cancelled) setPreviewContent(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => { cancelled = true; };
  }, [sourceAssetId]);

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

  const isLive = focal.status === "composing" || focal.status === "delivering";
  return (
    <div className="w-full">
      <header className="flex items-center justify-between mb-10 pb-6 border-b border-[var(--surface-2)]">
        <div className="flex items-center gap-6">
          <span className={`w-2 h-2 rounded-pill ${STATUS_COLORS[focal.status]} ${isLive ? "animate-pulse halo-dot" : ""}`} />
          <div className="flex items-center gap-4">
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">{TYPE_LABELS[focal.type]}</span>
            <span className="w-1 h-1 rounded-pill bg-[var(--text-ghost)]" />
            <span className={`t-9 font-mono uppercase tracking-marquee ${focal.status === "awaiting_approval" ? "text-[var(--warn)]" : focal.status === "failed" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
              {STATUS_LABELS[focal.status]}
            </span>
          </div>
        </div>
        <div className="font-mono t-9 uppercase tracking-marquee text-[var(--text-ghost)]">
          {focal.sourcePlanId && (
            <span>ID: {focal.sourcePlanId.slice(0, 8)}</span>
          )}
        </div>
      </header>

      <h1 className="t-28 font-medium text-[var(--text)] mb-10 tracking-tight" style={{ lineHeight: "var(--leading-snug)" }}>{focal.title}</h1>

      {focal.body && (
        <div className="prose prose-invert max-w-none">
          <div className="t-15 leading-[1.7] text-[var(--text-muted)] font-normal whitespace-pre-wrap">{focal.body}</div>
        </div>
      )}

      {!focal.body && focal.summary && (
        <p className="t-15 leading-[1.7] text-[var(--text-muted)] font-normal">{focal.summary}</p>
      )}

      {focal.sections && focal.sections.length > 0 && (
        <div className="mt-16 space-y-10">
          {focal.sections.map((section, i) => (
            <div key={i} className="border-t border-[var(--surface-2)] pt-8">
              {section.heading && (
                <h3 className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)] halo-cyan-sm mb-4">{section.heading}</h3>
              )}
              <div className="t-15 leading-[1.7] text-[var(--text-muted)] font-normal">{section.body}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 p-4 bg-[var(--danger)]/5 border-l-2 border-[var(--danger)] font-mono t-10 tracking-display text-[var(--danger)]">
          {error}
        </div>
      )}

      {sourceAssetId && (previewLoading || previewContent) && (
        <div className="mt-12 pt-8 border-t border-[var(--surface-2)]">
          <div className="flex items-center gap-3 mb-4">
            <span className="t-9 font-mono uppercase tracking-marquee text-[var(--cykan)]">Aperçu</span>
            {previewLoading && (
              <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">chargement…</span>
            )}
          </div>
          {previewContent && tryParseReportPayload(previewContent) ? (
            <ReportLayout payload={tryParseReportPayload(previewContent)!} />
          ) : previewContent && isHtmlContent(previewContent) ? (
            <iframe
              title={focal.title}
              srcDoc={previewContent}
              sandbox="allow-same-origin"
              className="w-full rounded-sm border border-[var(--surface-2)] bg-white"
              style={{ height: "var(--space-32)", minHeight: "320px" }}
            />
          ) : previewContent ? (
            <pre className="t-13 font-mono leading-[1.5] text-[var(--text-soft)] bg-[var(--surface-1)] rounded-sm p-4 overflow-auto whitespace-pre-wrap" style={{ maxHeight: "var(--space-32)" }}>
              {previewContent}
            </pre>
          ) : null}
        </div>
      )}

      <footer className="mt-12 pt-8 border-t border-[var(--surface-2)] flex items-center justify-between">
        <div className="flex items-center gap-6 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
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
              className="px-6 py-3 t-9 font-mono uppercase tracking-marquee bg-[var(--cykan)] text-[var(--bg)] hover:tracking-[0.4em] transition-all duration-slow"
            />
          ) : (
            <button
              className={`px-6 py-3 t-9 font-mono uppercase tracking-marquee transition-all duration-slow hover:tracking-[0.4em] ${
                focal.primaryAction.kind === "approve"
                  ? "bg-[var(--text)] text-[var(--bg)]"
                  : "bg-[var(--cykan)] text-[var(--bg)]"
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
          <span className="block t-34 text-[var(--cykan)] opacity-30 halo-cyan-md mb-8 animate-pulse">◉</span>
          <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">Waiting_For_Data</p>
        </div>
      </div>
    );
  }

  if (compact) {
return (
    <div className="max-w-none px-8 py-6 bg-gradient-to-br from-[var(--mat-300)] via-[var(--bg-soft)] to-[var(--surface)]">
      <FocalContent focal={focal} onActionComplete={handleActionComplete} />
    </div>
  );
  }

  return (
    <div className="h-full w-full bg-gradient-to-br from-[var(--mat-300)] via-[var(--bg-soft)] to-[var(--surface)]">
      <div className="max-w-4xl mx-auto px-12 py-12 min-h-full">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    </div>
  );
}
