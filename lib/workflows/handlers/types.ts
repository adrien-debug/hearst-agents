/**
 * Workflow handlers — types partagés.
 */

export interface WorkflowHandlerContext {
  userId: string;
  tenantId: string;
  workspaceId: string;
  runId: string;
  /** Mode preview : pas d'effet de bord, retour structuré "would do X". */
  preview?: boolean;
}

export interface WorkflowHandlerResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export type WorkflowHandler = (
  args: Record<string, unknown>,
  ctx: WorkflowHandlerContext,
) => Promise<WorkflowHandlerResult>;
