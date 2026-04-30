"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useStageStore } from "@/stores/stage";
import { useNavigationStore } from "@/stores/navigation";
import { RelativeTime } from "../components/RelativeTime";
import { RowActions, type RowAction } from "../components/RowActions";
import { ConfirmModal } from "../components/ConfirmModal";
import { PageHeader } from "../components/PageHeader";

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

// ── Icons (16×16 — tokens only) ─────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-5.83" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleNewReport = () => {
    const id = addThread("Nouveau report", "home");
    setStageMode({ mode: "chat", threadId: id });
    router.push("/");
  };

  const handleOpen = useCallback(
    (runId: string) => {
      router.push(`/runs/${runId}`);
    },
    [router],
  );

  const handleRerun = useCallback(async (runId: string) => {
    setActionError(null);
    setPendingAction(`rerun-${runId}`);
    try {
      const res = await fetch(`/api/v2/runs/${runId}/rerun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { error?: string }).error ?? `Re-run échoué (${res.status})`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setPendingAction(null);
    }
  }, []);

  const handleExport = useCallback((runId: string) => {
    // Le navigateur déclenche le téléchargement via Content-Disposition.
    window.open(`/api/v2/runs/${runId}/export`, "_blank", "noopener,noreferrer");
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    const runId = confirmDeleteId;
    setActionError(null);
    setPendingAction(`delete-${runId}`);
    try {
      const res = await fetch(`/api/v2/runs/${runId}`, { method: "DELETE" });
      if (res.ok) {
        setRuns((prev) => prev.filter((r) => r.id !== runId));
        setConfirmDeleteId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError((data as { error?: string }).error ?? `Suppression échouée (${res.status})`);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setPendingAction(null);
    }
  }, [confirmDeleteId]);

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
      <PageHeader
        title="Runs"
        subtitle={`${runs.length} ${runs.length === 1 ? "exécution récente" : "exécutions récentes"}`}
        breadcrumb={[{ label: "Hearst", href: "/" }, { label: "Runs" }]}
        actions={
          <button type="button" onClick={handleNewReport} className="font-mono t-10 uppercase tracking-section text-[var(--cykan)] border-b border-[var(--cykan)] pb-[2px] bg-transparent hover:text-[var(--text)] hover:border-[var(--text)] transition-colors">
            Nouveau report
          </button>
        }
      />

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
            <div>
              {actionError && (
                <div
                  data-testid="runs-action-error"
                  className="t-9 font-mono uppercase tracking-marquee mb-3 px-2 py-2 border"
                  style={{
                    color: "var(--danger)",
                    background: "var(--surface-1)",
                    borderColor: "var(--danger)",
                    borderRadius: "var(--radius-xs)",
                  }}
                >
                  {actionError}
                </div>
              )}
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 px-2 py-3 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)] border-b border-[var(--border-soft)]">
                <span className="w-2" />
                <span>Entrée</span>
                <span className="text-right">Statut</span>
                <span className="text-right">Assets</span>
                <span className="text-right">Durée</span>
                <span className="text-right">Quand</span>
                <span className="text-right">Actions</span>
              </div>

              {runs.map((run) => {
                const statusKey = run.status?.toLowerCase() ?? "idle";
                const dotClass = STATUS_COLOR[statusKey] || "bg-[var(--text-ghost)]";
                const statusLabel = STATUS_LABEL[statusKey] || statusKey.toUpperCase().slice(0, 5);
                const isPendingRerun = pendingAction === `rerun-${run.id}`;
                const isPendingDelete = pendingAction === `delete-${run.id}`;
                const actions: RowAction[] = [
                  {
                    id: "open",
                    label: "Voir détail",
                    onClick: () => handleOpen(run.id),
                    icon: <EyeIcon />,
                  },
                  {
                    id: "rerun",
                    label: "Re-run",
                    onClick: () => handleRerun(run.id),
                    icon: <RefreshIcon />,
                    disabled: isPendingRerun || isPendingDelete,
                  },
                  {
                    id: "export",
                    label: "Export trace",
                    onClick: () => handleExport(run.id),
                    icon: <DownloadIcon />,
                  },
                  {
                    id: "delete",
                    label: "Supprimer",
                    onClick: () => setConfirmDeleteId(run.id),
                    icon: <TrashIcon />,
                    variant: "danger",
                    disabled: isPendingRerun || isPendingDelete,
                  },
                ];
                return (
                  <div
                    key={run.id}
                    onClick={() => handleOpen(run.id)}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] gap-x-6 items-center px-2 py-4 border-b border-[var(--border-soft)] group cursor-pointer transition-colors"
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
                    <div className="flex justify-end">
                      <RowActions actions={actions} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Supprimer ce run ?"
        description="L'historique du run sera retiré de cette liste. La trace persistante sera nettoyée au prochain refresh côté serveur."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={pendingAction !== null && pendingAction.startsWith("delete-")}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
