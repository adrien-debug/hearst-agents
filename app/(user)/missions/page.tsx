"use client";

import { useState, useEffect } from "react";
import { MissionEditor } from "../components/MissionEditor";
import { toast } from "@/app/hooks/use-toast";

type MissionOpsStatus = "idle" | "running" | "success" | "failed" | "blocked";

interface Mission {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  lastRun?: string;
  nextRun?: string;
  frequency: string;
  enabled: boolean;
  input?: string; // From API - mapped to prompt in editor
  opsStatus?: MissionOpsStatus;
  lastError?: string;
  runningSince?: number;
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    async function loadMissions() {
      try {
        // Load base missions
        const res = await fetch("/api/v2/missions");
        if (!res.ok) {
          toast.error("Échec du chargement", "Impossible de charger les missions");
          return;
        }
        const data = await res.json();
        const baseMissions = data.missions || [];

        // Enrich with ops status
        const opsRes = await fetch("/api/v2/missions/ops");
        if (opsRes.ok) {
          const opsData = await opsRes.json();
          const opsMap = new Map(
            opsData.missions?.map((op: { missionId: string; status: MissionOpsStatus; lastError?: string; runningSince?: number }) => [
              op.missionId,
              { opsStatus: op.status, lastError: op.lastError, runningSince: op.runningSince },
            ]) || []
          );

          const enriched = baseMissions.map((m: Mission) => ({
            ...m,
            ...(opsMap.get(m.id) || {}),
          }));
          setMissions(enriched);
        } else {
          setMissions(baseMissions);
        }
      } catch (error) {
        console.error("Failed to load missions:", error);
        toast.error("Erreur de chargement", "Une erreur est survenue");
      } finally {
        setLoading(false);
      }
    }
    loadMissions();

    // Refresh ops status every 5s
    const opsInterval = setInterval(() => {
      fetch("/api/v2/missions/ops")
        .then((res) => {
          if (!res.ok) throw new Error(`ops status fetch failed: ${res.status}`);
          return res.json();
        })
        .then((opsData) => {
          const opsMap = new Map(
            opsData.missions?.map((op: { missionId: string; status: MissionOpsStatus; lastError?: string; runningSince?: number }) => [
              op.missionId,
              { opsStatus: op.status, lastError: op.lastError, runningSince: op.runningSince },
            ]) || []
          );
          setMissions((prev) =>
            prev.map((m) => ({
              ...m,
              ...(opsMap.get(m.id) || {}),
            }))
          );
        })
        .catch((err) => {
          console.error("[MissionsPage] Background ops refresh failed:", err);
          // Silent fail for background refresh — keep showing last known state
        });
    }, 5000);

