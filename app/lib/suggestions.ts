/**
 * Proactive suggestion engine — rule-based triggers.
 * Ultra-short messages, single action per suggestion.
 */

import type { UnifiedMessage } from "@/lib/connectors/unified-types";

// Types locaux — indépendants du système de missions legacy
export type ActionStatus = "waiting" | "running" | "completed" | "failed";

export interface MissionAction {
  id: string;
  label: string;
  status: ActionStatus;
  service?: string;
}

export interface Mission {
  id: string;
  title: string;
  surface: string;
  status: "created" | "active" | "completed" | "failed";
  actions: MissionAction[];
  services: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Suggestion {
  id: string;
  label: string;
  actionLabel: string;
  action: SuggestionAction;
}

export type SuggestionAction =
  | { type: "mission"; mission: Mission }
  | { type: "navigate"; route: string }
  | { type: "filter"; tab: string };

let _counter = 0;
function nextId(): string {
  return `s-${++_counter}-${Date.now()}`;
}

function step(id: string, label: string, service?: string): { id: string; label: string; status: ActionStatus; service?: string } {
  return { id, label, status: "waiting" as ActionStatus, service };
}

export function detectSuggestions(messages: UnifiedMessage[]): Suggestion | null {
  if (messages.length === 0) return null;

  const urgent = messages.filter((m) => m.priority === "urgent");
  const unread = messages.filter((m) => !m.read);
  const low = messages.filter((m) => m.priority === "low");

  if (urgent.length > 0) {
    const n = nextId();
    return {
      id: n,
      label: `${urgent.length} urgent${urgent.length > 1 ? "s" : ""}`,
      actionLabel: "Résumer",
      action: {
        type: "mission",
        mission: {
          id: `m-urgent-${n}`,
          title: "Résumer les urgents",
          surface: "inbox",
          status: "created",
          actions: [
            step(`${n}-0`, "Récupération des données", "Gmail"),
            step(`${n}-1`, "Analyse"),
            step(`${n}-2`, "Résumé"),
          ],
          services: ["Gmail", "Slack"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    };
  }

  if (low.length >= 3) {
    return {
      id: nextId(),
      label: `${low.length} newsletters`,
      actionLabel: "Ignorer tout",
      action: { type: "filter", tab: "all" },
    };
  }

  if (unread.length >= 5) {
    const n = nextId();
    return {
      id: n,
      label: `${unread.length} non lus`,
      actionLabel: "Résumer",
      action: {
        type: "mission",
        mission: {
          id: `m-unread-${n}`,
          title: "Résumer les non lus",
          surface: "inbox",
          status: "created",
          actions: [
            step(`${n}-0`, "Récupération des données", "Gmail"),
            step(`${n}-1`, "Analyse"),
            step(`${n}-2`, "Résumé"),
          ],
          services: ["Gmail"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    };
  }

  return null;
}
