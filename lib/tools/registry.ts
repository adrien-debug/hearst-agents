/**
 * Tool Registry — In-memory registry of tool definitions.
 *
 * Tools are registered at module load time. The orchestrator queries
 * the registry to build a context-aware tool surface for the UI.
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

// ── Seed tools ───────────────────────────────────────────────

registerTool({
  id: "get_messages",
  name: "Get Messages",
  description: "Retrieve user messages (email, Slack)",
  capability: "messaging",
  surfaceLabel: "Messages",
  handler: "get_messages",
  contexts: ["inbox", "general"],
});

registerTool({
  id: "get_calendar_events",
  name: "Get Calendar Events",
  description: "Retrieve calendar events",
  capability: "calendar",
  surfaceLabel: "Agenda",
  handler: "get_calendar_events",
  contexts: ["calendar", "general"],
});

registerTool({
  id: "get_files",
  name: "Get Files",
  description: "Retrieve documents from Drive",
  capability: "documents",
  surfaceLabel: "Documents",
  handler: "get_files",
  contexts: ["files", "general"],
});

registerTool({
  id: "search_web",
  name: "Search Web",
  description: "Search external information on the web",
  capability: "research",
  surfaceLabel: "Recherche",
  handler: "searchWeb",
  contexts: ["research", "general"],
});

registerTool({
  id: "generate_report",
  name: "Generate Report",
  description: "Create a structured report or document",
  capability: "documents",
  surfaceLabel: "Rapport",
  handler: "generateReport",
  contexts: ["research", "finance", "general"],
});

registerTool({
  id: "export_excel",
  name: "Export Excel",
  description: "Export data to Excel format",
  capability: "finance",
  surfaceLabel: "Export",
  handler: "exportExcel",
  contexts: ["finance"],
});

registerTool({
  id: "analyze_data",
  name: "Analyze Data",
  description: "Analyze and summarize structured data",
  capability: "finance",
  surfaceLabel: "Analyse",
  handler: "analyzeData",
  contexts: ["finance", "research"],
});

registerTool({
  id: "schedule_task",
  name: "Schedule Task",
  description: "Create a scheduled automation",
  capability: "automation",
  surfaceLabel: "Planifier",
  handler: "scheduleTask",
  contexts: ["general", "inbox", "calendar"],
});
