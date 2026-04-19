/**
 * Conversation Memory — formatting helpers.
 *
 * Produces a compact text representation for injection into prompts.
 */

import type { ChatMessageMemory } from "./types";

const MAX_MEMORY_CHARS = 6000;

export function formatMemoryForPrompt(messages: ChatMessageMemory[]): string {
  if (messages.length === 0) return "";

  const lines: string[] = [];
  let totalChars = 0;

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "User" : "Assistant";
    const truncated =
      msg.content.length > 800 ? msg.content.slice(0, 800) + "…" : msg.content;
    const line = `${prefix}: ${truncated}`;

    if (totalChars + line.length > MAX_MEMORY_CHARS) break;
    lines.push(line);
    totalChars += line.length;
  }

  return lines.join("\n");
}

export function memoryToConversationHistory(
  messages: ChatMessageMemory[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({
    role: m.role,
    content:
      m.content.length > 1200 ? m.content.slice(0, 1200) + "…" : m.content,
  }));
}
