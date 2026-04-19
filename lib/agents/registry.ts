/**
 * Agent Registry — In-memory registry of named agent definitions.
 *
 * The orchestrator queries this registry to select which agent
 * handles a given context/intent in CUSTOM_AGENT mode.
 */

import type { AgentDefinition } from "./types";

const agents: Map<string, AgentDefinition> = new Map();

export function registerAgent(agent: AgentDefinition): void {
  agents.set(agent.id, agent);
}

export function getAgentById(id: string): AgentDefinition | undefined {
  return agents.get(id);
}

export function getAllAgents(): AgentDefinition[] {
  return Array.from(agents.values());
}

export function getAgentsByContext(context: string): AgentDefinition[] {
  return Array.from(agents.values()).filter(
    (a) => a.defaultContext === context,
  );
}

// ── Seed agents ──────────────────────────────────────────────

registerAgent({
  id: "inbox_agent",
  name: "Inbox Agent",
  description: "Manages emails and messaging",
  capabilities: ["messaging"],
  allowedTools: ["get_messages", "schedule_task"],
  defaultContext: "inbox",
});

registerAgent({
  id: "calendar_agent",
  name: "Calendar Agent",
  description: "Manages calendar and scheduling",
  capabilities: ["calendar"],
  allowedTools: ["get_calendar_events", "schedule_task"],
  defaultContext: "calendar",
});

registerAgent({
  id: "research_agent",
  name: "Research Agent",
  description: "Searches and generates reports",
  capabilities: ["research", "documents"],
  allowedTools: ["search_web", "generate_report", "analyze_data"],
  defaultContext: "research",
});

registerAgent({
  id: "finance_agent",
  name: "Finance Agent",
  description: "Handles financial analysis and exports",
  capabilities: ["finance"],
  allowedTools: ["export_excel", "analyze_data", "generate_report"],
  defaultContext: "finance",
});

registerAgent({
  id: "files_agent",
  name: "Files Agent",
  description: "Manages documents and files",
  capabilities: ["documents"],
  allowedTools: ["get_files", "generate_report"],
  defaultContext: "files",
});

registerAgent({
  id: "general_agent",
  name: "General Agent",
  description: "Handles general requests across all contexts",
  capabilities: ["messaging", "calendar", "documents", "research"],
  allowedTools: [
    "get_messages",
    "get_calendar_events",
    "get_files",
    "search_web",
    "generate_report",
    "schedule_task",
  ],
  defaultContext: "general",
});
