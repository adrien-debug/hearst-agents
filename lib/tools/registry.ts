/**
 * Tool Registry — In-memory registry of tool definitions for the UI palette.
 *
 * Tools are registered at module load time. The orchestrator queries
 * the registry via `surface-selector` to emit a `tool_surface` event at
 * the start of each run (consumed by the SSE adapter, the timeline persister,
 * and the admin canvas event-reducer for state transitions).
 *
 * NOTE — registry currently empty. The previous seed (13 tool-IDs : browse_web,
 * schedule_task, analyze_data, export_excel, generate_report, search_web,
 * get_messages, get_calendar_events, get_files, generate_image, parse_document,
 * execute_code, generate_video) was orphaned : those IDs did not match the
 * tools actually wired into the agent (`aiTools` in `ai-pipeline.ts`).
 *
 * If/when the user-facing tool palette is implemented, repopulate this file
 * with the real tools exposed to the agent : `web_search`, `generate_image`,
 * `run_code`, `parse_document`, `generate_video`, `generate_audio`,
 * `research_report`, `query_knowledge_graph`, `start_simulation`,
 * `get_crypto_prices`, `get_stock_quotes`, `enrich_company`, `enrich_contact`,
 * `start_meeting_bot`, `start_browser`, plus the Google natives
 * (`gmail_*`, `googlecalendar_*`, `googledrive_*`).
 */

import type { ToolCapability, ToolContext, ToolDefinition } from "./types";

const tools: ToolDefinition[] = [];

export function registerTool(tool: ToolDefinition): void {
  tools.push(tool);
}

export function getAllTools(): ToolDefinition[] {
  return tools;
}

export function getToolsByContext(context: ToolContext): ToolDefinition[] {
  return tools.filter((t) => t.contexts.includes(context));
}

export function getToolsByCapability(cap: ToolCapability): ToolDefinition[] {
  return tools.filter((t) => t.capability === cap);
}

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id);
}
