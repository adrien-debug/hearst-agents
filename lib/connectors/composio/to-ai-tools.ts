/**
 * Converts Composio DiscoveredTool[] into Vercel AI SDK v6 tool objects.
 *
 * Write actions (send, create, delete, update …) get a `_preview` gate:
 *   - `_preview: true`  (default) → returns a formatted draft, no side-effect.
 *   - `_preview: false` → executes via Composio after user confirmation.
 *
 * Read-only tools bypass the gate entirely.
 */

import { jsonSchema } from "ai";
import type { Tool } from "ai";
import { executeComposioAction } from "./client";
import type { DiscoveredTool } from "./discovery";
import { isWriteAction, formatActionPreview } from "./write-guard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AiToolMap = Record<string, Tool<any, any>>;

function buildSchema(tool: DiscoveredTool, isWrite: boolean): Parameters<typeof jsonSchema>[0] {
  const base = (
    tool.parameters && typeof tool.parameters === "object"
      ? tool.parameters
      : { type: "object", properties: {} }
  ) as Record<string, unknown>;

  if (!isWrite) return base as Parameters<typeof jsonSchema>[0];

  // Inject _preview into write tool schemas
  const baseProps = (base.properties as Record<string, unknown>) ?? {};
  return {
    ...base,
    properties: {
      ...baseProps,
      _preview: {
        type: "boolean",
        description:
          "Set to true (default) to show a draft before executing — ALWAYS do this first. " +
          "Set to false ONLY when the user has explicitly confirmed with 'confirmer', 'oui', 'yes', 'go', or equivalent.",
        default: true,
      },
    },
  } as Parameters<typeof jsonSchema>[0];
}

export function toAiTools(tools: DiscoveredTool[], userId: string): AiToolMap {
  return Object.fromEntries(
    tools.map((t): [string, Tool<unknown, unknown>] => {
      const write = isWriteAction(t.name);

      return [
        t.name,
        {
          description: t.description || t.name,
          inputSchema: jsonSchema(buildSchema(t, write)),
          execute: async (rawArgs: unknown) => {
            const args = (rawArgs ?? {}) as Record<string, unknown>;

            if (write) {
              const isPreview = args._preview !== false;
              // Strip internal gate param before forwarding to Composio
              const { _preview: _p, ...composioArgs } = args;

              if (isPreview) {
                return formatActionPreview(t.name, composioArgs);
              }

              return executeComposioAction({
                action: t.name,
                entityId: userId,
                params: composioArgs,
              });
            }

            // Read-only: execute directly
            return executeComposioAction({
              action: t.name,
              entityId: userId,
              params: args,
            });
          },
        },
      ];
    }),
  );
}
