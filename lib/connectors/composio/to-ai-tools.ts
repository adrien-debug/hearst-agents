/**
 * Converts Composio DiscoveredTool[] into Vercel AI SDK v6 tool objects.
 *
 * Each returned tool has a real execute() callback that calls
 * executeComposioAction(), so streamText() will dispatch actual API
 * calls instead of just describing them.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { executeComposioAction } from "./client";
import type { DiscoveredTool } from "./discovery";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiToolMap = Record<string, Tool<any, any>>;

export function toAiTools(tools: DiscoveredTool[], userId: string): AiToolMap {
  return Object.fromEntries(
    tools.map((t): [string, Tool<unknown, unknown>] => [
      t.name,
      {
        description: t.description || t.name,
        // v6 uses inputSchema (not parameters)
        inputSchema: jsonSchema(
          (t.parameters && typeof t.parameters === "object"
            ? t.parameters
            : { type: "object", properties: {} }) as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (args: unknown) =>
          executeComposioAction({
            action: t.name,
            entityId: userId,
            params: (args ?? {}) as Record<string, unknown>,
          }),
      },
    ]),
  );
}
