/**
 * Connector Router
 *
 * Route les requêtes vers:
 * - Connector Packs (nouveau) si disponible
 * - Nango (legacy) en fallback
 *
 * Pattern: Strangler Fig — migration progressive sans breaking changes
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getPackLoader } from "./packs";
import { getNangoClient } from "./nango/client";
import type { ConnectorManifest } from "./packs/types";

export interface RouterContext {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
}

export interface RouterResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  source: "pack" | "nango" | "none";
  latencyMs: number;
}

/**
 * Route une requête connector
 *
 * 1. Check Pack availability
 * 2. Si Pack dispo → utiliser Pack
 * 3. Sinon → fallback Nango (legacy)
 * 4. Sinon → error
 */
export async function routeConnectorRequest<T>(
  connectorId: string,
  operation: "list" | "get" | "create" | "update" | "delete",
  params: unknown,
  context: RouterContext
): Promise<RouterResult<T>> {
  const start = Date.now();

  // 1. Check if connector exists in Packs
  const packLoader = getPackLoader();
  const packConnector = packLoader.getConnector(connectorId);

  if (packConnector) {
    // Try Pack first
    const result = await executePackOperation<T>(
      packConnector,
      operation,
      params,
      context
    );

    if (result.success) {
      return {
        ...result,
        source: "pack",
        latencyMs: Date.now() - start,
      };
    }

    // Pack failed, try Nango fallback if available
    console.warn(
      `[Router] Pack ${connectorId} failed, trying Nango fallback: ${result.error}`
    );
  }

  // 2. Fallback to Nango (legacy)
  const nangoResult = await executeNangoOperation<T>(
    connectorId,
    operation,
    params,
    context
  );

  return {
    ...nangoResult,
    source: nangoResult.success ? "nango" : "none",
    latencyMs: Date.now() - start,
  };
}

/**
 * Execute via Connector Pack
 */
