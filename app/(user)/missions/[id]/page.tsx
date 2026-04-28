"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFocalStore } from "@/stores/focal";
import { useNavigationStore } from "@/stores/navigation";
import { missionToFocal, type MissionLike } from "@/lib/ui/focal-mappers";

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
        const mission = (data.missions as MissionLike[] | undefined)?.find((m) => m.id === missionId);
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
            <p className="t-9 font-mono tracking-marquee uppercase text-[var(--danger)]">Error</p>
            <p className="t-13 text-[var(--text-muted)] max-w-sm">{error}</p>
            <button
              onClick={() => router.push("/missions")}
              className="t-9 font-mono tracking-marquee uppercase text-[var(--text-faint)] hover:text-[var(--cykan)] transition-colors"
            >
              ← Back to missions
            </button>
          </>
        ) : (
          <p className="t-9 font-mono tracking-marquee uppercase text-[var(--text-faint)] animate-pulse halo-cyan-sm">
            Loading mission…
          </p>
        )}
      </div>
    </div>
  );
}
