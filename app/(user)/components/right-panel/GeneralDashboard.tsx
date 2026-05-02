"use client";

import { useFocalStore } from "@/stores/focal";
import { useStageStore } from "@/stores/stage";
import { assetToFocal } from "@/lib/ui/focal-mappers";
import { isPlaceholderAssetId } from "@/lib/ui/asset-id";
import { SectionHeader, Action } from "../ui";
import { EmptyState } from "../ui/EmptyState";

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

interface DashboardMission {
  id: string;
  name: string;
  enabled?: boolean;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
}

function SectionHead({
  label,
  action,
}: {
  label: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <SectionHeader
      label={label}
      density="section"
      action={
        action && (
          <Action variant="link" tone="brand" onClick={action.onClick}>
            {action.label} →
          </Action>
        )
      }
    />
  );
}

const ReportIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const DocIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

const MissionIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

function statusVariant(m: DashboardMission): "running" | "blocked" | "failed" | "success" | "idle" {
  if (m.opsStatus === "running") return "running";
  if (m.opsStatus === "blocked") return "blocked";
  if (m.opsStatus === "failed") return "failed";
  if (m.opsStatus === "success") return "success";
  return "idle";
}

function statusLabel(v: ReturnType<typeof statusVariant>, enabled: boolean): string {
  if (v === "running") return "En cours";
  if (v === "blocked") return "Bloquée";
  if (v === "failed") return "Échec";
  if (v === "success") return "Réussie";
  return enabled ? "Armée" : "En pause";
}

function MissionTile({
  mission,
  onOpen,
}: {
  mission: DashboardMission;
  onOpen: () => void;
}) {
  const variant = statusVariant(mission);
  const enabled = mission.enabled !== false;
  const label = statusLabel(variant, enabled);
  const statusClass =
    variant === "running" ? "is-running"
    : variant === "blocked" ? "is-blocked"
    : variant === "failed" ? "is-failed"
    : variant === "success" ? "is-success"
    : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="context-tile is-mission"
      aria-label={`${mission.name} · ${label}`}
      title={`${mission.name} · ${label}`}
      data-testid={`dashboard-mission-tile-${mission.id}`}
    >
      <span className={`context-tile-status ${statusClass}`.trim()} aria-hidden />
      <span className="context-tile-icon">
        <MissionIcon />
      </span>
    </button>
  );
}

function assetTypeLabel(t?: string): string {
  if (!t) return "DOC";
  if (t === "report") return "REPORT";
  if (t === "brief" || t === "briefing") return "BRIEF";
  return t.toUpperCase().slice(0, 6);
}

function AssetTile({
  asset,
  onOpen,
}: {
  asset: DashboardAsset;
  onOpen: () => void;
}) {
  const name = asset.name || asset.title || "Asset";
  const isReport = asset.type === "report";
  const badge = assetTypeLabel(asset.type);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="context-tile is-asset"
      aria-label={`${name} · ${badge}`}
      title={name}
      data-testid={`dashboard-asset-tile-${asset.id}`}
    >
      <span className="context-tile-badge">{badge}</span>
      <span className="context-tile-icon">
        {isReport ? <ReportIcon /> : <DocIcon />}
      </span>
    </button>
  );
}

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
}: GeneralDashboardProps) {
  const setFocal = useFocalStore((s) => s.setFocal);
  const setStageMode = useStageStore((s) => s.setMode);

  const assetsCount = Array.isArray(_assets) ? _assets.length : 0;
  const missionsCount = Array.isArray(_missions) ? _missions.length : 0;
  const reportsCount = Array.isArray(_assets)
    ? (_assets as DashboardAsset[]).filter((a) => a.type === "report").length
    : 0;
  const recentAssets = Array.isArray(_assets) ? (_assets as DashboardAsset[]).slice(0, 6) : [];
  const activeMissions = Array.isArray(_missions)
    ? (_missions as DashboardMission[]).slice(0, 9)
    : [];

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

  const handleMissionClick = (mission: DashboardMission) => {
    if (!mission.id) return;
    setStageMode({ mode: "mission", missionId: mission.id });
  };

  return (
    <div
      className="flex flex-col"
      style={{
        padding: "var(--space-10) var(--space-6) var(--space-10)",
        gap: "var(--space-10)",
      }}
    >
      {/* KPIs — seul endroit légitime des compteurs (le center est éditorial) */}
      <div
        className="grid grid-cols-3"
        style={{ gap: "var(--space-4)", alignItems: "baseline" }}
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
            data-testid={`dashboard-kpi-${view}`}
          >
            <span className="kpi-num">{n.toString().padStart(2, "0")}</span>
            <span className="kpi-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Missions actives — tuiles iconiques avec status dot */}
      <div>
        <SectionHead
          label="Missions actives"
          action={{ label: "Voir tout", onClick: () => onViewChange("missions") }}
        />
        {activeMissions.length === 0 ? (
          <EmptyState
            icon="◐"
            title="Aucune mission active"
            description="Lance ta première mission via ⌘K."
            density="compact"
            cta={{ label: "Voir toutes les missions", onClick: () => onViewChange("missions") }}
          />
        ) : (
          <div className="context-tile-grid">
            {activeMissions.map((m) => (
              <MissionTile
                key={m.id}
                mission={m}
                onOpen={() => handleMissionClick(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assets récents — tuiles iconiques avec badge type */}
      <div>
        <SectionHead
          label="Assets récents"
          action={{ label: "Voir tout", onClick: () => onViewChange("assets") }}
        />
        {recentAssets.length === 0 ? (
          <EmptyState
            icon="◍"
            title="Aucun asset"
            description="Tes briefs et reports apparaîtront ici."
            density="compact"
            cta={{ label: "Parcourir les assets", onClick: () => onViewChange("assets") }}
          />
        ) : (
          <div className="context-tile-grid is-asset">
            {recentAssets.map((a) => (
              <AssetTile
                key={a.id}
                asset={a}
                onOpen={() => handleAssetClick(a)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Alertes — empty state éditorial unifié */}
      <div>
        <SectionHead label="Alertes" />
        <EmptyState
          icon="◈"
          title="Aucune alerte"
          description="Hearst veille sur tes signaux."
          density="compact"
        />
      </div>
    </div>
  );
}
