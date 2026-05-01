"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { RunTimeline } from "../../components/RunTimeline";
import { GhostIconChevronRight, ServiceIdGlyph } from "../../components/ghost-icons";
import { PageHeader } from "../../components/PageHeader";
import { usePollingEffect } from "@/app/hooks/use-polling-effect";
import type { RunRecord } from "@/lib/engine/runtime/runs/types";
import type { TimelineItem } from "@/lib/engine/runtime/timeline/types";

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

  const loadRun = async () => {
    try {
      const res = await fetch(`/api/v2/runs/${runId}`);
      if (!res.ok) throw new Error("Failed to load run");
      const data = await res.json();
      setRun(data.run);
      setTimeline(data.timeline || []);
      setTimelineSource(data.timelineSource || "empty");
      const liveStatuses = ["running", "awaiting_approval", "awaiting_clarification"];
      setIsLive(liveStatuses.includes(data.run?.status));
    } catch (error) {
      console.error("Failed to load run:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    void loadRun();
  }, [runId]);

  // Poll only when run is live (running / awaiting_approval / awaiting_clarification)
  const liveStatuses = ["running", "awaiting_approval", "awaiting_clarification"];
  const shouldPoll = !!runStatus && liveStatuses.includes(runStatus);
  usePollingEffect(loadRun, 2000, [runId], { enabled: shouldPoll });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg-elev)" }}>
        <div className="text-[var(--text-muted)] t-13">Chargement…</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8" style={{ background: "var(--bg-elev)" }}>
        <div className="text-[var(--text-muted)] t-13 mb-4">Run non trouvé</div>
        <button
          onClick={() => router.push("/")}
          className="text-[var(--cykan)] hover:text-[var(--cykan)]/80 t-13"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    running: "text-[var(--cykan)]",
    completed: "text-[var(--money)]",
    failed: "text-[var(--danger)]",
    awaiting_approval: "text-[var(--warn)]",
    awaiting_clarification: "text-[var(--text-muted)]",
  };

  const statusLabels: Record<string, string> = {
    running: "En cours",
    completed: "Terminé",
    failed: "Échoué",
    awaiting_approval: "Validation requise",
    awaiting_clarification: "Précision requise",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-elev)" }}>
      <PageHeader
        title={`Run ${run.id.slice(0, 8)}…`}
        subtitle={run.input}
        back={{ label: "Retour aux runs", href: "/runs" }}
        actions={
          <span className={`t-13 font-medium ${statusColors[run.status] || "text-[var(--text-muted)]"}`}>
            {statusLabels[run.status] || run.status}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto px-12 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="t-13 font-medium text-[var(--text-l1)]">
                Timeline
              </h2>
              {timelineSource !== "empty" && (
                <span className="t-9 text-[var(--text-faint)]">
                  {timelineSource === "memory" ? "Live" : "Persisted"}
                </span>
              )}
            </div>
            <div className="border-t border-[var(--line)] p-4 bg-[var(--bg)]">
              <RunTimeline timeline={timeline} isLive={isLive} />
            </div>
          </div>

          {/* Sidebar info */}
          <div className="space-y-4">
            {/* Metrics */}
            {run.metrics && (
              <div className="border-t border-[var(--line)] p-4 bg-[var(--bg)]">
                <h3 className="ghost-meta-label mb-4">Metrics</h3>
                <div className="space-y-2">
                  {run.metrics.tokensIn !== undefined && (
                    <div className="flex justify-between t-13">
                      <span className="text-[var(--text-faint)]">Tokens in</span>
                      <span className="text-[var(--text)]">{run.metrics.tokensIn}</span>
                    </div>
                  )}
                  {run.metrics.tokensOut !== undefined && (
                    <div className="flex justify-between t-13">
                      <span className="text-[var(--text-faint)]">Tokens out</span>
                      <span className="text-[var(--text)]">{run.metrics.tokensOut}</span>
                    </div>
                  )}
                  {run.metrics.costUsd !== undefined && (
                    <div className="flex justify-between t-13">
                      <span className="text-[var(--text-faint)]">Coût</span>
                      <span className="text-[var(--text)]">${run.metrics.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {run.metrics.latencyMs !== undefined && (
                    <div className="flex justify-between t-13">
                      <span className="text-[var(--text-faint)]">Latence</span>
                      <span className="text-[var(--text)]">{run.metrics.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assets */}
            {run.assets && run.assets.length > 0 && (
              <div className="border-t border-[var(--line)] p-4 bg-[var(--bg)]">
                <h3 className="ghost-meta-label mb-4">Assets</h3>
                <div className="divide-y divide-[var(--line)]">
                  {run.assets.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-[var(--bg-soft)]"
                      onClick={() => router.push(`/assets/${asset.id}`)}
                    >
                      <ServiceIdGlyph id={asset.id} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="t-13 text-[var(--text)] truncate">{asset.name}</p>
                        <p className="t-9 font-light text-[var(--text-muted)]">{asset.type}</p>
                      </div>
                      <GhostIconChevronRight className="w-4 h-4 shrink-0 text-[var(--cykan)]" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="border-t border-[var(--line)] p-4 bg-[var(--bg)]">
              <h3 className="ghost-meta-label mb-4">Info</h3>
              <div className="space-y-2 t-13">
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

          </div>
        </div>
      </div>
    </div>
  );
}
