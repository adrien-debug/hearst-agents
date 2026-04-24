"use client";

import { useRuntimeStore } from "@/stores/runtime";
import { useNavigationStore } from "@/stores/navigation";
import { useEffect, useState } from "react";
import type { RightPanelData, FocalObjectView } from "@/lib/ui/right-panel/types";

export function RightPanel() {
  const coreState = useRuntimeStore((s) => s.coreState);
  const currentRunId = useRuntimeStore((s) => s.currentRunId);
  const flowLabel = useRuntimeStore((s) => s.flowLabel);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);

  const [data, setData] = useState<RightPanelData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!activeThreadId) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/v2/right-panel?thread_id=${encodeURIComponent(activeThreadId)}`);
        if (res.ok) {
          const panelData: RightPanelData = await res.json();
          setData(panelData);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch {
        setIsConnected(false);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [activeThreadId]);

  const isRunning = coreState !== "idle";
  const focalObject = data?.focalObject;
  const secondaryObjects = data?.secondaryObjects || [];

  // Type guards for focal object
  const getFocalProp = (obj: unknown, key: string): string | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };

  const getFocalArray = (obj: unknown, key: string): unknown[] | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? val : undefined;
  };

  const getFocalObject = (obj: unknown, key: string): Record<string, unknown> | undefined => {
    if (typeof obj !== "object" || obj === null) return undefined;
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === "object" && val !== null && !Array.isArray(val) ? val as Record<string, unknown> : undefined;
  };

  // Helper to get summary from focal object
  const getFocalSummary = (obj: unknown): string => {
    const summary = getFocalProp(obj, "summary");
    if (summary) return summary;
    const sections = getFocalArray(obj, "sections");
    if (sections && sections.length > 0) {
      const firstSection = sections[0] as Record<string, unknown>;
      const body = firstSection?.body as string;
      if (body) return body.slice(0, 100) + (body.length > 100 ? "..." : "");
    }
    return "";
  };

  // Extract focal object properties safely
  const focalObjectType = focalObject ? getFocalProp(focalObject, "objectType") || "unknown" : "";
  const focalTitle = focalObject ? getFocalProp(focalObject, "title") || "Untitled" : "";
  const focalStatus = focalObject ? getFocalProp(focalObject, "status") || "" : "";
  const focalSummary = focalObject ? getFocalSummary(focalObject) : "";
  const focalPrimaryAction = focalObject ? getFocalObject(focalObject, "primaryAction") : undefined;
  const focalActionLabel = focalPrimaryAction?.label as string | undefined;

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
        {/* Focal Object — Surface primaire */}
        {focalObject ? (
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-cyan-400 mb-2">Focal</p>
            <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{focalObjectType === "report" ? "📄" : focalObjectType === "brief" ? "📋" : focalObjectType === "message_receipt" ? "✉️" : focalObjectType === "message_draft" ? "✏️" : "◉"}</span>
                <p className="text-sm font-medium text-white truncate flex-1">{focalTitle}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  focalStatus === "ready" || focalStatus === "delivered" ? "bg-emerald-500/20 text-emerald-400" :
                  focalStatus === "awaiting_approval" ? "bg-amber-500/20 text-amber-400" :
                  focalStatus === "composing" ? "bg-cyan-500/20 text-cyan-400" :
                  "bg-white/10 text-white/60"
                }`}>{focalStatus}</span>
              </div>
              {focalSummary && (
                <p className="text-xs text-white/50 line-clamp-3">{focalSummary}</p>
              )}
              {focalActionLabel && (
                <button className="mt-2 w-full py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 rounded text-xs font-medium transition-colors">
                  {focalActionLabel}
                </button>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="p-4 border-b border-white/[0.06]">
            <div className="h-20 bg-white/[0.02] rounded-lg animate-pulse" />
          </div>
        ) : null}

        {/* Secondary Objects — Liste compacte */}
        {secondaryObjects.length > 0 && (
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-2">Secondaire ({secondaryObjects.length})</p>
            <div className="space-y-1.5">
              {secondaryObjects.map((obj, idx) => {
                const objType = getFocalProp(obj, "objectType") || "unknown";
                const objTitle = getFocalProp(obj, "title") || "Untitled";
                const objStatus = getFocalProp(obj, "status") || "";
                return (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded bg-white/[0.02] text-xs">
                    <span className="text-white/40">{objType === "report" ? "📄" : objType === "brief" ? "📋" : "◉"}</span>
                    <span className="truncate text-white/60 flex-1">{objTitle}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      objStatus === "ready" || objStatus === "delivered" ? "bg-emerald-500" :
                      objStatus === "awaiting_approval" ? "bg-amber-500" :
                      objStatus === "composing" ? "bg-cyan-400 animate-pulse" : "bg-white/20"
                    }`} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Fallback: Recent runs (compact) */}
        {!focalObject && data?.recentRuns && data.recentRuns.length > 0 && (
          <div className="p-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Runs récents</p>
            <div className="space-y-2">
              {data.recentRuns.slice(0, 5).map((run) => (
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
          </div>
        )}

        {/* Assets (compact, if no focal) */}
        {!focalObject && data?.assets && data.assets.length > 0 && (
          <div className="p-4 border-t border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Assets ({data.assets.length})</p>
            <div className="space-y-2">
              {data.assets.slice(0, 5).map((asset) => (
                <div key={asset.id} className="flex items-center gap-2 p-2 rounded-md bg-white/[0.02] text-xs">
                  <span className="text-white/40">{asset.type === "report" ? "📄" : asset.type === "pdf" ? "📑" : asset.type === "excel" ? "📊" : "📁"}</span>
                  <span className="truncate text-white/60 flex-1">{asset.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missions (compact, if no focal) */}
        {!focalObject && data?.missions && data.missions.length > 0 && (
          <div className="p-4 border-t border-white/[0.06]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-3">Missions</p>
            <div className="space-y-2">
              {data.missions.slice(0, 3).map((mission) => (
                <div key={mission.id} className="flex items-center justify-between p-2 rounded-md bg-white/[0.02] text-xs">
                  <span className="truncate text-white/60">{mission.name}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    mission.opsStatus === "running" ? "bg-cyan-400 animate-pulse" :
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
