/**
 * Tool Abstraction Layer — Types.
 *
 * Capabilities + contextes utilisés par le routeur de capabilities et le
 * système d'agents. NOTE : `registry.ts` et `surface-selector.ts` ont été
 * supprimés (jamais consommés par l'UI utilisateur). Les types orphelins
 * (ToolDefinition, ToolParameterDef, ToolSurfaceItem) ont été retirés
 * avec eux. Si une vraie palette UI émerge un jour, ré-introduire les
 * types nécessaires côté composant cible.
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
