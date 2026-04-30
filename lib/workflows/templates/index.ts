/**
 * Catalogue des templates de workflows clonables depuis le Builder.
 */

import type { WorkflowGraph } from "../types";
import { dailyStandupTemplate } from "./daily-standup";
import { leadNurtureTemplate } from "./lead-nurture";

export interface WorkflowTemplateMeta {
  id: string;
  name: string;
  description: string;
  build: () => WorkflowGraph;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplateMeta[] = [
  {
    id: "daily-standup",
    name: "Daily standup",
    description:
      "Cron 9h → commits GitHub + updates Linear → synthèse → message Slack #standup",
    build: dailyStandupTemplate,
  },
  {
    id: "lead-nurture",
    name: "Lead nurture",
    description:
      "Webhook → HubSpot → branche selon stage → brouillon email → approval → envoi",
    build: leadNurtureTemplate,
  },
];

export function getTemplateById(id: string): WorkflowTemplateMeta | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
