/**
 * Orchestrator Entry — Unified entry point for chat-first orchestration.
 *
 * Post-refactor: Single unified orchestrator using Session Manager + Backend V2
 * with structured planning and tool execution.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { orchestrate as orchestrateUnified } from "./index";

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
 * Canonical entry point for the SSE orchestration pipeline.
 *
 * Now uses the unified orchestrator with Session Manager + Backend V2.
 * The old dual V1/V2 split has been consolidated into a single runtime.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: OrchestrateInput,
): ReadableStream {
  console.log(`[Orchestrator] Using unified orchestrator (Session Manager + Backend V2) for user ${input.userId}`);
  return orchestrateUnified(db, input);
}

// Backward compatibility: entry.ts is the canonical import point
export { orchestrateUnified as orchestrate };
