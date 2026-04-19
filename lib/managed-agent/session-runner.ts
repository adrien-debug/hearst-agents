/**
 * Session runner — executes a managed agent session and yields normalized events.
 *
 * Abstracts the Anthropic SSE protocol into simple events consumable by route.ts.
 */

import { getAnthropicClient, createSession } from "./client";

export interface ManagedAgentEvent {
  type: "step" | "message" | "idle" | "error";
  /** Tool name (for step events) */
  tool?: string;
  /** Status of the step */
  status?: "running" | "done" | "error";
  /** Text content (for message events) */
  content?: string;
}

interface RawEvent {
  type: string;
  name?: string;
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Run a managed agent session with a user message.
 * Yields normalized events as the agent works.
 */
export async function* runManagedSession(
  userMessage: string,
  title?: string,
): AsyncGenerator<ManagedAgentEvent> {
  const client = getAnthropicClient();
  const session = await createSession(title);

  console.log(`[ManagedAgent] Running session ${session.id} — msg="${userMessage.slice(0, 60)}"`);

  const beta = client.beta as unknown as {
    sessions: {
      events: {
        stream: (sessionId: string) => AsyncIterable<RawEvent> & { close?: () => void };
        send: (sessionId: string, params: { events: Array<{ type: string; content: Array<{ type: string; text: string }> }> }) => Promise<void>;
      };
    };
  };

  // Open the stream first
  const stream = beta.sessions.events.stream(session.id);

  // Send the user message
  await beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: userMessage }],
      },
    ],
  });

  let fullText = "";

  try {
    for await (const event of stream) {
      switch (event.type) {
        case "agent.tool_use":
          yield {
            type: "step",
            tool: event.name ?? "unknown",
            status: "running",
          };
          break;

        case "agent.tool_result":
          yield {
            type: "step",
            tool: event.name ?? "unknown",
            status: "done",
          };
          break;

        case "agent.message": {
          const text = (event.content ?? [])
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text!)
            .join("");
          if (text) {
            fullText += text;
            yield { type: "message", content: text };
          }
          break;
        }

        case "session.status_idle":
          yield { type: "idle", content: fullText };
          return;

        case "error":
          yield { type: "error", content: "Erreur agent. Réessayez." };
          return;
      }
    }
  } finally {
    if ("close" in stream && typeof stream.close === "function") {
      stream.close();
    }
  }

  // Safety: if stream ends without idle event
  if (fullText) {
    yield { type: "idle", content: fullText };
  } else {
    yield { type: "error", content: "Session terminée sans résultat." };
  }
}
