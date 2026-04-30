/**
 * Scheduled Mission types — recurring automations executed via the orchestrator.
 *
 * Server-side scheduled missions that run through the orchestrator.
 */

import { z } from "zod";

/**
 * Configuration d'export automatique pour une mission schedulée.
 * Quand enabled=true, un job `export_scheduled_report` est enqueué après
 * chaque run réussi de la mission.
 */
export const autoExportConfigSchema = z.object({
  enabled: z.boolean(),
  format: z.enum(["pdf", "excel"]),
  recipients: z
    .array(z.string().email("recipient doit être un email valide"))
    .min(1, "au moins un destinataire requis"),
  /** reportId cible — l'asset id du rapport à exporter. */
  reportId: z.string().uuid("reportId doit être un UUID valide"),
});

export type AutoExportConfig = z.infer<typeof autoExportConfigSchema>;

export interface ScheduledMission {
  id: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  name: string;
  input: string;
  schedule: string;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastRunId?: string;
  /** Export automatique optionnel — enqueué après chaque run réussi. */
  autoExport?: AutoExportConfig;
  /**
   * Workflow graph optionnel (Mission Control C3 Builder).
   * Quand présent, le run utilise `executeWorkflow` au lieu de l'orchestrator
   * standard. La forme correspond à WorkflowGraph (lib/workflows/types).
   */
  workflowGraph?: unknown;
}

export interface ScheduledMissionRun {
  missionId: string;
  runId: string;
  triggeredAt: number;
}
