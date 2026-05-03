"use client";

import { useEffect, useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import type { FocalObject, FocalStatus } from "@/lib/core/types";
import { mapFocalObject } from "@/lib/core/types/focal";
import { FocalRetryButton } from "./FocalRetryButton";
import { ReportLayout } from "./ReportLayout";
import { AssetVariantTabs } from "./AssetVariantTabs";
import { isHtmlContent, tryParseReportPayload } from "@/lib/assets/content-parser";
import { ResearchReportArticle } from "./reports/ResearchReportArticle";
import { Action } from "./ui";

const STATUS_LABELS: Record<FocalStatus, string> = {
  composing: "Composition",
  ready: "Prêt",
  awaiting_approval: "Validation",
  delivering: "Livraison",
  delivered: "Livré",
  active: "Actif",
  paused: "En pause",
  failed: "Échec",
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
  message_draft: "Brouillon",
  message_receipt: "Message",
  brief: "Brief",
  outline: "Plan",
  report: "Rapport",
  doc: "Document",
  watcher_draft: "Watcher (brouillon)",
  watcher_active: "Watcher actif",
  mission_draft: "Mission (brouillon)",
  mission_active: "Mission active",
};

function FocalContent({ focal, onActionComplete }: { focal: FocalObject; onActionComplete: () => void }) {
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
        // Anti-pattern banni : ne pas envoyer d'identifiant utilisateur
        // depuis le frontend. Le backend résout via requireScope().userId.
        response = await fetch(`/api/v2/plans/${focal.sourcePlanId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId,
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
          <span className={`w-2 h-2 rounded-pill ${STATUS_COLORS[focal.status]} ${isLive ? "animate-pulse" : ""}`} />
          <div className="flex items-center gap-4">
            <span className="t-13 font-medium text-[var(--text-l1)]">{TYPE_LABELS[focal.type]}</span>
            <span className="w-1 h-1 rounded-pill bg-[var(--text-ghost)]" />
            <span className={`t-13 font-light ${focal.status === "awaiting_approval" ? "text-[var(--warn)]" : focal.status === "failed" ? "text-[var(--danger)]" : "text-[var(--text-faint)]"}`}>
              {STATUS_LABELS[focal.status]}
            </span>
          </div>
        </div>
        <div className="t-11 font-mono tabular-nums text-[var(--text-faint)]">
          {focal.sourcePlanId && (
            <span>Réf {focal.sourcePlanId.slice(0, 8)}</span>
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
                <h3 className="t-13 font-medium text-[var(--text-l1)] mb-4">{section.heading}</h3>
              )}
              <div className="t-15 leading-[1.7] text-[var(--text-muted)] font-normal">{section.body}</div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-8 p-4 bg-[var(--danger)]/5 border-l-2 border-[var(--danger)] t-13 font-light text-[var(--danger)]">
          {error}
        </div>
      )}

      {sourceAssetId && (previewLoading || previewContent) && (
        <div className="mt-12 pt-8 border-t border-[var(--surface-2)]">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="t-13 font-medium text-[var(--text-l1)]">Aperçu</span>
            {previewLoading && (
              <span className="t-11 font-light text-[var(--text-faint)]">Chargement…</span>
            )}
          </div>
          {previewContent && tryParseReportPayload(previewContent) ? (
            <ReportLayout payload={tryParseReportPayload(previewContent)!} />
          ) : previewContent && isHtmlContent(previewContent) ? (
            <iframe
              title={focal.title}
              srcDoc={previewContent}
              sandbox="allow-same-origin"
              className="w-full rounded-sm border border-[var(--surface-2)] bg-[var(--bg-light-stage)]"
              style={{ height: "var(--space-32)", minHeight: "var(--height-focal-min)" }}
            />
          ) : previewContent ? (
            <ResearchReportArticle content={previewContent} />
          ) : null}
        </div>
      )}

      {sourceAssetId && (
        <div className="mt-12">
          <AssetVariantTabs
            assetId={sourceAssetId}
            sourceText={focal.body ?? focal.summary ?? focal.title}
          />
        </div>
      )}

      <footer className="mt-12 pt-8 border-t border-[var(--surface-2)] flex items-center justify-between">
        <div className="flex items-center gap-6 t-11 font-light text-[var(--text-faint)]">
          {focal.wordCount ? <span>{focal.wordCount} mots</span> : null}
          {focal.provider ? <span>Source · {focal.provider}</span> : null}
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
              className="px-6 py-3 t-13 font-medium bg-[var(--cykan)] text-[var(--text-on-cykan)] transition-colors duration-base hover:opacity-90"
            />
          ) : (
            <Action
              variant="primary"
              tone={focal.primaryAction.kind === "approve" ? "neutral" : "brand"}
              onClick={handlePrimaryAction}
              loading={isLoading}
            >
              {focal.primaryAction.label}
            </Action>
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
    } catch {}
  };

  if (!focal) {
    if (compact) return null;
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center relative z-10">
          <span className="block t-34 text-[var(--cykan)] opacity-30 mb-8 animate-pulse">◉</span>
          <p className="t-11 font-light text-[var(--text-faint)]">Waiting_For_Data</p>
        </div>
      </div>
    );
  }

  if (compact) {
return (
    <div className="max-w-none px-8 py-6 bg-[var(--bg-soft)]">
      <FocalContent focal={focal} onActionComplete={handleActionComplete} />
    </div>
  );
  }

  return (
    <div className="h-full w-full bg-[var(--bg-soft)]">
      <div className="max-w-4xl mx-auto px-12 py-12 min-h-full">
        <FocalContent focal={focal} onActionComplete={handleActionComplete} />
      </div>
    </div>
  );
}
