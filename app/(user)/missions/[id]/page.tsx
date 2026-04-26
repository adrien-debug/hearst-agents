"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import type { FocalObject } from "@/stores/focal";

interface ApiMission {
  id: string;
  name: string;
  description: string;
  frequency: string;
  enabled: boolean;
  input?: string;
  lastRun?: string;
  nextRun?: string;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
  lastError?: string;
}

function missionToFocal(mission: ApiMission, threadId: string | null): FocalObject {
  const now = Date.now();
  const status = mission.opsStatus === "running" ? "active"
    : mission.opsStatus === "failed" ? "failed"
    : mission.enabled ? "ready"
    : "paused";
  const summary = [
    `Schedule: ${mission.frequency}`,
    mission.lastRun ? `Last run: ${mission.lastRun}` : "Never run",
    mission.enabled ? "Armed" : "Disabled",
  ].join(" · ");
  return {
    id: mission.id,
    type: mission.enabled ? "mission_active" : "mission_draft",
    status,
    title: mission.name,
    body: mission.input || mission.description,
    summary,
    missionId: mission.id,
    threadId: threadId ?? undefined,
    createdAt: now,
    updatedAt: now,
    primaryAction: mission.enabled
      ? { kind: "pause", label: "Pause mission" }
      : { kind: "resume", label: "Resume mission" },
  };
}

export default function MissionDeepLinkPage() {
  const params = useParams();
  const router = useRouter();
  const setFocal = useFocalStore((s) => s.setFocal);
  const activeThreadId = useNavigationStore((s) => s.activeThreadId);
  const [error, setError] = useState<string | null>(null);

  const missionId = (params?.id as string) || "";

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;

    async function loadAndRedirect() {
      try {
        const res = await fetch("/api/v2/missions");
        if (!res.ok) throw new Error("Failed to load missions");
        const data = await res.json();
        if (cancelled) return;
        const mission = (data.missions as ApiMission[] | undefined)?.find((m) => m.id === missionId);
        if (!mission) {
          setError("Mission not found");
          return;
        }
        setFocal(missionToFocal(mission, activeThreadId));
        router.replace("/");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load mission");
      }
    }

    loadAndRedirect();
    return () => {
      cancelled = true;
    };
  }, [missionId, activeThreadId, setFocal, router]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        {error ? (
          <>
            <p className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--danger)]">Error</p>
            <p className="t-13 text-[var(--text-muted)] max-w-sm">{error}</p>
            <button
              onClick={() => router.push("/missions")}
              className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            >
              ← Back to missions
            </button>
          </>
        ) : (
          <p className="t-9 font-mono tracking-[0.3em] uppercase text-[var(--text-faint)] animate-pulse halo-cyan-sm">
            Loading mission…
          </p>
        )}
      </div>
    </div>
  );
}