async function executePackOperation<T>(
  manifest: ConnectorManifest,
  operation: string,
  params: unknown,
  context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    // Check if connector is enabled for this tenant/user
    const isEnabled = await checkConnectorEnabled(
      manifest.id,
      context.tenantId,
      context.userId,
      context.db
    );

    if (!isEnabled) {
      return {
        success: false,
        error: `Connector ${manifest.id} not enabled for this user`,
      };
    }

    // Get credentials
    const credentials = await getPackCredentials(
      manifest.id,
      context.tenantId,
      context.userId,
      context.db
    );

    if (!credentials) {
      return {
        success: false,
        error: `No credentials for ${manifest.id}. Please connect first.`,
      };
    }

    // Route to specific connector implementation
    switch (manifest.id) {
      case "stripe":
        return await executeStripeOperation<T>(
          operation,
          params,
          credentials,
          context
        );
      // Add more pack connectors here as they're implemented
      default:
        return {
          success: false,
          error: `Pack connector ${manifest.id} not yet implemented`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute via Nango (legacy)
 */
async function executeNangoOperation<T>(
  connectorId: string,
  operation: string,
  params: unknown,
  context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const nango = getNangoClient();

    // Map operation to Nango proxy
    const response = await nango.proxy({
      providerConfigKey: connectorId,
      connectionId: `${context.tenantId}:${context.userId}`,
      method: getHttpMethod(operation),
      endpoint: getNangoEndpoint(connectorId, operation, params),
      data: operation !== "get" && operation !== "list" ? params : undefined,
    });

    return {
      success: true,
      data: response.data as T,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if connector is enabled for tenant/user
 */
async function checkConnectorEnabled(
  connectorId: string,
  tenantId: string,
  userId: string,
  db: SupabaseClient
): Promise<boolean> {
  const { data, error } = await db
    .from("connector_instances")
    .select("status")
    .eq("connector_id", connectorId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return data.status === "active";
}

/**
 * Get credentials from pack connector instance
 */
async function getPackCredentials(
  connectorId: string,
  tenantId: string,
  userId: string,
  db: SupabaseClient
): Promise<Record<string, string> | null> {
  const { data, error } = await db
    .from("connector_instances")
    .select("config")
    .eq("connector_id", connectorId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data?.config) {
    return null;
  }

  return data.config as Record<string, string>;
}

/**
 * Execute Stripe-specific operation
 */
async function executeStripeOperation<T>(
  operation: string,
  params: unknown,
  credentials: Record<string, string>,
  context: RouterContext
): Promise<{ success: boolean; data?: T; error?: string }> {
  // Lazy load Stripe service to avoid circular deps
  const { StripeApiService, mapStripeChargesToPayments } = await import(
    "./packs/finance-pack/stripe"
  );

  const stripe = new StripeApiService({
    apiKey: credentials.accessToken || credentials.apiKey || "",
  });

  try {
    switch (operation) {
      case "list": {
        const resource = (params as { resource?: string }).resource;

        if (resource === "payments" || resource === "charges") {
          const charges = await stripe.listCharges();
          return {
            success: true,
            data: mapStripeChargesToPayments(charges) as T,
          };
        }

        if (resource === "invoices") {
          const invoices = await stripe.listInvoices();
          return {
            success: true,
            data: invoices as T,
          };
        }

        if (resource === "subscriptions") {
          const subs = await stripe.listSubscriptions();
          return {
            success: true,
            data: subs as T,
          };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      case "get": {
        const { resource, id } = params as { resource: string; id: string };

        if (resource === "charge") {
          const charge = await stripe.getCharge(id);
          return { success: true, data: charge as T };
        }

        return { success: false, error: `Unknown resource: ${resource}` };
      }

      default:
        return { success: false, error: `Operation ${operation} not supported` };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get HTTP method for operation
 */
function getHttpMethod(operation: string): "GET" | "POST" | "PUT" | "DELETE" {
  switch (operation) {
    case "list":
    case "get":
      return "GET";
    case "create":
      return "POST";
    case "update":
      return "PUT";
    case "delete":
      return "DELETE";
    default:
      return "GET";
  }
}

/**
 * Build Nango endpoint URL
 */
function getNangoEndpoint(
  connectorId: string,
  operation: string,
  params: unknown
): string {
  // Simple mapping for common connectors
  // This would be more sophisticated in production

  switch (connectorId) {
    case "gmail":
      return operation === "list" ? "/threads" : "/messages/${id}";
    case "slack":
      return operation === "list" ? "/conversations.list" : "/chat.postMessage";
    case "github":
      return operation === "list" ? "/user/repos" : "/repos/${owner}/${repo}";
    default:
      return "/";
  }
}

/**
 * Get router stats
 */
export function getRouterStats(): {
  availablePacks: number;
  legacyConnectors: number;
  routingTable: Array<{ id: string; source: "pack" | "nango" | "both" }>;
} {
  const packLoader = getPackLoader();
  const packs = packLoader.getAllConnectors();

  // Legacy connectors known to work with Nango
  const legacyConnectors = [
    "gmail",
    "slack",
    "google-drive",
    "google-calendar",
    "github",
    "jira",
    "trello",
    "asana",
    "notion",
    "airtable",
    "hubspot",
    "salesforce",
  ];

  const routingTable: Array<{ id: string; source: "pack" | "nango" | "both" }> =
    [];

  // All pack connectors
  for (const pack of packs) {
    const hasNango = legacyConnectors.includes(pack.id);
    routingTable.push({
      id: pack.id,
      source: hasNango ? "both" : "pack",
    });
  }

  // Legacy-only connectors
  for (const legacy of legacyConnectors) {
    if (!packs.find((p) => p.id === legacy)) {
      routingTable.push({ id: legacy, source: "nango" });
    }
  }

  return {
    availablePacks: packs.length,
    legacyConnectors: legacyConnectors.length,
    routingTable,
  };
}
