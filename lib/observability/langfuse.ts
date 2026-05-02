/**
 * Langfuse client — LLM observability (prompts, outputs, traces).
 * No-op si LANGFUSE_PUBLIC_KEY ou LANGFUSE_SECRET_KEY absent.
 *
 * Usage côté Anthropic :
 *   const trace = startTrace("orchestrate", { userId, missionId });
 *   const generation = trace?.generation({ name: "claude-sonnet", model, input });
 *   // ... call Anthropic ...
 *   generation?.end({ output, usage });
 */

import { Langfuse } from "langfuse";

let _client: Langfuse | null = null;

function getClient(): Langfuse | null {
  if (_client) return _client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  _client = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
  });
  return _client;
}

export function startTrace(name: string, metadata?: Record<string, unknown>) {
  const client = getClient();
  if (!client) return null;
  return client.trace({ name, metadata });
}
