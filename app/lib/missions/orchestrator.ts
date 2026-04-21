/**
 * @deprecated Legacy client mission orchestrator (calls /api/missions/execute).
 * Canonical mission execution: scheduler → orchestrate() or /api/v2/missions/[id]/run.
 * Still used by GlobalChat (proactive suggestion executeMission) and ControlPanel (approveMission).
 */
import type { Mission } from "./types";
import { getMissionRegistry } from "./registry";

const activeCancellers = new Map<string, AbortController>();

export async function executeMission(mission: Mission): Promise<void> {
  const registry = getMissionRegistry();
  const controller = new AbortController();
  activeCancellers.set(mission.id, controller);

  registry.dispatch({ type: "mission_created", mission });
  registry.dispatch({ type: "mission_started", missionId: mission.id });

  try {
    const res = await fetch("/api/missions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mission_id: mission.id,
        title: mission.title,
        surface: mission.surface,
        actions: mission.actions.map((a) => ({
          id: a.id,
          label: a.label,
          service: a.service,
        })),
        services: mission.services,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Erreur serveur" }));
      registry.dispatch({
        type: "mission_failed",
        missionId: mission.id,
        error: (err as Record<string, string>).error ?? "Erreur serveur",
      });
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      registry.dispatch({
        type: "mission_failed",
        missionId: mission.id,
        error: "Connexion interrompue",
      });
      return;
    }

    const decoder = new TextDecoder();

    while (true) {
      if (controller.signal.aborted) {
        reader.cancel();
        registry.dispatch({ type: "mission_cancelled", missionId: mission.id });
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
          handleServerEvent(mission.id, event, registry);
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (err) {
    if (controller.signal.aborted) {
      registry.dispatch({ type: "mission_cancelled", missionId: mission.id });
      return;
    }
    registry.dispatch({
      type: "mission_failed",
      missionId: mission.id,
      error: err instanceof Error ? err.message : "Erreur de connexion",
    });
  } finally {
    activeCancellers.delete(mission.id);
  }
}

function handleServerEvent(
  missionId: string,
  event: Record<string, unknown>,
  registry: ReturnType<typeof getMissionRegistry>,
) {
  const type = event.type as string;

  switch (type) {
    case "step_started":
      registry.dispatch({
        type: "step_started",
        missionId,
        actionId: event.action_id as string,
      });
      break;

    case "step_completed":
      registry.dispatch({
        type: "step_completed",
        missionId,
        actionId: event.action_id as string,
        preview: (event.preview as string) ?? undefined,
      });
      break;

    case "step_failed":
      registry.dispatch({
        type: "step_failed",
        missionId,
        actionId: event.action_id as string,
        error: (event.error as string) ?? "Erreur",
      });
      break;

    case "mission_awaiting_approval":
      registry.dispatch({
        type: "mission_awaiting_approval",
        missionId,
      });
      break;

    case "mission_completed":
      registry.dispatch({
        type: "mission_completed",
        missionId,
        result: (event.result as string) ?? "Terminé",
        resultData: (event.result_data as Record<string, unknown>) ?? undefined,
      });
      break;

    case "mission_failed":
      registry.dispatch({
        type: "mission_failed",
        missionId,
        error: (event.error as string) ?? "Erreur",
      });
      break;
  }
}

export async function approveMission(missionId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/missions/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission_id: missionId }),
    });
    if (!res.ok) return false;
    const registry = getMissionRegistry();
    registry.dispatch({ type: "mission_completed", missionId, result: "Validé et exécuté." });
    return true;
  } catch {
    return false;
  }
}

export async function executeReplyMission(
  missionId: string,
  fromName: string,
  _subject: string,
): Promise<void> {
  const mission: Mission = {
    id: missionId,
    title: `Répondre à ${fromName}`,
    surface: "inbox",
    status: "created",
    actions: [
      { id: `${missionId}-0`, label: "Lecture du message", status: "waiting", service: "Gmail" },
      { id: `${missionId}-1`, label: "Analyse du contexte", status: "waiting" },
      { id: `${missionId}-2`, label: "Rédaction de la réponse", status: "waiting" },
      { id: `${missionId}-3`, label: "Vérification avant envoi", status: "waiting" },
    ],
    services: ["Gmail"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return executeMission(mission);
}

export function cancelMission(missionId: string): void {
  const controller = activeCancellers.get(missionId);
  if (controller) controller.abort();
}
