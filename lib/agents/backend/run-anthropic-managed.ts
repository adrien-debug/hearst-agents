import { runManagedSession, type ManagedAgentEvent } from "../../managed-agent/session-runner";

export interface ManagedAgentResult {
  text: string;
  steps: Array<{ tool: string; status: string }>;
}

/**
 * Run a prompt through the Anthropic managed-agent backend.
 * Yields intermediate events for observability, then returns the final output.
 */
export async function runAnthropicManaged(input: {
  prompt: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  agentId?: string;
  onEvent?: (event: ManagedAgentEvent) => void;
}): Promise<ManagedAgentResult> {
  if (!input.tenantId || !input.workspaceId) {
    throw new Error("Managed agent execution requires tenant scope");
  }
  const steps: Array<{ tool: string; status: string }> = [];
  let fullText = "";

  for await (const event of runManagedSession(input.prompt, `run-${input.runId}`)) {
    input.onEvent?.(event);

    switch (event.type) {
      case "step":
        if (event.tool && event.status) {
          steps.push({ tool: event.tool, status: event.status });
        }
        break;

      case "message":
        if (event.content) fullText += event.content;
        break;

      case "idle":
        if (event.content) fullText = event.content;
        break;

      case "error":
        throw new Error(event.content ?? "Managed agent execution failed");
    }
  }

  return { text: fullText, steps };
}
