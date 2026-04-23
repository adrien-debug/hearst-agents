"use client";

import { useState, useEffect } from "react";
import { useNavigationStore } from "@/stores/navigation";

interface Mission {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  lastRun?: string;
  nextRun?: string;
  frequency: string;
}

export default function MissionsPage() {
  const { surface } = useNavigationStore();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch missions from API
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

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-white/[0.06] p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-medium text-white mb-1">Missions</h1>
            <p className="text-sm text-white/40">
              Automatisations planifiées et récurrentes
            </p>
          </div>
          <button className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-medium transition-colors">
            + Nouvelle mission
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-white/50">{missions.filter(m => m.status === "active").length} actives</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-white/50">{missions.filter(m => m.status === "paused").length} en pause</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="text-white/50">{missions.filter(m => m.status === "error").length} erreurs</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-white/40 text-sm">Chargement des missions...</span>
          </div>
        ) : missions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <span className="text-2xl">◈</span>
            </div>
            <h2 className="text-lg font-medium text-white mb-2">
              Aucune mission active
            </h2>
            <p className="text-sm text-white/40 max-w-md mb-6">
              Les missions sont des tâches récurrentes que vous pouvez planifier. Elles s&apos;exécutent automatiquement selon votre calendrier.
            </p>
            <button className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-white/80 rounded-lg text-sm transition-colors border border-white/[0.08]">
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
                <div className={`w-2 h-2 rounded-full ${
                  mission.status === "active" ? "bg-emerald-400" :
                  mission.status === "paused" ? "bg-amber-400" : "bg-red-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white mb-0.5">{mission.name}</h3>
                  <p className="text-xs text-white/40 truncate">{mission.description}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  <span>{mission.frequency}</span>
                  {mission.nextRun && <span>Prochain: {new Date(mission.nextRun).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-white/30 hover:text-white/60 transition-colors">
                    ▶
                  </button>
                  <button className="p-2 text-white/30 hover:text-white/60 transition-colors">
                    ⚙
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
