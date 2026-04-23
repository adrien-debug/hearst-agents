"use client";

import { useRuntimeStore } from "@/stores/runtime";
import { useEffect, useState } from "react";

interface Run { id: string; input: string; status: string; createdAt: number; }
interface Mission { id: string; name: string; status: string; enabled: boolean; }
interface Asset { id: string; name: string; type: string; runId: string; }

export function RightPanel() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const currentRunId = useRuntimeStore((s) => s.currentRunId);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const [runs, setRuns] = useState<Run[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [runsRes, missionsRes, rightPanelRes] = await Promise.all([
          fetch("/api/v2/runs?limit=5"),
          fetch("/api/v2/missions"),
          fetch("/api/v2/right-panel"),
        ]);
        if (runsRes.ok) setRuns((await runsRes.json()).runs || []);
        if (missionsRes.ok) setMissions((await missionsRes.json()).missions?.slice(0, 3) || []);
        if (rightPanelRes.ok) {
          const rightPanelData = await rightPanelRes.json();
          setAssets(rightPanelData.assets?.slice(0, 5) || []);
        }
        setIsConnected(true);
      } catch { setIsConnected(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const isRunning = coreState !== "idle";

  return (
    <aside className="w-[280px] bg-[#111] border-l border-white/[0.06] flex flex-col">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Runtime</p>
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
        </div>
        {isRunning ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm text-cyan-400">{flowLabel || "En cours..."}</span>
            </div>
            <p className="text-[10px] font-mono text-white/30 uppercase">{coreState}</p>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 animate-pulse w-2/3" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white/30">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <span className="text-sm">Inactif</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Runs récents</p>
          {runs.length === 0 ? (
            <p className="text-xs text-white/20 italic">Aucun run récent</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className={`p-2 rounded-md text-xs ${run.id === currentRunId ? "bg-cyan-500/10 border border-cyan-500/20" : "bg-white/[0.02]"}`}>
                  <p className="truncate text-white/70">{run.input.slice(0, 40)}{run.input.length > 40 ? "..." : ""}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      run.status === "completed" ? "bg-emerald-500" :
                      run.status === "failed" ? "bg-red-500" :
                      run.status === "running" ? "bg-cyan-400 animate-pulse" : "bg-white/20"
                    }`} />
                    <span className="text-[10px] text-white/40 uppercase">{run.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {assets.length > 0 && (
          <div className="p-4 border-t border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Assets ({assets.length})</p>
            <div className="space-y-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] text-xs">
                  <span className="text-white/40">{asset.type === "report" ? "📄" : asset.type === "pdf" ? "📑" : asset.type === "excel" ? "📊" : "📁"}</span>
                  <span className="truncate text-white/60 flex-1">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {missions.length > 0 && (
          <div className="p-4 border-t border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Missions</p>
            <div className="space-y-2">
              {missions.map((mission) => (
                <div key={mission.id} className="flex items-center justify-between p-2 rounded-md bg-white/[0.02] text-xs">
                  <span className="truncate text-white/60">{mission.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    mission.status === "running" ? "bg-cyan-400 animate-pulse" :
                    mission.enabled ? "bg-emerald-500" : "bg-white/20"
                  }`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-white/[0.06] text-[10px] text-white/20 text-center">Hearst OS v2.0</div>
    </aside>
  );
}
