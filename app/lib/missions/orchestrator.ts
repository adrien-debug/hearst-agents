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
    for (let i = 0; i < mission.actions.length; i++) {
      if (controller.signal.aborted) {
        registry.dispatch({ type: "mission_cancelled", missionId: mission.id });
        return;
      }

      const action = mission.actions[i];
      registry.dispatch({ type: "step_started", missionId: mission.id, actionId: action.id });

      try {
        await simulateStep(controller.signal);
      } catch (err) {
        if (controller.signal.aborted) {
          registry.dispatch({ type: "mission_cancelled", missionId: mission.id });
          return;
        }
        registry.dispatch({
          type: "step_failed",
          missionId: mission.id,
          actionId: action.id,
          error: err instanceof Error ? err.message : "Erreur inattendue",
        });
        registry.dispatch({
          type: "mission_failed",
          missionId: mission.id,
          error: `Étape "${action.label}" a échoué`,
        });
        return;
      }

      const isLast = i === mission.actions.length - 1;
      if (isLast) {
        registry.dispatch({
          type: "step_needs_approval",
          missionId: mission.id,
          actionId: action.id,
        });
        registry.dispatch({
          type: "mission_awaiting_approval",
          missionId: mission.id,
        });

        await delay(1200, controller.signal);
        if (controller.signal.aborted) {
          registry.dispatch({ type: "mission_cancelled", missionId: mission.id });
          return;
        }

        registry.dispatch({
          type: "step_completed",
          missionId: mission.id,
          actionId: action.id,
          preview: "Vérifié",
        });
      } else {
        registry.dispatch({
          type: "step_completed",
          missionId: mission.id,
          actionId: action.id,
          preview: action.label,
        });
      }
    }

    registry.dispatch({
      type: "mission_completed",
      missionId: mission.id,
      result: `${mission.title} — terminé avec succès.`,
    });
  } finally {
    activeCancellers.delete(mission.id);
  }
}

export async function executeReplyMission(
  missionId: string,
  fromName: string,
  subject: string,
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

  const registry = getMissionRegistry();
  const controller = new AbortController();
  activeCancellers.set(missionId, controller);

  registry.dispatch({ type: "mission_created", mission });
  registry.dispatch({ type: "mission_started", missionId });
  registry.setActiveSurface("inbox");

  try {
    for (let i = 0; i < mission.actions.length; i++) {
      if (controller.signal.aborted) {
        registry.dispatch({ type: "mission_cancelled", missionId });
        return;
      }

      const action = mission.actions[i];
      registry.dispatch({ type: "step_started", missionId, actionId: action.id });

      await delay(600 + Math.random() * 800, controller.signal);
      if (controller.signal.aborted) {
        registry.dispatch({ type: "mission_cancelled", missionId });
        return;
      }

      const isLast = i === mission.actions.length - 1;
      if (isLast) {
        registry.dispatch({ type: "step_needs_approval", missionId, actionId: action.id });
        registry.dispatch({ type: "mission_awaiting_approval", missionId });

        await delay(1200, controller.signal);
        if (controller.signal.aborted) {
          registry.dispatch({ type: "mission_cancelled", missionId });
          return;
        }

        registry.dispatch({ type: "step_completed", missionId, actionId: action.id, preview: "Vérifié" });
      } else {
        registry.dispatch({
          type: "step_completed",
          missionId,
          actionId: action.id,
          preview: action.label,
        });
      }
    }

    registry.dispatch({
      type: "mission_completed",
      missionId,
      result: `Réponse préparée pour ${fromName}.\n\nSujet : ${subject}`,
    });
  } finally {
    activeCancellers.delete(missionId);
  }
}

export function cancelMission(missionId: string): void {
  const controller = activeCancellers.get(missionId);
  if (controller) controller.abort();
}

function simulateStep(signal: AbortSignal): Promise<void> {
  return delay(800 + Math.random() * 1200, signal);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}
