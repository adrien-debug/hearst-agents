"use client";

import { useMemo, useState } from "react";
import { useRuntimeStore, type StreamEvent } from "@/stores/runtime";
import { toast } from "@/app/hooks/use-toast";

interface MissionRunRequest {
  missionId: string;
  missionName: string;
  scheduleLabel?: string;
  matchKind: "exact" | "prefix" | "substring";
}

/**
 * Inline mission run-confirm card surfaced from a chat turn.
 *
 * Triggered when the LLM picks `run_mission` (the user said « lance la
 * mission X »). The card stays visible after the run completes — using
 * `lastRunId` so it survives the idle transition (même pattern que
 * ChatConnectInline).
 */
function selectLatestRunRequest(
  events: StreamEvent[],
  runId: string | null,
): MissionRunRequest | null {
  if (!runId) return null;
  for (const ev of events) {
    if (ev.run_id !== runId) continue;
    if (ev.type === "mission_run_request") {
      const missionId = String(ev.mission_id ?? "").trim();
      const missionName = String(ev.mission_name ?? "").trim();
      const scheduleLabel = ev.schedule_label ? String(ev.schedule_label) : undefined;
      const matchKind = (ev.match_kind ?? "substring") as MissionRunRequest["matchKind"];
      if (!missionId || !missionName) return null;
      return { missionId, missionName, scheduleLabel, matchKind };
    }
  }
  return null;
}

const MATCH_LABEL: Record<MissionRunRequest["matchKind"], string> = {
  exact: "Correspondance exacte",
  prefix: "Préfixe",
  substring: "Approchant",
};

export function ChatMissionRunInline() {
  const events = useRuntimeStore((s) => s.events);
  const lastRunId = useRuntimeStore((s) => s.lastRunId);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const request = useMemo(
    () => selectLatestRunRequest(events, lastRunId),
    [events, lastRunId],
  );

  if (!request) return null;

  const handleRun = async () => {
    setBusy(true);
    setLastError(null);
    try {
      const res = await fetch(`/api/v2/missions/${encodeURIComponent(request.missionId)}/run`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as { ok?: boolean; runId?: string; error?: string };
      if (!res.ok || !data.ok) {
        const message = data.error ?? `Échec (HTTP ${res.status})`;
        setLastError(message);
        toast.error("Lancement impossible", message);
        return;
      }
      setDone(true);
      toast.success(`${request.missionName} lancée`, "Suis l'exécution dans /runs");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur réseau";
      setLastError(message);
      toast.error("Lancement impossible", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="mt-3 border border-[var(--cykan)]/40 bg-[var(--cykan)]/[0.04] px-4 py-3"
      role="region"
      aria-label="Confirmation de lancement de mission"
    >
      <div className="flex items-center gap-2 mb-2 t-9 font-medium text-[var(--cykan)]">
        <span>Mission</span>
        <span className="text-[var(--text-ghost)]">·</span>
        <span className="text-[var(--text-faint)]">{MATCH_LABEL[request.matchKind]}</span>
      </div>
      <p className="t-13 text-[var(--text-soft)] leading-[1.5]">
        <span className="font-medium text-[var(--text-l1)]">{request.missionName}</span>
        {request.scheduleLabel && (
          <span className="text-[var(--text-faint)]">
            {" — "}
            {request.scheduleLabel}
          </span>
        )}
      </p>

      {lastError && (
        <div className="mt-3 border border-[var(--danger)]/40 bg-[var(--danger)]/[0.06] px-3 py-2 t-11 text-[var(--danger)]">
          <div className="font-medium mb-1">Échec</div>
          <div className="text-[var(--text-soft)] leading-[1.45]">{lastError}</div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={busy || done}
          className="inline-flex items-center gap-2 px-3 py-1.5 t-11 font-medium border border-[var(--cykan)] text-[var(--cykan)] bg-[var(--cykan)]/[0.06] hover:bg-[var(--cykan)]/[0.12] transition-colors disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="w-1 h-1 rounded-pill bg-[var(--cykan)] animate-pulse" />
              <span>Lancement…</span>
            </>
          ) : done ? (
            <>
              <span>Lancée</span>
            </>
          ) : lastError ? (
            <>
              <span>Réessayer</span>
            </>
          ) : (
            <>
              <span>Lancer maintenant</span>
              <span>→</span>
            </>
          )}
        </button>
        <a
          href="/missions"
          className="t-9 font-light text-[var(--text-faint)] hover:text-[var(--cykan)]"
          title="Ouvrir la page Missions"
        >
          Voir toutes les missions
        </a>
      </div>
    </div>
  );
}
