/**
 * Unified Orchestrator Entry — Routes to v2 or legacy pipeline based on config.
 *
 * v2 pipeline: orchestrate() → ReadableStream (SSE)
 * v1 pipeline: runOrchestrator() → OrchestratorResult (pre-LLM classification)
 *
 * /api/orchestrate uses orchestrateV2() (SSE stream).
 * /api/chat uses the legacy pipeline directly (not routed here yet).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_CONFIG } from "@/lib/system/config";
import { orchestrate } from "./index";

export interface UnifiedOrchestrateInput {
  userId: string;
  message: string;
  conversationId?: string;
  surface?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  missionId?: string;
  tenantId?: string;
  workspaceId?: string;
}

/**
 * Unified entry point for the v2 SSE orchestration pipeline.
 * Returns a ReadableStream suitable for SSE responses.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: UnifiedOrchestrateInput,
): ReadableStream {
  if (!SYSTEM_CONFIG.useV2Orchestrator) {
    throw new Error(
      "[UnifiedOrchestrator] v2 orchestrator is disabled — enable SYSTEM_CONFIG.useV2Orchestrator",
    );
  }

  return orchestrate(db, input);
}
