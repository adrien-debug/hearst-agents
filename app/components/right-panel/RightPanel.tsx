"use client";

import { useCallback, useMemo, useState } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import type { RightPanelRun, RightPanelMission } from "@/lib/ui/right-panel/types";
import { ActivitySection } from "./ActivitySection";
import { AssetsSection } from "./AssetsSection";
import { AssetDetailSection } from "./AssetDetailSection";
import { MissionsSection } from "./MissionsSection";
import { MissionDetailSection } from "./MissionDetailSection";
import { RunTimelineSection, type SelectedRun } from "./RunTimelineSection";
import { MissionComposer } from "../missions/MissionComposer";

type ContextPane = "none" | "timeline" | "mission" | "composer";

export default function RightPanel() {
  const { data, loading, error, refresh } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const liveEvents = useMemo(() => stream?.liveEvents ?? [], [stream?.liveEvents]);

  const [activeTab, setActiveTab] = useState<"live" | "artifacts">("live");
  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<RightPanelMission | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const contextPane: ContextPane = selectedRun
    ? "timeline"
    : showComposer
      ? "composer"
      : selectedMission
        ? "mission"
        : "none";

  const handleRunSelect = useCallback(
    (run: RightPanelRun) => {
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        return;
      }
      setSelectedMission(null);
      setShowComposer(false);
      setSelectedRun({
        id: run.id,
        input: run.input,
        status: run.status,
        executionMode: run.executionMode,
        agentId: run.agentId,
      });
    },
    [selectedRun],
  );

  const handleAssetSelect = useCallback(
    (assetId: string) => {
      setSelectedAssetId(selectedAssetId === assetId ? null : assetId);
      if (selectedAssetId !== assetId) setActiveTab("artifacts");
    },
    [selectedAssetId],
  );

  const handleOpenSourceRun = useCallback(
    (runId: string) => {
      const run = data.recentRuns.find((r) => r.id === runId);
      if (run) {
        handleRunSelect(run);
        setActiveTab("live");
      }
    },
    [data.recentRuns, handleRunSelect],
  );

  const handleMissionSelect = useCallback(
    (mission: RightPanelMission) => {
      if (selectedMission?.id === mission.id) {
        setSelectedMission(null);
        return;
      }
      setSelectedRun(null);
      setShowComposer(false);
      setSelectedMission(mission);
    },
    [selectedMission],
  );

  const handleMissionSaved = useCallback(() => {
    setShowComposer(false);
    setSelectedMission(null);
    refresh();
  }, [refresh]);

  const handleToggleEnabled = useCallback(
    (_id: string, _enabled: boolean) => { refresh(); },
    [refresh],
  );

  const handleCreateMission = useCallback(() => {
    setSelectedRun(null);
    setSelectedMission(null);
    setShowComposer(true);
  }, []);

  const missionLinkedRuns = useMemo(() => {
    if (!selectedMission) return [];
    return data.recentRuns
      .filter((r) => r.input.slice(0, 60) === selectedMission.input?.slice(0, 60))
      .slice(0, 5);
  }, [selectedMission, data.recentRuns]);

  const missionLinkedAssets = useMemo(() => {
    if (!selectedMission || missionLinkedRuns.length === 0) return [];
    const ids = new Set(missionLinkedRuns.map((r) => r.id));
    return data.assets.filter((a) => ids.has(a.runId)).slice(0, 5);
  }, [selectedMission, missionLinkedRuns, data.assets]);

  return (
    <aside className="hidden h-full w-[380px] shrink-0 flex-col bg-white/2 backdrop-blur-3xl xl:flex relative">
      {/* Tab header */}
      <div className="flex h-12 items-center gap-6 px-6 shrink-0 z-20">
        <button
          onClick={() => { setActiveTab("live"); setSelectedAssetId(null); }}
          className={`text-[10px] font-mono tracking-widest transition-colors duration-300 ${activeTab === "live" ? "text-white" : "text-white/30 hover:text-white/60"}`}
        >
          LIVE
        </button>
        <button
          onClick={() => { setActiveTab("artifacts"); setSelectedRun(null); setSelectedMission(null); setShowComposer(false); }}
          className={`text-[10px] font-mono tracking-widest transition-colors duration-300 ${activeTab === "artifacts" ? "text-white" : "text-white/30 hover:text-white/60"}`}
        >
          ARTIFACTS
        </button>
        <span
          className={`ml-auto h-[5px] w-[5px] rounded-full transition-colors duration-500 ${
            connected ? "bg-emerald-400/80" : "bg-white/10"
          }`}
        />
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── LIVE TAB ── */}
        <div className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${activeTab === "live" ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}>

          {/* Master view — fades out when detail is active */}
          <div className={`absolute inset-0 flex flex-col px-6 transition-all duration-300 ease-in-out ${contextPane === "none" ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}>
            <ActivitySection
              currentRun={data.currentRun}
              runs={data.recentRuns}
              liveEvents={liveEvents}
              loading={loading}
              error={error}
              selectedRunId={selectedRun?.id}
              onRunSelect={handleRunSelect}
            />
            <MissionsSection
              missions={data.missions}
              loading={loading}
              error={error}
              selectedMissionId={selectedMission?.id}
              onMissionSelect={handleMissionSelect}
              onCreateMission={handleCreateMission}
            />
          </div>

          {/* Detail view — fades in over master */}
          <div className={`absolute inset-0 flex flex-col px-6 overflow-y-auto scrollbar-hide transition-all duration-300 ease-in-out ${contextPane !== "none" ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-105 pointer-events-none"}`}>
            {contextPane === "timeline" && selectedRun && (
              <RunTimelineSection
                selectedRun={selectedRun}
                onDeselect={() => setSelectedRun(null)}
                onAssetSelect={handleAssetSelect}
              />
            )}
            {contextPane === "composer" && (
              <MissionComposer
                onSaved={handleMissionSaved}
                onCancel={() => setShowComposer(false)}
              />
            )}
            {contextPane === "mission" && selectedMission && (
              <MissionDetailSection
                mission={selectedMission}
                linkedRuns={missionLinkedRuns}
                linkedAssets={missionLinkedAssets}
                onClose={() => setSelectedMission(null)}
                onRunSelect={(runId) => {
                  const run = data.recentRuns.find((r) => r.id === runId);
                  if (run) handleRunSelect(run);
                }}
                onAssetSelect={handleAssetSelect}
                onToggleEnabled={handleToggleEnabled}
                onRefresh={refresh}
              />
            )}
          </div>
        </div>

        {/* ── ARTIFACTS TAB ── */}
        <div className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${activeTab === "artifacts" ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}>

          {/* Master — asset list */}
          <div className={`absolute inset-0 flex flex-col px-6 overflow-y-auto scrollbar-hide transition-all duration-300 ease-in-out ${!selectedAssetId ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}>
            <AssetsSection
              assets={data.assets}
              loading={loading}
              error={error}
              selectedAssetId={selectedAssetId ?? undefined}
              onAssetSelect={handleAssetSelect}
            />
          </div>

          {/* Detail — asset detail */}
          <div className={`absolute inset-0 flex flex-col px-6 overflow-y-auto scrollbar-hide transition-all duration-300 ease-in-out ${selectedAssetId ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-105 pointer-events-none"}`}>
            {selectedAssetId && (
              <AssetDetailSection
                assetId={selectedAssetId}
                onClose={() => setSelectedAssetId(null)}
                onOpenSourceRun={handleOpenSourceRun}
              />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
