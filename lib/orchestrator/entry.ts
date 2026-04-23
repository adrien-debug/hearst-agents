/**
 * Orchestrator Entry — v2 SSE Pipeline.
 *
 * Canonical entry point for the orchestration engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { orchestrate } from "./index";

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
 * Entry point for the v2 SSE orchestration pipeline.
 * Returns a ReadableStream suitable for SSE responses.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: OrchestrateInput,
): ReadableStream {
  return orchestrate(db, input);
}
