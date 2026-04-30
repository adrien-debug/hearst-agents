/**
 * Registry des workflow tool handlers.
 *
 * Chaque tool référencé dans un WorkflowGraph (`node.kind === "tool_call"`)
 * doit avoir une entrée ici. Les routes `/missions/[id]/run` et autres
 * runners délèguent à `executeWorkflowTool(name, args, ctx)`.
 *
 * Si un tool est inconnu, on retourne un échec explicite `tool_not_implemented`
 * au lieu d'un faux succès silencieux — c'est volontaire pour que les QA
 * voient immédiatement quels tools manquent au lieu d'avoir un workflow
 * "vert" qui n'a rien fait.
 */

import type { WorkflowHandler, WorkflowHandlerContext, WorkflowHandlerResult } from "./types";
import { pmsListArrivalsToday } from "./pms-list-arrivals-today";
import { pmsUpdateRequestStatus } from "./pms-update-request-status";
import { aiDraftWelcomeNotes } from "./ai-draft-welcome-notes";
import { aiClassifyPriority } from "./ai-classify-priority";
import { slackSendMessage } from "./slack-send-message";

export const WORKFLOW_HANDLERS: Record<string, WorkflowHandler> = {
  pms_list_arrivals_today: pmsListArrivalsToday,
  pms_update_request_status: pmsUpdateRequestStatus,
  ai_draft_welcome_notes: aiDraftWelcomeNotes,
  ai_classify_priority: aiClassifyPriority,
  slack_send_message: slackSendMessage,
};

export async function executeWorkflowTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: WorkflowHandlerContext,
): Promise<WorkflowHandlerResult> {
  const handler = WORKFLOW_HANDLERS[toolName];
  if (!handler) {
    return {
      success: false,
      error: `tool_not_implemented: ${toolName}`,
      output: { errorCode: "tool_not_implemented", toolName },
    };
  }

  try {
    return await handler(args, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export type { WorkflowHandler, WorkflowHandlerContext, WorkflowHandlerResult } from "./types";