    // Update current time every second for running duration
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      clearInterval(opsInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const handleSave = async (formData: {
    name: string;
    description: string;
    prompt: string;
    frequency: "daily" | "weekly" | "monthly" | "custom";
    customCron?: string;
    enabled: boolean;
  }) => {
    setIsSaving(true);
    try {
      if (editingMission) {
        // Update existing
        const res = await fetch(`/api/v2/missions/${editingMission.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setMissions((prev) =>
            prev.map((m) =>
              m.id === editingMission.id
                ? { ...m, ...formData, status: formData.enabled ? "active" : "paused" }
                : m
            )
          );
        }
      } else {
        // Create new
        const res = await fetch("/api/v2/missions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          const newMission = await res.json();
          setMissions((prev) => [...prev, newMission.mission]);
        }
      }
      setShowEditor(false);
      setEditingMission(null);
    } catch (error) {
      console.error("Failed to save mission:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (missionId: string) => {
    if (!confirm("Supprimer cette mission ?")) return;
    try {
      const res = await fetch(`/api/v2/missions/${missionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMissions((prev) => prev.filter((m) => m.id !== missionId));
      }
    } catch (error) {
      console.error("Failed to delete mission:", error);
    }
  };

  const handleToggle = async (mission: Mission) => {
    try {
      const res = await fetch(`/api/v2/missions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mission.id, enabled: !mission.enabled }),
      });
      if (res.ok) {
        setMissions((prev) =>
          prev.map((m) =>
            m.id === mission.id
              ? { ...m, enabled: !m.enabled, status: !m.enabled ? "active" : "paused" }
              : m
          )
        );
      }
    } catch (error) {
      console.error("Failed to toggle mission:", error);
    }
  };

  const handleRunNow = async (missionId: string) => {
    try {
      const res = await fetch(`/api/v2/missions/${missionId}/run`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Mission lancée", "La mission a été démarrée avec succès");
      } else {
        const data = await res.json();
        toast.error("Échec du lancement", data.error || "Impossible de lancer la mission");
      }
    } catch (error) {
      console.error("Failed to run mission:", error);
      toast.error("Erreur de lancement", "Une erreur est survenue");
    }
  };

  const openNewMission = () => {
    setEditingMission(null);
    setShowEditor(true);
  };

  const openEditMission = (mission: Mission) => {
    setEditingMission(mission);
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingMission(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
        <span className="text-white/40 text-sm">Chargement des missions...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="border-b border-[var(--line)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">Missions</h1>
            <p className="text-sm text-white/40">Automatisations planifiées et récurrentes</p>
          </div>
          <button
            onClick={openNewMission}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-medium transition-colors"
          >
            + Nouvelle mission
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--money)]" />
            <span className="text-white/50">{missions.filter((m) => m.enabled).length} activées</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--cykan)] animate-pulse" />
            <span className="text-white/50">{missions.filter((m) => m.opsStatus === "running").length} en cours</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
            <span className="text-white/50">{missions.filter((m) => m.opsStatus === "failed").length} échecs</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-[var(--warn)]" />
            <span className="text-white/50">{missions.filter((m) => m.opsStatus === "blocked").length} bloqués</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {missions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-[var(--line)] flex items-center justify-center mb-4">
              <span className="text-2xl">◈</span>
            </div>
            <h2 className="text-lg font-medium text-[var(--text)] mb-2">Aucune mission active</h2>
            <p className="text-sm text-[var(--text-muted)] max-w-md mb-6">
              Les missions sont des tâches récurrentes que vous pouvez planifier. Elles s&apos;exécutent automatiquement selon votre calendrier.
            </p>
            <button
              onClick={openNewMission}
              className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-[var(--text-soft)] rounded-lg text-sm transition-colors border border-white/[0.08]"
            >
              Créer ma première mission
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {missions.map((mission) => {
              const effectiveOpsStatus = mission.opsStatus || "idle";
              const opsStatusColor =
                effectiveOpsStatus === "running"
                  ? "bg-[var(--cykan)]"
                  : effectiveOpsStatus === "success"
                  ? "bg-[var(--money)]"
                  : effectiveOpsStatus === "failed"
                  ? "bg-[var(--danger)]"
                  : effectiveOpsStatus === "blocked"
                  ? "bg-[var(--warn)]"
                  : "bg-[var(--text-faint)]";

              const opsStatusLabel =
                effectiveOpsStatus === "running"
                  ? "En cours"
                  : effectiveOpsStatus === "success"
                  ? "Succès"
                  : effectiveOpsStatus === "failed"
                  ? "Échec"
                  : effectiveOpsStatus === "blocked"
                  ? "Bloqué"
                  : "Inactif";

              return (
                <div
                  key={mission.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-[var(--line)] hover:bg-white/[0.03] transition-colors"
                >
                  <button
                    onClick={() => handleToggle(mission)}
                    className={`w-2 h-2 rounded-full mt-1.5 transition-colors ${
                      mission.enabled ? "bg-[var(--money)]" : "bg-[var(--text-faint)]"
                    }`}
                    title={mission.enabled ? "Désactiver" : "Activer"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-[var(--text)]">{mission.name}</h3>
                      <span
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          effectiveOpsStatus === "running"
                            ? "bg-[var(--cykan)]/20 text-[var(--cykan)]"
                            : effectiveOpsStatus === "success"
                            ? "bg-[var(--money)]/20 text-[var(--money)]"
                            : effectiveOpsStatus === "failed"
                            ? "bg-[var(--danger)]/20 text-[var(--danger)]"
                            : effectiveOpsStatus === "blocked"
                            ? "bg-[var(--warn)]/20 text-[var(--warn)]"
                            : "bg-white/5 text-[var(--text-faint)]"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${opsStatusColor} ${effectiveOpsStatus === "running" ? "animate-pulse" : ""}`} />
                        {opsStatusLabel}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">{mission.description}</p>
                    {mission.lastError && (
                      <p className="text-[10px] text-[var(--danger)] truncate" title={mission.lastError}>
                        ⚠ {mission.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs text-[var(--text-faint)]">
                    <span>{mission.frequency}</span>
                    {mission.runningSince && (
                      <span className="text-[10px] text-[var(--cykan)]">
                        Depuis {Math.floor((currentTime - mission.runningSince) / 1000)}s
                      </span>
                    )}
                    {mission.nextRun && <span className="text-[10px]">Prochain: {new Date(mission.nextRun).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRunNow(mission.id)}
                      disabled={mission.opsStatus === "running"}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Exécuter maintenant"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => openEditMission(mission)}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
                      title="Modifier"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDelete(mission.id)}
                      className="p-2 text-[var(--text-faint)] hover:text-[var(--danger)] transition-colors"
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-soft)] border border-[var(--line)] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-[var(--text)]">
                  {editingMission ? "Modifier la mission" : "Nouvelle mission"}
                </h2>
                <button
                  onClick={closeEditor}
                  className="text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  ✕
                </button>
              </div>
              <MissionEditor
                initialData={
                  editingMission
                    ? {
                        name: editingMission.name,
                        description: editingMission.description,
                        prompt: editingMission.input || "",
                        frequency: editingMission.frequency as "daily" | "weekly" | "monthly" | "custom",
                        enabled: editingMission.enabled,
                      }
                    : undefined
                }
                onSave={handleSave}
                onCancel={closeEditor}
                isLoading={isSaving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
