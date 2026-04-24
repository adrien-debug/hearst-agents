/**
 * Orchestrator Entry — Canonical routing for chat-first V2.
 *
 * V2 is the canonical path for all chat-first user-facing interactions.
 * V1 (legacy) is kept only for explicit backward compatibility and
 * non-chat usage (e.g., internal tools, migration window).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { orchestrate as orchestrateLegacyV1 } from "./index";
import { orchestrateV2 as orchestrateCanonicalV2, isV2Enabled, shouldUseV2 } from "./orchestrate-v2";

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
  /** Force legacy V1 execution (for explicit backward compatibility) */
  forceLegacyV1?: boolean;
}

/**
 * Canonical entry point for the SSE orchestration pipeline.
 *
 * Routing logic:
 * 1. If forceLegacyV1 is set → use V1 (explicit opt-out)
 * 2. If V2 is enabled and user matches rollout → use V2 (canonical path)
 * 3. Otherwise → fallback to V1 (safe default during transition)
 *
 * The goal is to converge all chat-first traffic to V2, eliminating
 * dual-stack ambiguity for the user-facing product.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: OrchestrateInput,
): ReadableStream {
  // Explicit legacy opt-out for non-chat or migration scenarios
  if (input.forceLegacyV1) {
    console.log(`[Orchestrator] Explicit legacy V1 requested for user ${input.userId}`);
    return orchestrateLegacyV1(db, input);
  }

  // Canonical path: V2 when enabled
  const useV2 = isV2Enabled() && shouldUseV2(input.userId);

  if (useV2) {
    console.log(`[Orchestrator] Canonical V2 path for user ${input.userId}`);
    return orchestrateCanonicalV2(db, {
      userId: input.userId,
      message: input.message,
      conversationId: input.conversationId,
      threadId: input.threadId,
      surface: input.surface,
      conversationHistory: input.conversationHistory,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      missionId: input.missionId,
    });
  }

  // Safe fallback during transition or if V2 disabled
  console.log(`[Orchestrator] Fallback to V1 for user ${input.userId} (V2 disabled or rollout)`);
  return orchestrateLegacyV1(db, input);
}
