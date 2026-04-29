"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { Breadcrumb, type Crumb } from "../components/Breadcrumb";
import { RelativeTime } from "../components/RelativeTime";

interface RunListItem {
  id: string;
  input: string;
  surface: string;
  executionMode?: string;
  agentId?: string;
  backend?: string;
  missionId?: string;
  status: string;
  createdAt: number;
  completedAt?: number;
  assetCount: number;
  metrics?: { tokens?: number; durationMs?: number };
}

const STATUS_COLOR: Record<string, string> = {
  succeeded: "bg-[var(--money)]",
  success: "bg-[var(--money)]",
  failed: "bg-[var(--danger)]",
  running: "bg-[var(--cykan)] animate-pulse halo-dot",
  awaiting_approval: "bg-[var(--warn)]",
  awaiting_clarification: "bg-[var(--warn)]",
  cancelled: "bg-[var(--text-ghost)]",
  idle: "bg-[var(--text-ghost)]",
};

const STATUS_LABEL: Record<string, string> = {
  succeeded: "OK",
  success: "OK",
  failed: "FAIL",
  running: "RUN",
  awaiting_approval: "WAIT",
  awaiting_clarification: "WAIT",
  cancelled: "CXL",
  idle: "IDLE",
};

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${(s % 60).toString().padStart(2, "0")}`;
}

export default function RunsPage() {
  const router = useRouter();
  const addThread = useNavigationStore((s) => s.addThread);
  const setStageMode = useStageStore((s) => s.setMode);
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const handleNewReport = () => {
    const id = addThread("Nouveau report", "home");
    setStageMode({ mode: "chat", threadId: id });
    router.push("/");
  };

  useEffect(() => {
    async function loadRuns() {
      try {
        const res = await fetch("/api/v2/runs?limit=50");
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs || []);
        }
      } catch (_err) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="t-11 font-mono tracking-marquee uppercase text-[var(--text-faint)] animate-pulse">
          Chargement des runs…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <Breadcrumb trail={[{ label: "Hearst", href: "/" }, { label: "Runs" }] as Crumb[]} className="mb-4" />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="ghost-title-impact mb-1">Runs</h1>
            <p className="t-11 font-mono uppercase tracking-display text-[var(--text-muted)]">
              {runs.length} {runs.length === 1 ? "exécution" : "exécutions"} récente{runs.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" onClick={handleNewReport} className="ghost-btn-solid ghost-btn-cykan rounded-sm px-5">
            Nouveau report
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-5xl mx-auto">
          {runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
              <p className="t-9 font-mono tracking-marquee uppercase text-[var(--text-faint)]">EMPTY_LOG</p>
              <p className="t-13 text-[var(--text-muted)] max-w-md leading-relaxed">
                Aucun run pour l&apos;instant. Toutes les exécutions de tes prompts et missions apparaîtront ici.
              </p>
            </div>
          ) : (
            <div className="border-y border-[var(--surface-2)]">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] gap-x-6 px-2 py-3 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] border-b border-[var(--surface-2)]">
                <span className="w-2" />
                <span>Input / Source</span>
                <span className="text-right">Status</span>
                <span className="text-right">Assets</span>
                <span className="text-right">Duration</span>
                <span className="text-right">When</span>
              </div>

              {runs.map((run) => {
                const statusKey = run.status?.toLowerCase() ?? "idle";
                const dotClass = STATUS_COLOR[statusKey] || "bg-[var(--text-ghost)]";
                const statusLabel = STATUS_LABEL[statusKey] || statusKey.toUpperCase().slice(0, 5);
                return (
                  <div
                    key={run.id}
                    onClick={() => router.push(`/runs/${run.id}`)}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] gap-x-6 items-center px-2 py-4 hover:bg-[var(--surface-1)] transition-colors border-b border-[var(--surface-2)] group cursor-pointer"
                    title={`Open run ${run.id.slice(0, 8)}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-pill shrink-0 ${dotClass}`} />
                    <div className="min-w-0">
                      <p className="t-13 text-[var(--text-soft)] group-hover:text-[var(--cykan)] group-hover:halo-cyan-sm transition-colors truncate">
                        {run.input || `Run ${run.id.slice(0, 8)}`}
                      </p>
                      <p className="t-9 font-mono tracking-display uppercase text-[var(--text-ghost)] mt-1">
                        {run.surface || "—"}
                        {run.missionId ? ` · MISSION ${run.missionId.slice(0, 6)}` : ""}
                        {run.executionMode ? ` · ${run.executionMode}` : ""}
                      </p>
                    </div>
                    <span className={`t-9 font-mono tracking-display uppercase text-right ${
                      statusKey === "running" ? "text-[var(--cykan)]" :
                      statusKey === "failed" ? "text-[var(--danger)]" :
                      statusKey === "succeeded" || statusKey === "success" ? "text-[var(--money)]" :
                      "text-[var(--text-faint)]"
                    }`}>
                      {statusLabel}
                    </span>
                    <span className="t-9 font-mono tracking-display text-[var(--text-faint)] text-right">
                      {run.assetCount > 0 ? `${run.assetCount}×` : "—"}
                    </span>
                    <span className="t-9 font-mono text-[var(--text-faint)] text-right">
                      {formatDuration(run.metrics?.durationMs)}
                    </span>
                    <RelativeTime
                      ts={run.createdAt}
                      className="t-9 font-mono tracking-display text-[var(--text-ghost)] uppercase text-right"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
