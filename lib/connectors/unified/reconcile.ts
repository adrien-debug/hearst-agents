/**
 * Unified Connector Reconciler.
 *
 * Merges V1 auth truth (user_tokens) and V2 control-plane
 * (integration_connections) into one canonical list.
 *
 * Rules:
 * - auth truth + control-plane → connected
 * - auth truth only → connected (diverged, auto-heal queued)
 * - control-plane only → degraded for auth-required, connected for non-auth
 * - neither → disconnected (if connectable) or coming_soon
 */

import { createClient } from "@supabase/supabase-js";
import type { UnifiedConnectorRecord, UnifiedConnectorStatus } from "./types";
import { getConnectionsByScope } from "../control-plane/store";
import { registerProviderUsage } from "../control-plane/register";
import {
  getAllProviders,
  getConnectableProviders,
  getProviderLabel,
  getProviderCapabilitiesFromRegistry,
} from "@/lib/providers/registry";

interface AuthRecord {
  provider: string;
  connected: boolean;
}

async function getAuthRecords(userId: string): Promise<AuthRecord[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await sb
      .from("user_tokens")
      .select("provider, revoked_at, access_token_enc")
      .eq("user_id", userId);

    if (error || !data) return [];

    return data.map((row) => ({
      provider: row.provider as string,
      connected: !!row.access_token_enc && !row.revoked_at,
    }));
  } catch {
    return [];
  }
}

export async function getUnifiedConnectors(input: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}): Promise<UnifiedConnectorRecord[]> {
  const [authRecords, controlPlaneRecords] = await Promise.all([
    input.userId ? getAuthRecords(input.userId) : Promise.resolve([]),
    getConnectionsByScope({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
    }),
  ]);

  const authMap = new Map<string, AuthRecord>();
  for (const r of authRecords) {
    authMap.set(r.provider, r);
  }

  const cpMap = new Map<string, (typeof controlPlaneRecords)[number]>();
  for (const r of controlPlaneRecords) {
    cpMap.set(r.provider, r);
  }

  const allProviderIds = new Set<string>([
    ...authMap.keys(),
    ...cpMap.keys(),
    ...getAllProviders().map((p) => p.id),
  ]);
  const connectableSet = getConnectableProviders() as Set<string>;

  const results: UnifiedConnectorRecord[] = [];

  for (const provider of allProviderIds) {
    const auth = authMap.get(provider);
    const cp = cpMap.get(provider);

    const authConnected = auth?.connected ?? false;
    const cpConnected = cp?.status === "connected";
    const cpExists = !!cp;
    const authExists = !!auth;

    const canConnect = connectableSet.has(provider);

    let status: UnifiedConnectorStatus;
    let isDiverged = false;
    let reconciliationNote: string | undefined;

    if (!canConnect && !authExists && !cpExists) {
      status = "coming_soon";
    } else if (authConnected && cpConnected) {
      status = "connected";
    } else if (authConnected && !cpExists) {
      status = "connected";
      isDiverged = true;
      reconciliationNote = "Auth token exists but control-plane record missing — auto-healing";
      void healControlPlane(provider, input);
    } else if (authConnected && cpExists && !cpConnected) {
      if (cp!.status === "degraded" || cp!.status === "error") {
        status = "degraded";
        reconciliationNote = `Auth exists but control-plane reports ${cp!.status}`;
      } else {
        status = "connected";
        isDiverged = true;
        reconciliationNote = "Auth connected but control-plane status stale";
      }
    } else if (!authConnected && cpConnected) {
      if (canConnect) {
        status = "degraded";
        isDiverged = true;
        reconciliationNote = "Control-plane says connected but auth token missing or revoked";
      } else {
        status = "connected";
      }
    } else if (cpExists && !cpConnected) {
      status = cp!.status === "pending_auth" ? "pending_auth" : "disconnected";
    } else {
      status = canConnect ? "disconnected" : "coming_soon";
    }

    results.push({
      provider,
      label: getProviderLabel(provider),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      authConnected,
      controlPlaneConnected: cpConnected,
      status,
      capabilities: cp?.capabilities ?? getProviderCapabilitiesFromRegistry(provider),
      canConnect,
      lastCheckedAt: cp?.lastCheckedAt,
      lastError: cp?.lastError,
      source: {
        auth: authExists ? "present" : "missing",
        controlPlane: cpExists ? "present" : "missing",
      },
      isDiverged,
      reconciliationNote,
    });
  }

  return results.sort((a, b) => {
    const order: Record<UnifiedConnectorStatus, number> = {
      degraded: 0,
      disconnected: 1,
      pending_auth: 2,
      connected: 3,
      coming_soon: 4,
    };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });
}

async function healControlPlane(
  provider: string,
  scope: { tenantId: string; workspaceId: string; userId?: string },
): Promise<void> {
  try {
    await registerProviderUsage({
      provider,
      scope: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      },
    });
    console.log(`[UnifiedConnectors] Auto-healed control-plane for ${provider}`);
  } catch (err) {
    console.warn(`[UnifiedConnectors] Auto-heal failed for ${provider}:`, err);
  }
}

/**
 * Quick check for a single provider. Used by preflight.
 */
export async function isProviderConnected(input: {
  provider: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
}): Promise<boolean> {
  const all = await getUnifiedConnectors({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
  });

  const record = all.find((r) => r.provider === input.provider);
  if (!record) return false;

  return record.status === "connected" || (record.authConnected && record.status !== "coming_soon");
}
