"use client";

import { ReactNode, useState } from "react";
import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";
import { ConfirmModal } from "../ConfirmModal";

interface GeneralDashboardProps {
  assets?: unknown;
  missions?: unknown;
  onViewChange?: (view: "reports" | "missions" | "assets") => void;
  activeThreadId?: string | null;
  loading?: boolean;
}

interface DashboardAsset {
  id: string;
  name?: string;
  title?: string;
  type?: string;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p
      className="t-13 uppercase"
      style={{
        fontWeight: 300,
        letterSpacing: "var(--tracking-section)",
        color: "var(--text-l2)",
      }}
    >
      {children}
    </p>
  );
}

function SectionHead({
  label,
  action,
}: {
  label: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ marginBottom: "var(--space-8)" }}
    >
      <Label>{label}</Label>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="t-13 uppercase transition-colors duration-emphasis ease-out-soft hover:text-[var(--cykan)]"
          style={{
            fontWeight: 300,
            letterSpacing: "var(--tracking-section)",
            color: "var(--text-l2)",
            background: "transparent",
          }}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}

const ReportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const DocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

function Row({
  icon,
  label,
  meta,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dash-row group"
    >
      {icon && <span className="dash-row-icon">{icon}</span>}
      <span className="dash-row-label">{label}</span>
      {meta && <span className="dash-row-meta">{meta}</span>}
    </button>
  );
}

/**
 * AssetRow — ligne asset avec actions hover (open / share / delete).
 *
 * Pattern aligné sur MissionRow : div role=button cliquable + icon-buttons
 * en sibling, visibles au hover (opacity-0 → 1).
 */
function AssetRow({
  asset,
  onOpen,
  onShare,
  onDelete,
}: {
  asset: DashboardAsset;
  onOpen: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="dash-row group"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ position: "relative" }}
    >
      <span className="dash-row-icon">
        {asset.type === "report" ? <ReportIcon /> : <DocIcon />}
      </span>
      <span className="dash-row-label">{asset.name || asset.title || "Asset"}</span>
      <span
        className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        style={{ gap: "var(--space-2)" }}
      >
        <IconButton
          label="Open"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          testId={`dashboard-asset-open-${asset.id}`}
        >
          <OpenIcon />
        </IconButton>
        <IconButton
          label="Share"
          onClick={(e) => {
            e.stopPropagation();
            onShare();
          }}
          testId={`dashboard-asset-share-${asset.id}`}
        >
          <ShareIcon />
        </IconButton>
        <IconButton
          label="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          testId={`dashboard-asset-delete-${asset.id}`}
        >
          <TrashIcon />
        </IconButton>
      </span>
      <span className="dash-row-meta">{(asset.type || "file").toUpperCase()}</span>
    </div>
  );
}

const OpenIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 3h7v7" />
    <path d="M21 3l-9 9" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
);

const ShareIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.59 13.51l6.83 3.98" />
    <path d="M15.41 6.51l-6.82 3.98" />
  </svg>
);

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

interface DashboardMission {
  id: string;
  name: string;
  enabled?: boolean;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
}

/**
 * MissionRow — ligne d'une mission active avec actions hover.
 *
 * Pour respecter la sémantique HTML (pas de bouton dans bouton), la ligne
 * elle-même est un <div role="button"> cliquable, et les icon-buttons sont
 * de vrais <button> en sibling. Les actions n'apparaissent qu'au hover
 * (opacity-0 group-hover:opacity-100) ou au focus (focus-within).
 */
