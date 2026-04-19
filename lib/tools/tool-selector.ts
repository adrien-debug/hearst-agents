/**
 * Tool Selector — Selects context-appropriate tools for the UI surface.
 *
 * Returns a small set (max 5) of tools relevant to the current context.
 */

import type { ToolContext, ToolSurfaceItem } from "./types";
import { getToolsByContext } from "./registry";

const MAX_SURFACE_TOOLS = 5;

export function selectToolsForContext(context: ToolContext): ToolSurfaceItem[] {
  const tools = getToolsByContext(context);

  return tools.slice(0, MAX_SURFACE_TOOLS).map((t) => ({
    id: t.id,
    label: t.surfaceLabel,
    capability: t.capability,
  }));
}
