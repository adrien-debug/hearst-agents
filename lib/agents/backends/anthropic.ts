/**
 * Agent Backends — Anthropic Managed Sessions
 *
 * Legacy-compatible wrapper. Delegates to backend-v2.
 */

import type { ManagedAgentResult } from "../backend-v2/types";
import { runOpenAIAssistantSession } from "../backend-v2/openai-assistant";

interface AnthropicManagedInput {
  prompt: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  onEvent?: (evt: { type: string; tool?: string; status?: string; content?: string }) => void;
}

export async function runAnthropicManaged(input: AnthropicManagedInput): Promise<ManagedAgentResult> {
  const events = runOpenAIAssistantSession(
    {
      backend: "anthropic_managed" as never,
      prompt: input.prompt,
      runId: input.runId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
    },
    { model: "claude-3-5-sonnet-20241022", name: "hearst-anthropic" },
  );

  let text = "";
  for await (const evt of events) {
    if (input.onEvent) input.onEvent(evt as never);
    if (evt.type === "message" && evt.content) text += evt.content;
  }

  return {
    text,
    status: "completed",
    steps: [],
    usage: { tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: 0 },
    backend: "anthropic_managed" as never,
  };
}

export type { ManagedAgentResult };
