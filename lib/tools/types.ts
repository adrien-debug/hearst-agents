/**
 * Tool Abstraction Layer — Types.
 *
 * Provides a capability-based model for tools so the orchestrator
 * can select and expose a small, context-aware set to the UI,
 * regardless of how many raw implementations exist.
 */

export type ToolCapability =
  | "messaging"
  | "messaging_send"
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

export interface ToolParameterDef {
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  capability: ToolCapability;
  surfaceLabel: string;
  handler: string;
  contexts: ToolContext[];
  parameters?: Record<string, ToolParameterDef>;
}

export interface ToolSurfaceItem {
  id: string;
  label: string;
  capability: ToolCapability;
}
