/**
 * Tool Abstraction Layer — Types.
 *
 * Provides a capability-based model for tools so the orchestrator
 * can select and expose a small, context-aware set to the UI,
 * regardless of how many raw implementations exist.
 */

export type ToolCapability =
  | "messaging"
  | "finance"
  | "research"
  | "documents"
  | "calendar"
  | "automation";

export type ToolContext =
  | "inbox"
  | "calendar"
  | "files"
  | "finance"
  | "research"
  | "general";

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  capability: ToolCapability;
  surfaceLabel: string;
  handler: string;
  contexts: ToolContext[];
}

export interface ToolSurfaceItem {
  id: string;
  label: string;
  capability: ToolCapability;
}
