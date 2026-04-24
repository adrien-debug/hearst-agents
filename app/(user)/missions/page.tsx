"use client";

import { useState, useEffect } from "react";
import { MissionEditor } from "../components/MissionEditor";

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
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadMissions() {
      try {
        const res = await fetch("/api/v2/missions");
        if (res.ok) {
          const data = await res.json();
          setMissions(data.missions || []);
        }
      } catch (error) {
        console.error("Failed to load missions:", error);
      } finally {
        setLoading(false);
      }
    }
    loadMissions();
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
        alert("Mission lancée !");
      }
    } catch (error) {
      console.error("Failed to run mission:", error);
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
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
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
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-white/50">{missions.filter((m) => m.status === "active").length} actives</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-white/50">{missions.filter((m) => m.status === "paused").length} en pause</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-white/50">{missions.filter((m) => m.status === "error").length} erreurs</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {missions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <span className="text-2xl">◈</span>
            </div>
            <h2 className="text-lg font-medium text-white mb-2">Aucune mission active</h2>
            <p className="text-sm text-white/40 max-w-md mb-6">
              Les missions sont des tâches récurrentes que vous pouvez planifier. Elles s&apos;exécutent automatiquement selon votre calendrier.
            </p>
            <button
              onClick={openNewMission}
              className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-white/80 rounded-lg text-sm transition-colors border border-white/[0.08]"
            >
              Créer ma première mission
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {missions.map((mission) => (
              <div
                key={mission.id}
                className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
              >
                <button
                  onClick={() => handleToggle(mission)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    mission.status === "active" ? "bg-emerald-400" : mission.status === "paused" ? "bg-amber-400" : "bg-red-400"
                  }`}
                  title={mission.enabled ? "Désactiver" : "Activer"}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white mb-0.5">{mission.name}</h3>
                  <p className="text-xs text-white/40 truncate">{mission.description}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  <span>{mission.frequency}</span>
                  {mission.nextRun && <span>Prochain: {new Date(mission.nextRun).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRunNow(mission.id)}
                    className="p-2 text-white/30 hover:text-cyan-400 transition-colors"
                    title="Exécuter maintenant"
                  >
                    ▶
                  </button>
                  <button
                    onClick={() => openEditMission(mission)}
                    className="p-2 text-white/30 hover:text-white/60 transition-colors"
                    title="Modifier"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(mission.id)}
                    className="p-2 text-white/30 hover:text-red-400 transition-colors"
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#141414] border border-white/[0.08] rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-medium text-white">
                  {editingMission ? "Modifier la mission" : "Nouvelle mission"}
                </h2>
                <button
                  onClick={closeEditor}
                  className="text-white/40 hover:text-white/60"
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
