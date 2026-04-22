"use client";

import { useState, useEffect, useCallback } from "react";

export interface SchedulerInfo {
  mode: "leader" | "standby" | "local_fallback";
  instanceId: string;
  leaderInstanceId?: string;
  leaderExpiry?: number;
  leadershipExpiresAt?: number;
  lastPoll?: number;
  lastHeartbeat?: number;
  isLeader?: boolean;
  healthy?: boolean;
  currentMissions?: Array<{ id: string; name: string; startedAt: number }>;
}

export interface MissionInfo {
  id: string;
  missionId?: string;
  name: string;
  enabled: boolean;
  status: "idle" | "running" | "success" | "failed" | "blocked";
  lastRunStatus?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  runId?: string;
  lastRunId?: string;
  runningSince?: number;
  schedule?: string;
  input?: string;
  lastError?: string;
  error?: string;
}

export function useSchedulerAdmin(pollMs = 5000) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerInfo | null>(null);
  const [missions, setMissions] = useState<MissionInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, missionsRes] = await Promise.all([
        fetch("/api/v2/scheduler/status"),
        fetch("/api/v2/missions"),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setScheduler(statusData);
      }

      if (missionsRes.ok) {
        const missionsData = await missionsRes.json();
        setMissions(missionsData.missions || []);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  return { loading, error, scheduler, missions, refresh };
}
