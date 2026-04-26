/**
 * Delegate Connectors — Integration with Connector Router
 *
 * Wraps legacy connector calls with the new Pack-based router.
 * Provides fallback chain: Pack → Nango → Legacy direct
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { routeConnectorRequest } from "@/lib/connectors/router";
import { searchDriveFiles as legacySearchDrive, readDriveFileContent as legacyReadDrive } from "@/lib/connectors/packs/productivity-pack/services/drive";
import { searchEmails as legacySearchGmail } from "@/lib/connectors/packs/productivity-pack/services/gmail";

interface ConnectorContext {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
}

/**
 * Search files with Router (Pack → Nango → Legacy)
 */
export async function searchFiles(
  connectorId: "google-drive" | "drive",
  userId: string,
  keywords: string,
  limit: number,
  context: ConnectorContext,
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }>> {
  // Try router first (Pack or Nango)
  const result = await routeConnectorRequest<
    Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink?: string }>
  >(
    "google-drive",
    "list",
    { resource: "files", query: keywords, limit },
    context,
  );

  if (result.success && result.data) {
    // Router trace: success via result.source
    return result.data;
  }

  // Fallback to legacy direct connector
  return legacySearchDrive(userId, keywords, limit);
}

/**
 * Read file content with Router
 */
export async function readFileContent(
  connectorId: "google-drive" | "drive",
  userId: string,
  fileId: string,
  context: ConnectorContext,
): Promise<string> {
  const result = await routeConnectorRequest<{ content: string }>(
    "google-drive",
    "get",
    { resource: "file", id: fileId },
    context,
  );

  if (result.success && result.data?.content) {
    return result.data.content;
  }

  // Fallback
  return legacyReadDrive(userId, fileId);
}

/**
 * Search emails with Router
 */
export async function searchEmails(
  connectorId: "gmail",
  userId: string,
  query: string | undefined,
  limit: number,
  context: ConnectorContext,
): Promise<Array<{ id: string; sender: string; subject: string; date: string; body: string }>> {
  const result = await routeConnectorRequest<
    Array<{ id: string; sender: string; subject: string; date: string; body: string }>
  >(
    "gmail",
    "list",
    { resource: "messages", query, limit },
    context,
  );

  if (result.success && result.data) {
    // Router trace: success via result.source
    return result.data;
  }

  // Fallback to legacy
  return legacySearchGmail(userId, query, limit);
}

/**
 * Get Stripe payments (Pack only — no legacy fallback)
 */
export async function getStripePayments(
  userId: string,
  limit: number,
  context: ConnectorContext,
): Promise<
  Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    customerEmail?: string;
    createdAt: Date;
  }>
> {
  const result = await routeConnectorRequest<
    Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      customerEmail?: string;
      createdAt: Date;
    }>
  >("stripe", "list", { resource: "payments", limit }, context);

  if (!result.success) {
    throw new Error(`Stripe connector failed: ${result.error}`);
  }

  return result.data || [];
}

/**
 * Health check for connector
 */
export async function checkConnectorHealth(
  connectorId: string,
  context: ConnectorContext,
): Promise<{ healthy: boolean; source?: string; error?: string }> {
  const result = await routeConnectorRequest<{ status: string }>(
    connectorId,
    "get",
    { resource: "health" },
    context,
  );

  return {
    healthy: result.success,
    source: result.source,
    error: result.error,
  };
}
