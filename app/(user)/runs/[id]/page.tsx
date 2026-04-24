"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { RunTimeline } from "../../components/RunTimeline";
import type { RunRecord } from "@/lib/runtime/runs/types";
import type { TimelineItem } from "@/lib/runtime/timeline/types";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [run, setRun] = useState<RunRecord | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineSource, setTimelineSource] = useState<"memory" | "persistent" | "empty">("empty");
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  // Track run status locally to avoid including entire run object in effect deps
  const runStatus = run?.status;

  useEffect(() => {
    let isActive = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function loadRun() {
      try {
        const res = await fetch(`/api/v2/runs/${runId}`);
        if (!res.ok) throw new Error("Failed to load run");
        const data = await res.json();
        if (!isActive) return;
        setRun(data.run);
        // Use canonical normalized timeline from API
        setTimeline(data.timeline || []);
        setTimelineSource(data.timelineSource || "empty");
        const liveStatuses = ["running", "awaiting_approval", "awaiting_clarification"];
        setIsLive(liveStatuses.includes(data.run?.status));
      } catch (error) {
        console.error("Failed to load run:", error);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadRun();

    // Poll for updates if run is live (including waiting states)
    const liveStatuses = ["running", "awaiting_approval", "awaiting_clarification"];
    if (runStatus && liveStatuses.includes(runStatus)) {
      interval = setInterval(loadRun, 2000);
    }

    return () => {
      isActive = false;
      if (interval) clearInterval(interval);
    };
  }, [runId, runStatus]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="text-[var(--text-muted)] text-sm">Chargement...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: "var(--bg)" }}>
        <div className="text-[var(--text-muted)] text-sm mb-4">Run non trouvé</div>
        <button
          onClick={() => router.push("/")}
          className="text-[var(--cykan)] hover:text-[var(--cykan)]/80 text-sm"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    running: "text-cyan-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
    awaiting_approval: "text-amber-400",
    awaiting_clarification: "text-violet-400",
  };

  const statusLabels: Record<string, string> = {
    running: "En cours",
    completed: "Terminé",
    failed: "Échoué",
    awaiting_approval: "Validation requise",
    awaiting_clarification: "Précision requise",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => router.back()}
            className="text-[var(--text-muted)] hover:text-[var(--text-soft)] text-sm"
          >
            ← Retour
          </button>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-[var(--text)] mb-1">Run {run.id.slice(0, 8)}...</h1>
            <p className="text-sm text-[var(--text-muted)]">{run.input}</p>
          </div>
          <span className={`text-sm font-medium ${statusColors[run.status] || "text-[var(--text-muted)]"}`}>
            {statusLabels[run.status] || run.status}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Timeline
              </h2>
              {timelineSource !== "empty" && (
                <span className="text-xs text-[var(--text-faint)]">
                  {timelineSource === "memory" ? "Live" : "Persisted"}
                </span>
              )}
            </div>
            <div className="bg-white/[0.02] border border-[var(--line)] rounded-xl p-4">
              <RunTimeline timeline={timeline} isLive={isLive} />
            </div>
          </div>

          {/* Sidebar info */}
          <div className="space-y-4">
            {/* Metrics */}
            {run.metrics && (
              <div className="bg-white/[0.02] border border-[var(--line)] rounded-xl p-4">
                <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Métriques</h3>
                <div className="space-y-2">
                  {run.metrics.tokensIn !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-faint)]">Tokens in</span>
                      <span className="text-[var(--text)]">{run.metrics.tokensIn}</span>
                    </div>
                  )}
                  {run.metrics.tokensOut !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-faint)]">Tokens out</span>
                      <span className="text-[var(--text)]">{run.metrics.tokensOut}</span>
                    </div>
                  )}
                  {run.metrics.costUsd !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-faint)]">Coût</span>
                      <span className="text-[var(--text)]">${run.metrics.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {run.metrics.latencyMs !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-faint)]">Latence</span>
                      <span className="text-[var(--text)]">{run.metrics.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assets */}
            {run.assets && run.assets.length > 0 && (
              <div className="bg-white/[0.02] border border-[var(--line)] rounded-xl p-4">
                <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Assets</h3>
                <div className="space-y-2">
                  {run.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.05] cursor-pointer"
                      onClick={() => router.push(`/assets/${asset.id}`)}
                    >
                      <span className="text-lg">
                        {asset.type === "pdf" ? "📄" : asset.type === "excel" ? "📊" : "📁"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] truncate">{asset.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{asset.type}</p>
                      </div>
                      <span className="text-xs text-[var(--cykan)]">→</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-white/[0.02] border border-[var(--line)] rounded-xl p-4">
              <h3 className="text-sm font-medium text-[var(--text-muted)] mb-3">Informations</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Backend</span>
                  <span className="text-[var(--text)]">{run.backend || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Mode</span>
                  <span className="text-[var(--text)]">{run.executionMode || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-faint)]">Créé</span>
                  <span className="text-[var(--text)]">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                {run.completedAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-faint)]">Terminé</span>
                    <span className="text-[var(--text)]">
                      {new Date(run.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {run.status === "failed" && (
                <button className="flex-1 py-2 bg-[var(--cykan)]/15 hover:bg-[var(--cykan)]/25 text-[var(--cykan)] rounded-lg text-sm font-medium transition-colors">
                  Relancer
                </button>
              )}
              <button className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[var(--text-muted)] rounded-lg text-sm transition-colors border border-white/[0.08]">
                Sauvegarder comme mission
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
