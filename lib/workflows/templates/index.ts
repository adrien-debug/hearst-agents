/**
 * Catalogue des templates de workflows clonables depuis le Builder.
 */

import type { WorkflowGraph } from "../types";
import { dailyStandupTemplate } from "./daily-standup";
import { leadNurtureTemplate } from "./lead-nurture";
import { guestArrivalPrepTemplate } from "./hospitality/guest-arrival-prep";
import { serviceRequestDispatchTemplate } from "./hospitality/service-request-dispatch";

export interface WorkflowTemplateMeta {
  id: string;
  name: string;
  description: string;
  /** Catégorie verticale optionnelle pour grouper l'affichage. */
  vertical?: "general" | "hospitality";
  build: () => WorkflowGraph;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateMeta[] = [
  {
    id: "daily-standup",
    name: "Daily standup",
    description:
      "Cron 9h → commits GitHub + updates Linear → synthèse → message Slack #standup",
    vertical: "general",
    build: dailyStandupTemplate,
  },
  {
    id: "lead-nurture",
    name: "Lead nurture",
    description:
      "Webhook → HubSpot → branche selon stage → brouillon email → approval → envoi",
    vertical: "general",
    build: leadNurtureTemplate,
  },
  {
    id: "hospitality-guest-arrival-prep",
    name: "Hospitality — Préparation arrivées VIP",
    description:
      "Cron 10h → arrivées du jour → filtre VIP → welcome notes (Claude) → approval → Slack #frontdesk",
    vertical: "hospitality",
    build: guestArrivalPrepTemplate,
  },
  {
    id: "hospitality-service-request-dispatch",
    name: "Hospitality — Dispatch service request",
    description:
      "Webhook → classify priority (Haiku) → urgent? alert manager : routing standard → update PMS → ticket",
    vertical: "hospitality",
    build: serviceRequestDispatchTemplate,
  },
];

export function getTemplateById(id: string): WorkflowTemplateMeta | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByVertical(
  vertical: WorkflowTemplateMeta["vertical"],
): WorkflowTemplateMeta[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.vertical === vertical);
}
