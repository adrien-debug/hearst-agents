"use client";

import { useRouter } from "next/navigation";
import { useServicesStore } from "@/stores/services";

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

function statusVariant(m: DashboardMission): "running" | "blocked" | "failed" | "success" | "idle" {
  if (m.opsStatus === "running") return "running";
  if (m.opsStatus === "blocked") return "blocked";
  if (m.opsStatus === "failed") return "failed";
  if (m.opsStatus === "success") return "success";
  return "idle";
}

export function GeneralDashboard({
  assets: _assets,
  missions: _missions,
  onViewChange = () => {},
}: GeneralDashboardProps) {
  const router = useRouter();
  const services = useServicesStore((s) => s.services);
  const connectedServices = services.filter((s) => s.connectionStatus === "connected");
  const totalServices = services.length;
  const assetsCount = Array.isArray(_assets) ? _assets.length : 0;
  const missionsCount = Array.isArray(_missions) ? _missions.length : 0;
  const recentAssets = Array.isArray(_assets) ? (_assets as DashboardAsset[]).slice(0, 3) : [];
  const activeMissions = Array.isArray(_missions)
    ? (_missions as DashboardMission[]).slice(0, 6)
    : [];

  const runningMissions = activeMissions.filter((m) => m.opsStatus === "running");
  const failedMissions  = activeMissions.filter((m) => m.opsStatus === "failed");

  return (
    <div
      className="flex flex-col"
      style={{ padding: "var(--space-8) var(--space-5)", gap: "var(--space-3)" }}
    >
      {/* KPIs top supprimés 2026-05-03 : redondants avec les recap-cards
         juste en dessous (Missions/Assets affichaient les mêmes counts).
         Reports vit dans /runs, accessible via la nav rail gauche. */}

      {/* 3 recap cards — hauteur uniforme */}
      <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>

        <button
          type="button"
          onClick={() => onViewChange("missions")}
          className="recap-card"
        >
          <div className="recap-card-row">
            <span className="recap-card-label">Missions</span>
            <span className="recap-card-count">{missionsCount.toString().padStart(2, "0")}</span>
          </div>
          <p className="recap-card-body">
            {activeMissions.length === 0
              ? "Aucune mission — lance via ⌘K"
              : runningMissions.length > 0
                ? `${runningMissions.length} en cours${failedMissions.length > 0 ? ` · ${failedMissions.length} en échec` : ""}`
                : failedMissions.length > 0
                  ? `${failedMissions.length} en échec`
                  : `${activeMissions.length} armée${activeMissions.length > 1 ? "s" : ""}`}
          </p>
          {activeMissions.length > 0 && (
            <div className="recap-card-dots">
              {activeMissions.map((m) => {
                const v = statusVariant(m);
                const cls = v === "running" ? "is-running" : v === "failed" ? "is-failed" : v === "blocked" ? "is-blocked" : v === "success" ? "is-success" : "";
                return (
                  <span
                    key={m.id}
                    className={`context-tile-status ${cls}`.trim()}
                    style={{ position: "static" }}
                  />
                );
              })}
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => onViewChange("assets")}
          className="recap-card"
        >
          <div className="recap-card-row">
            <span className="recap-card-label">Assets</span>
            <span className="recap-card-count">{assetsCount.toString().padStart(2, "0")}</span>
          </div>
          <p className="recap-card-body">
            {recentAssets.length === 0
              ? "Aucun asset — génère via chat"
              : recentAssets.map((a) => a.name ?? a.title ?? "Asset").join(" · ")}
          </p>
        </button>

        <div className="recap-card is-static">
          <div className="recap-card-row">
            <span className="recap-card-label">Alertes</span>
            <span className="recap-card-count">00</span>
          </div>
          <p className="recap-card-body">Tout est calme</p>
        </div>

      </div>

      {/* Apps connectées — récap visuel des services qui alimentent
         Hearst. Logos couleur = connectés, opacité 0.3 + grayscale = pas
         encore connectés. Click → /apps. */}
      {totalServices > 0 && (
        <button
          type="button"
          onClick={() => router.push("/apps")}
          className="recap-card text-left"
        >
          <div className="recap-card-row">
            <span className="recap-card-label">Apps connectées</span>
            <span className="recap-card-count">
              {connectedServices.length.toString().padStart(2, "0")}
              <span style={{ color: "var(--text-faint)", fontWeight: 300 }}>
                {" "}/ {totalServices.toString().padStart(2, "0")}
              </span>
            </span>
          </div>
          <div
            className="flex flex-wrap items-center"
            style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}
          >
            {services.slice(0, 12).map((s) => {
              const isConn = s.connectionStatus === "connected";
              return (
                <span
                  key={s.id}
                  title={`${s.name}${isConn ? " — connecté" : ""}`}
                  className="inline-flex items-center justify-center"
                  style={{
                    width: 18,
                    height: 18,
                    opacity: isConn ? 1 : 0.3,
                    transition: "opacity 150ms ease",
                  }}
                >
                  <img
                    src={s.icon}
                    alt={s.name}
                    width={16}
                    height={16}
                    style={{ filter: isConn ? "none" : "grayscale(100%)" }}
                  />
                </span>
              );
            })}
            {totalServices > 12 && (
              <span
                className="t-9 font-mono"
                style={{ color: "var(--text-faint)" }}
              >
                +{totalServices - 12}
              </span>
            )}
          </div>
        </button>
      )}
    </div>
  );
}
