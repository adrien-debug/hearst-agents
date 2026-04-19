/**
 * Connector Platform — canonical types for the connector registry.
 *
 * All 200+ connectors will follow this model.
 */

export type ConnectorCapability =
  | "messaging"
  | "calendar"
  | "files"
  | "research"
  | "crm"
  | "finance"
  | "support"
  | "design"
  | "commerce"
  | "developer_tools"
  | "automation";

export interface ConnectorDefinition {
  id: string;
  label: string;
  provider: string;
  capabilities: ConnectorCapability[];
  authType: "oauth" | "api_key" | "service_account";
  isExternal: boolean;
  status: "active" | "beta" | "planned" | "deprecated";
}
