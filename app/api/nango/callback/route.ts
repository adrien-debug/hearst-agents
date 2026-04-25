/**
 * Nango OAuth Callback — User-facing redirect handler
 *
 * Nango handles OAuth callbacks internally and redirects to this route.
 * We redirect to /apps (user App Hub) with appropriate status messages.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncNangoConnection, parseConnectionId } from "@/lib/connectors/nango";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const connectionId = searchParams.get("connectionId");
  const provider = searchParams.get("provider");
  const error = searchParams.get("error");

  if (error) {
    console.error("[NangoCallback] OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/apps?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!connectionId || !provider) {
    console.error("[NangoCallback] Missing params:", { connectionId, provider });
    return NextResponse.redirect(
      new URL("/apps?error=missing_params", req.url)
    );
  }

  // Extract userId from connectionId (canonical: hearstx-{hex(userId)}-{provider},
  // legacy fallback: hearst-{normalizedUserId}-{provider}).
  // The canonical format preserves the full email lossless so the connection is
  // persisted under the correct user_id in integration_connections.
  const parsed = parseConnectionId(connectionId);
  if (!parsed) {
    console.error("[NangoCallback] Invalid connectionId format:", connectionId.slice(0, 20));
    return NextResponse.redirect(
      new URL("/apps?error=invalid_connection", req.url)
    );
  }
  const userId = parsed.userId;

  // Log the callback for debugging (after userId extraction)
  console.log(`[NangoCallback] Callback received:`, {
    provider,
    connectionId: connectionId?.slice(0, 20) + "...",
    userId: userId.slice(0, 8),
  });

  // Resolve scope from env (consistent with lib/scope.ts)
  const tenantId = process.env.HEARST_TENANT_ID ?? "dev-tenant";
  const workspaceId = process.env.HEARST_WORKSPACE_ID ?? "dev-workspace";

  // Sync the connection to control-plane with canonical scope
  try {
    await syncNangoConnection({
      provider,
      nangoConnectionId: connectionId,
      userId,
      tenantId,
      status: "active",
      metadata: { workspaceId },
    });
    console.log(`[NangoCallback] Connection synced: ${provider} for tenant=${tenantId}, user=${userId.slice(0, 8)}`);
  } catch (err) {
    console.warn(`[NangoCallback] Failed to sync connection:`, err);
    // Non-blocking: continue to redirect even if sync fails
  }

  // Redirect to App Hub with success message
  return NextResponse.redirect(
    new URL(`/apps?connected=${encodeURIComponent(provider)}`, req.url)
  );
}
