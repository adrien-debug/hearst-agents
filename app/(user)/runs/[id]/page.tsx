"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { RunTimeline } from "../../components/RunTimeline";
import type { RunRecord } from "@/lib/runtime/runs/types";
import type { RunEvent } from "@/lib/events/types";

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    async function loadRun() {
      try {
        const res = await fetch(`/api/v2/runs/${runId}`);
        if (!res.ok) throw new Error("Failed to load run");
        const data = await res.json();
        setRun(data.run);
        setEvents(data.run?.events || []);
        setIsLive(data.run?.status === "running");
      } catch (error) {
        console.error("Failed to load run:", error);
      } finally {
        setLoading(false);
      }
    }

    loadRun();

    // Poll for updates if run is live
    if (isLive) {
      const interval = setInterval(loadRun, 2000);
      return () => clearInterval(interval);
    }
  }, [runId, isLive]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 text-sm">Chargement...</div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-white/40 text-sm mb-4">Run non trouvé</div>
        <button
          onClick={() => router.push("/")}
          className="text-cyan-400 hover:text-cyan-300 text-sm"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  const statusColors = {
    running: "text-cyan-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => router.back()}
            className="text-white/40 hover:text-white/60 text-sm"
          >
            ← Retour
          </button>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">Run {run.id.slice(0, 8)}...</h1>
            <p className="text-sm text-white/40">{run.input}</p>
          </div>
          <span className={`text-sm font-medium ${statusColors[run.status]}`}>
            {run.status === "running" && "En cours"}
            {run.status === "completed" && "Terminé"}
            {run.status === "failed" && "Échoué"}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-medium text-white/60 uppercase tracking-wider">
              Timeline
            </h2>
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <RunTimeline events={events} isLive={isLive} />
            </div>
          </div>

          {/* Sidebar info */}
          <div className="space-y-4">
            {/* Metrics */}
            {run.metrics && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                <h3 className="text-sm font-medium text-white/60 mb-3">Métriques</h3>
                <div className="space-y-2">
                  {run.metrics.tokensIn !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Tokens in</span>
                      <span className="text-white">{run.metrics.tokensIn}</span>
                    </div>
                  )}
                  {run.metrics.tokensOut !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Tokens out</span>
                      <span className="text-white">{run.metrics.tokensOut}</span>
                    </div>
                  )}
                  {run.metrics.costUsd !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Coût</span>
                      <span className="text-white">${run.metrics.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {run.metrics.latencyMs !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Latence</span>
                      <span className="text-white">{run.metrics.latencyMs}ms</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Assets */}
            {run.assets && run.assets.length > 0 && (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
                <h3 className="text-sm font-medium text-white/60 mb-3">Assets</h3>
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
                        <p className="text-sm text-white truncate">{asset.name}</p>
                        <p className="text-xs text-white/40">{asset.type}</p>
                      </div>
                      <span className="text-xs text-cyan-400">→</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/60 mb-3">Informations</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Backend</span>
                  <span className="text-white">{run.backend || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Mode</span>
                  <span className="text-white">{run.executionMode || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Créé</span>
                  <span className="text-white">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                {run.completedAt && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Terminé</span>
                    <span className="text-white">
                      {new Date(run.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {run.status === "failed" && (
                <button className="flex-1 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 rounded-lg text-sm font-medium transition-colors">
                  Relancer
                </button>
              )}
              <button className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-white/60 rounded-lg text-sm transition-colors border border-white/[0.08]">
                Sauvegarder comme mission
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
