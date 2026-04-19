"use client";

import { useCallback, useState } from "react";
import { useRightPanel } from "@/app/hooks/use-right-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";
import type { RightPanelRun, RightPanelMission } from "@/lib/ui/right-panel/types";
import { ActivitySection } from "./ActivitySection";
import { AssetsSection } from "./AssetsSection";
import { AssetDetailSection } from "./AssetDetailSection";
import { MissionsSection } from "./MissionsSection";
import { MissionDetailSection } from "./MissionDetailSection";
import { ConnectorsSection } from "./ConnectorsSection";
import { RunTimelineSection, type SelectedRun } from "./RunTimelineSection";
import { MissionComposer } from "../missions/MissionComposer";

export default function RightPanel() {
  const { data, loading, error, refresh } = useRightPanel();
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;
  const liveEvents = stream?.liveEvents ?? [];

  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<RightPanelMission | null>(null);
  const [showComposer, setShowComposer] = useState(false);

  const handleRunSelect = useCallback(
    (run: RightPanelRun) => {
      if (selectedRun?.id === run.id) {
        setSelectedRun(null);
        return;
      }
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

  const handleDeselect = useCallback(() => setSelectedRun(null), []);

  const handleAssetSelect = useCallback(
    (assetId: string) => {
      setSelectedAssetId(selectedAssetId === assetId ? null : assetId);
    },
    [selectedAssetId],
  );

  const handleAssetClose = useCallback(() => setSelectedAssetId(null), []);

  const handleOpenSourceRun = useCallback(
    (runId: string) => {
      const run = data.recentRuns.find((r) => r.id === runId);
      if (run) {
        setSelectedRun({
          id: run.id,
          input: run.input,
          status: run.status,
          executionMode: run.executionMode,
          agentId: run.agentId,
        });
      }
    },
    [data.recentRuns],
  );

  const handleMissionSelect = useCallback(
    (mission: RightPanelMission) => {
      setSelectedMission(selectedMission?.id === mission.id ? null : mission);
    },
    [selectedMission],
  );

  const handleMissionClose = useCallback(() => setSelectedMission(null), []);

  const handleMissionSaved = useCallback(() => {
    setShowComposer(false);
    refresh();
  }, [refresh]);

  const handleCreateMission = useCallback(() => {
    setShowComposer(true);
    setSelectedMission(null);
  }, []);

  const handleToggleEnabled = useCallback(
    (_id: string, _enabled: boolean) => {
      refresh();
    },
    [refresh],
  );

  // Linked data for mission detail
  const missionLinkedRuns = selectedMission
    ? data.recentRuns.filter((r) => {
        // Match by missionId would be ideal, but we match on input similarity
        return r.input.slice(0, 60) === selectedMission.input?.slice(0, 60);
      }).slice(0, 5)
    : [];

  const missionLinkedRunIds = new Set(missionLinkedRuns.map((r) => r.id));
  const missionLinkedAssets = selectedMission
    ? data.assets.filter((a) => missionLinkedRunIds.has(a.runId)).slice(0, 5)
    : [];

  return (
    <aside className="hidden h-full w-[300px] shrink-0 flex-col border-l border-zinc-800/30 bg-zinc-950/95 xl:flex">
      <div className="flex h-10 items-center justify-between border-b border-zinc-800/20 px-4">
        <h2 className="text-[11px] font-medium tracking-wide text-zinc-500">
          Cockpit
        </h2>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-[5px] w-[5px] rounded-full ${
              connected ? "bg-emerald-400" : "bg-zinc-700"
            }`}
          />
          <span className="text-[10px] text-zinc-600">
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <ActivitySection
          currentRun={data.currentRun}
          runs={data.recentRuns}
          liveEvents={liveEvents}
          loading={loading}
          error={error}
          selectedRunId={selectedRun?.id}
          onRunSelect={handleRunSelect}
        />

        {selectedRun && (
          <RunTimelineSection
            selectedRun={selectedRun}
            onDeselect={handleDeselect}
            onAssetSelect={handleAssetSelect}
          />
        )}

        <AssetsSection
          assets={data.assets}
          loading={loading}
          error={error}
          selectedAssetId={selectedAssetId ?? undefined}
          onAssetSelect={handleAssetSelect}
        />

        {selectedAssetId && (
          <AssetDetailSection
            assetId={selectedAssetId}
            onClose={handleAssetClose}
            onOpenSourceRun={handleOpenSourceRun}
          />
        )}

        <MissionsSection
          missions={data.missions}
          loading={loading}
          error={error}
          selectedMissionId={selectedMission?.id}
          onMissionSelect={handleMissionSelect}
          onCreateMission={handleCreateMission}
          scheduler={data.scheduler}
          missionOpsSummary={data.missionOpsSummary}
        />

        {showComposer && (
          <MissionComposer
            onSaved={handleMissionSaved}
            onCancel={() => setShowComposer(false)}
          />
        )}

        {selectedMission && !showComposer && (
          <MissionDetailSection
            mission={selectedMission}
            linkedRuns={missionLinkedRuns}
            linkedAssets={missionLinkedAssets}
            onClose={handleMissionClose}
            onRunSelect={(runId) => {
              const run = data.recentRuns.find((r) => r.id === runId);
              if (run) handleRunSelect(run);
            }}
            onAssetSelect={handleAssetSelect}
            onToggleEnabled={handleToggleEnabled}
            onRefresh={refresh}
          />
        )}

        <ConnectorsSection />
      </div>
    </aside>
  );
}
