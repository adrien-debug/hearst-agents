/**
 * Orchestrator Entry — Backend V2 Integration.
 *
 * Canonical entry point for the orchestration engine.
 * Routes to Backend V2 (Session Manager + Multi-Provider) when enabled.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { orchestrate } from "./index";
import { orchestrateV2 as orchestrateBackendV2, isV2Enabled, shouldUseV2 } from "./orchestrate-v2";

export interface OrchestrateInput {
  userId: string;
  message: string;
  conversationId?: string;
  surface?: string;
  threadId?: string;
  focalContext?: { id: string; objectType: string; title: string; status: string };
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  missionId?: string;
  tenantId?: string;
  workspaceId?: string;
}

/**
 * Entry point for the SSE orchestration pipeline.
 * Routes to Backend V2 when enabled and user matches rollout percentage.
 * Falls back to legacy V1 orchestration for backward compatibility.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: OrchestrateInput,
): ReadableStream {
  // Check if Backend V2 should be used
  const useBackendV2 = isV2Enabled() && shouldUseV2(input.userId);

  if (useBackendV2) {
    console.log(`[Orchestrator] Using Backend V2 for user ${input.userId}`);
    return orchestrateBackendV2(db, {
      userId: input.userId,
      message: input.message,
      conversationId: input.conversationId,
      threadId: input.threadId,
      surface: input.surface,
      conversationHistory: input.conversationHistory,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
    });
  }

  // Fallback to legacy V1 orchestration
  console.log(`[Orchestrator] Using Legacy V1 for user ${input.userId}`);
  return orchestrate(db, input);
}