function MissionRow({
  mission,
  onOpen,
  onAction,
  pendingId,
}: {
  mission: DashboardMission;
  onOpen: () => void;
  onAction: (action: "run" | "toggle" | "edit", m: DashboardMission) => void;
  pendingId: string | null;
}) {
  const isPending = pendingId === mission.id;
  const enabled = mission.enabled !== false;
  const meta = enabled ? "armed" : "paused";
  return (
    <div
      className="dash-row group"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ position: "relative" }}
    >
      <span className="dash-row-label">{mission.name}</span>
      <span
        className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        style={{ gap: "var(--space-2)" }}
      >
        <IconButton
          label="Run now"
          onClick={(e) => {
            e.stopPropagation();
            onAction("run", mission);
          }}
          disabled={isPending}
          testId={`dashboard-mission-run-${mission.id}`}
        >
          <PlayIcon />
        </IconButton>
        <IconButton
          label={enabled ? "Pause" : "Resume"}
          onClick={(e) => {
            e.stopPropagation();
            onAction("toggle", mission);
          }}
          disabled={isPending}
          testId={`dashboard-mission-toggle-${mission.id}`}
        >
          {enabled ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton
          label="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onAction("edit", mission);
          }}
          disabled={isPending}
          testId={`dashboard-mission-edit-${mission.id}`}
        >
          <EditIcon />
        </IconButton>
      </span>
      <span className="dash-row-meta">{meta}</span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="flex items-center justify-center text-[var(--text-l3)] hover:text-[var(--cykan)] focus-visible:text-[var(--cykan)] focus-visible:outline-none transition-colors"
      style={{
        width: "var(--space-6)",
        height: "var(--space-6)",
        background: "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const PlayIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
  </svg>
);

const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

function EmptyText({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-mono uppercase"
      style={{
        fontSize: "10px",
        letterSpacing: "var(--tracking-label)",
        color: "var(--text-l3)",
        padding: "var(--space-3) 0",
      }}
    >
      {children}
    </p>
  );
}

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
}: GeneralDashboardProps) {
  const setFocal = useFocalStore((s) => s.setFocal);
  const setStageMode = useStageStore((s) => s.setMode);
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null);
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DashboardAsset | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleAssetShare = async (asset: DashboardAsset) => {
    if (!asset.id || isPlaceholderAssetId(asset.id)) return;
    try {
      const r = await fetch(`/api/reports/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ assetId: asset.id, ttlHours: 168 }),
      });
      if (!r.ok) {
        flash(`Erreur partage · HTTP ${r.status}`);
        return;
      }
      const json = (await r.json()) as { shareUrl?: string };
      if (json.shareUrl) {
        await navigator.clipboard?.writeText(json.shareUrl);
        flash("Lien copié");
      }
    } catch {
      flash("Partage injoignable");
    }
  };

  const handleAssetDelete = async (asset: DashboardAsset) => {
    if (!asset.id) return;
    setPendingAssetId(asset.id);
    try {
      const r = await fetch(`/api/v2/assets/${encodeURIComponent(asset.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        flash(`Erreur suppression · HTTP ${r.status}`);
        return;
      }
      flash("Asset supprimé");
      setConfirmDelete(null);
    } finally {
      setPendingAssetId(null);
    }
  };

  const assetsCount = Array.isArray(_assets) ? _assets.length : 0;
  const missionsCount = Array.isArray(_missions) ? _missions.length : 0;
  const reportsCount = Array.isArray(_assets)
    ? (_assets as DashboardAsset[]).filter((a) => a.type === "report").length
    : 0;
  const recentAssets = Array.isArray(_assets) ? (_assets as DashboardAsset[]).slice(0, 4) : [];
  const activeMissions = Array.isArray(_missions)
    ? (_missions as DashboardMission[])
    : [];

  const handleMissionAction = async (
    action: "run" | "toggle" | "edit",
    m: DashboardMission,
  ) => {
    if (!m.id) return;
    if (action === "edit") {
      setStageMode({ mode: "mission", missionId: m.id });
      return;
    }
    setPendingMissionId(m.id);
    try {
      if (action === "run") {
        await fetch(`/api/v2/missions/${m.id}/run`, {
          method: "POST",
          credentials: "include",
        });
      } else if (action === "toggle") {
        const next = m.enabled === false;
        await fetch(`/api/v2/missions/${m.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
      }
    } catch (err) {
      console.error("[GeneralDashboard] mission action failed:", err);
    } finally {
      setPendingMissionId(null);
    }
  };

  const handleAssetClick = (asset: DashboardAsset) => {
    if (!asset.id || isPlaceholderAssetId(asset.id)) return;
    setFocal(
      assetToFocal(
        {
          id: asset.id,
          name: asset.name ?? asset.title ?? "Asset",
          type: asset.type ?? "doc",
        },
        null,
      ),
    );
    setStageMode({ mode: "asset", assetId: asset.id });
  };

  const handleMissionClick = (mission: { id: string }) => {
    if (!mission.id) return;
    setStageMode({ mode: "mission", missionId: mission.id });
  };

  return (
    <div
      className="flex flex-col"
      style={{
        padding: "var(--space-14) var(--space-12) var(--space-12)",
        gap: "var(--space-12)",
      }}
    >
      {/* KPIs — 3 naked numbers, baseline-aligned */}
      <div
        className="grid grid-cols-3"
        style={{ gap: "var(--space-6)", alignItems: "baseline" }}
      >
        {[
          { n: assetsCount,   label: "Assets",   view: "assets" as const },
          { n: missionsCount, label: "Missions", view: "missions" as const },
          { n: reportsCount,  label: "Reports",  view: "reports" as const },
        ].map(({ n, label, view }) => (
          <button
            key={label}
            type="button"
            onClick={() => onViewChange(view)}
            className="kpi-tile group"
          >
            <span className="kpi-num">{n.toString().padStart(2, "0")}</span>
            <span className="kpi-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Active missions */}
      <div>
        <SectionHead
          label="Active missions"
          action={{ label: "All", onClick: () => onViewChange("missions") }}
        />
        {activeMissions.length === 0 ? (
          <EmptyText>No active missions</EmptyText>
        ) : (
          <div className="flex flex-col">
            {activeMissions.map((m) => (
              <MissionRow
                key={m.id}
                mission={m}
                onOpen={() => handleMissionClick(m)}
                onAction={handleMissionAction}
                pendingId={pendingMissionId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent assets */}
      <div>
        <SectionHead
          label="Recent assets"
          action={{ label: "All", onClick: () => onViewChange("assets") }}
        />
        {recentAssets.length === 0 ? (
          <EmptyText>No assets yet</EmptyText>
        ) : (
          <div className="flex flex-col">
            {recentAssets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                onOpen={() => handleAssetClick(a)}
                onShare={() => void handleAssetShare(a)}
                onDelete={() => setConfirmDelete(a)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div>
        <SectionHead label="Alerts" />
        <EmptyText>No recent alerts</EmptyText>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="dashboard-toast"
          className="flex items-center"
          style={{
            position: "fixed",
            bottom: "var(--space-6)",
            right: "var(--space-6)",
            zIndex: 30,
            padding: "var(--space-2) var(--space-4)",
            background: "var(--surface-1)",
            border: "1px solid var(--cykan)",
            borderRadius: "var(--radius-xs)",
            color: "var(--cykan)",
            gap: "var(--space-2)",
          }}
        >
          <span className="t-9 font-mono uppercase tracking-display">{toast}</span>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Supprimer cet asset ?"
        description={`L'asset « ${confirmDelete?.name ?? confirmDelete?.title ?? confirmDelete?.id?.slice(0, 8) ?? ""} » sera supprimé définitivement. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={pendingAssetId !== null}
        onConfirm={() => {
          if (confirmDelete) void handleAssetDelete(confirmDelete);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
