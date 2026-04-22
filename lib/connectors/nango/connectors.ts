/**
 * Nango Connectors Configuration
 *
 * Defines the 180+ connectors available via Nango.
 * These are standard APIs without custom HEARST logic.
 */

import type { NangoProvider } from "./types";

export interface ConnectorDefinition {
  id: NangoProvider;
  name: string;
  category: "crm" | "finance" | "support" | "marketing" | "project" | "design" | "automation" | "analytics" | "hr" | "other";
  description: string;
  authType: "oauth2" | "api_key" | "basic";
  docsUrl: string;
  popularActions: string[];
}

/**
 * The 6 initial connectors to migrate to Nango
 * (non-critical, standard APIs)
 */
export const INITIAL_NANGO_CONNECTORS: ConnectorDefinition[] = [
  {
    id: "hubspot",
    name: "HubSpot",
    category: "crm",
    description: "CRM, marketing, sales, and customer service platform",
    authType: "oauth2",
    docsUrl: "https://developers.hubspot.com",
    popularActions: ["get_contacts", "get_deals", "create_contact", "update_deal"],
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "finance",
    description: "Payment processing platform",
    authType: "oauth2",
    docsUrl: "https://stripe.com/docs/api",
    popularActions: ["get_charges", "get_customers", "get_invoices", "refund_charge"],
  },
  {
    id: "jira",
    name: "Jira",
    category: "project",
    description: "Issue and project tracking for software teams",
    authType: "oauth2",
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
    popularActions: ["get_issues", "create_issue", "update_issue", "get_projects"],
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "other",
    description: "Low-code platform for building collaborative apps",
    authType: "oauth2",
    docsUrl: "https://airtable.com/developers/web/api",
    popularActions: ["list_bases", "list_records", "create_record", "update_record"],
  },
  {
    id: "figma",
    name: "Figma",
    category: "design",
    description: "Collaborative interface design tool",
    authType: "oauth2",
    docsUrl: "https://www.figma.com/developers/api",
    popularActions: ["get_file", "get_comments", "post_comment", "get_components"],
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "automation",
    description: "Workflow automation platform",
    authType: "oauth2",
    docsUrl: "https://platform.zapier.com/docs/zaps",
    popularActions: ["trigger_zap", "get_zaps", "enable_zap", "disable_zap"],
  },
];

/**
 * Full list of 200+ Nango-supported connectors
 * Used for UI display and capability discovery
 */
export const ALL_NANGO_CONNECTORS: ConnectorDefinition[] = [
  ...INITIAL_NANGO_CONNECTORS,
  // Additional popular connectors (descriptions placeholder for now)
  { id: "salesforce", name: "Salesforce", category: "crm", description: "Enterprise CRM platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "mailchimp", name: "Mailchimp", category: "marketing", description: "Email marketing platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "intercom", name: "Intercom", category: "support", description: "Customer messaging platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "linear", name: "Linear", category: "project", description: "Issue tracking for modern teams", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "asana", name: "Asana", category: "project", description: "Work management platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "trello", name: "Trello", category: "project", description: "Visual collaboration tool", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "monday", name: "Monday.com", category: "project", description: "Work OS platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "quickbooks", name: "QuickBooks", category: "finance", description: "Accounting software", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "xero", name: "Xero", category: "finance", description: "Cloud accounting software", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "shopify", name: "Shopify", category: "finance", description: "E-commerce platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "zendesk", name: "Zendesk", category: "support", description: "Customer service platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "freshdesk", name: "Freshdesk", category: "support", description: "Help desk software", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "pipedrive", name: "Pipedrive", category: "crm", description: "Sales CRM", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "zoho", name: "Zoho CRM", category: "crm", description: "CRM software", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "snowflake", name: "Snowflake", category: "analytics", description: "Cloud data warehouse", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "bigquery", name: "Google BigQuery", category: "analytics", description: "Analytics data warehouse", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "mixpanel", name: "Mixpanel", category: "analytics", description: "Product analytics", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "amplitude", name: "Amplitude", category: "analytics", description: "Digital analytics", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "segment", name: "Segment", category: "analytics", description: "Customer data platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "workday", name: "Workday", category: "hr", description: "Enterprise HCM", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "bamboohr", name: "BambooHR", description: "HR software for SMBs", category: "hr", authType: "oauth2", docsUrl: "", popularActions: [] },
  { id: "gusto", name: "Gusto", category: "hr", description: "Payroll and HR platform", authType: "oauth2", docsUrl: "", popularActions: [] },
  // Note: Full list at https://docs.nango.dev/integrations/overview
];

/**
 * Get connector definition by ID
 */
export function getConnectorDefinition(id: NangoProvider): ConnectorDefinition | undefined {
  return ALL_NANGO_CONNECTORS.find((c) => c.id === id);
}

/**
 * Check if a provider is a Nango connector (vs native)
 */
export function isNangoConnector(id: NangoProvider): boolean {
  const nativeProviders = new Set(["gmail", "calendar", "drive", "slack", "notion", "github"]);
  return !nativeProviders.has(id);
}
