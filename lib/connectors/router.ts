/**
 * Connector Router — Decides Nango vs Native execution
 *
 * Routes API calls to either:
 * - Nango proxy (180+ standard connectors)
 * - Native adapters (20 critical connectors with custom logic)
 */

import type { NangoProvider } from "./nango/types";
import { nangoProxy, checkConnection as checkNangoConnection } from "./nango/proxy";
import type { ProxyOptions } from "./nango/proxy";

// ─── Native Providers (critical connectors) ─────────────────────────────

const NATIVE_PROVIDERS = new Set<NangoProvider>([
  "gmail",
  "calendar",
  "drive",
  "slack",
  "notion",
  "github",
]);

// ─── Router ──────────────────────────────────────────────────────────────

export interface ConnectorRequest {
  provider: NangoProvider;
  action: string;
  input: unknown;
}

export interface ConnectorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  latencyMs: number;
  via: "nango" | "native";
}

/**
 * Execute connector request via appropriate adapter
 */
export async function executeConnector(
  request: ConnectorRequest,
  options: ProxyOptions
): Promise<ConnectorResult> {
  const startTime = Date.now();

  // Route to native adapter for critical providers
  if (NATIVE_PROVIDERS.has(request.provider)) {
    return executeNative(request, options, startTime);
  }

  // Route to Nango for all others
  return executeNango(request, options, startTime);
}

/**
 * Check if a provider connection is active
 */
export async function isProviderConnected(
  userId: string,
  provider: NangoProvider
): Promise<boolean> {
  // For Nango providers
  if (!NATIVE_PROVIDERS.has(provider)) {
    return checkNangoConnection(userId, provider);
  }

  // For native providers — use unified layer
  const { hasCapability } = await import("@/lib/capabilities");
  const capability = mapProviderToCapability(provider);
  return hasCapability(capability, userId);
}

/**
 * List available connectors for a user
 */
export async function listAvailableConnectors(userId: string): Promise<{
  native: NangoProvider[];
  nango: NangoProvider[];
}> {
  const [native, nango] = await Promise.all([
    listNativeConnectors(userId),
    listNangoConnectors(userId),
  ]);

  return { native, nango };
}

// ─── Nango Execution ─────────────────────────────────────────────────────

async function executeNango(
  request: ConnectorRequest,
  options: ProxyOptions,
  startTime: number
): Promise<ConnectorResult> {
  try {
    // Map generic action to actual API endpoint
    const endpoint = mapActionToEndpoint(request.provider, request.action);
    const method = mapActionToMethod(request.action);

    const response = await nangoProxy(
      {
        provider: request.provider,
        endpoint,
        method,
        data: request.input,
      },
      options
    );

    return {
      success: true,
      data: response.data,
      latencyMs: Date.now() - startTime,
      via: "nango",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Nango proxy failed",
      latencyMs: Date.now() - startTime,
      via: "nango",
    };
  }
}

async function listNangoConnectors(userId: string): Promise<NangoProvider[]> {
  // Query Supabase for active Nango connections
  const { listActiveConnections } = await import("./nango/credentials");
  const connections = await listActiveConnections(userId);
  return connections.map((c) => c.provider);
}

// ─── Native Execution ────────────────────────────────────────────────────

async function executeNative(
  request: ConnectorRequest,
  options: ProxyOptions,
  startTime: number
): Promise<ConnectorResult> {
  try {
    // Dynamic import to avoid circular dependencies
    const nativeModule = await import(`@/lib/connectors/${request.provider}`);

    if (typeof nativeModule[request.action] !== "function") {
      throw new Error(`Native action ${request.action} not found for ${request.provider}`);
    }

    const result = await nativeModule[request.action](request.input, options.userId);

    return {
      success: true,
      data: result,
      latencyMs: Date.now() - startTime,
      via: "native",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Native execution failed",
      latencyMs: Date.now() - startTime,
      via: "native",
    };
  }
}

async function listNativeConnectors(userId: string): Promise<NangoProvider[]> {
  // Check native connections via capabilities
  const { hasCapability } = await import("@/lib/capabilities");
  const providers: NangoProvider[] = [];

  if (await hasCapability("messaging", userId)) providers.push("slack");
  if (await hasCapability("calendar", userId)) providers.push("calendar");
  if (await hasCapability("files", userId)) providers.push("drive");
  if (await hasCapability("messaging", userId)) providers.push("gmail");

  return providers;
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────

import type { Capability } from "@/lib/capabilities";

function mapProviderToCapability(provider: NangoProvider): Capability {
  const mapping: Record<string, Capability> = {
    gmail: "messaging",
    calendar: "calendar",
    drive: "files",
    slack: "messaging",
    notion: "files",
    github: "developer_tools",
  };
  return mapping[provider] || "messaging";
}

function mapActionToEndpoint(provider: string, action: string): string {
  // Common endpoint mappings
  const mappings: Record<string, Record<string, string>> = {
    hubspot: {
      get_contacts: "/crm/v3/objects/contacts",
      get_deals: "/crm/v3/objects/deals",
      create_contact: "/crm/v3/objects/contacts",
    },
    stripe: {
      get_charges: "/v1/charges",
      get_customers: "/v1/customers",
      get_invoices: "/v1/invoices",
    },
    jira: {
      get_issues: "/rest/api/3/search",
      create_issue: "/rest/api/3/issue",
    },
    airtable: {
      list_bases: "/v0/meta/bases",
      list_records: "/v0/{baseId}/{tableId}",
    },
    figma: {
      get_file: "/v1/files/{fileKey}",
      get_comments: "/v1/files/{fileKey}/comments",
    },
  };

  return mappings[provider]?.[action] || "/";
}

function mapActionToMethod(action: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  if (action.startsWith("create_") || action.startsWith("add_")) return "POST";
  if (action.startsWith("update_") || action.startsWith("modify_")) return "PUT";
  if (action.startsWith("delete_") || action.startsWith("remove_")) return "DELETE";
  return "GET";
}
