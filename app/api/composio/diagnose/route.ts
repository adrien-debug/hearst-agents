/**
 * GET /api/composio/diagnose?app=slack
 *
 * Lightweight diagnostic helper: tells the user whether Composio knows
 * about the app, whether an integration is configured, and whether the
 * user already has a connection. Use this when "Connecter X" fails so
 * we can pinpoint the cause (no integration vs. wrong slug vs. already
 * connected vs. SDK error).
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import {
  getComposioToolset,
  isComposioConfigured,
  listConnections,
  listAvailableApps,
} from "@/lib/connectors/composio";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isComposioConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "COMPOSIO_API_KEY not set",
    });
  }

  const slug = (req.nextUrl.searchParams.get("app") ?? "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing app param" }, { status: 400 });
  }

  const toolset = await getComposioToolset();
  if (!toolset) {
    return NextResponse.json({ ok: false, error: "SDK not loaded" }, { status: 500 });
  }

  // 1. Is the app in Composio's public catalog?
  const apps = await listAvailableApps();
  const appInCatalog = apps.find((a) => a.key === slug);

  // 2. Has the dev/account configured an integration for it?
  let integrations: Array<{ id: string; name: string; appName: string }> = [];
  try {
    const raw = (await toolset.client.integrations.list({})) as {
      items?: Array<{ id?: string; name?: string; appName?: string }>;
    };
    const items = raw.items ?? [];
    integrations = items
      .filter((it) => (it.appName ?? "").toLowerCase() === slug)
      .map((it) => ({ id: it.id ?? "", name: it.name ?? "", appName: it.appName ?? "" }));
  } catch (err) {
    console.error("[Composio/Diagnose] integrations.list failed:", err);
  }

  // 3. Is the user already connected to this app?
  const userConnections = await listConnections(userId, { includeInactive: true });
  const userConnection = userConnections.find((c) => c.appName === slug);

  return NextResponse.json({
    ok: true,
    configured: true,
    app: slug,
    inCatalog: !!appInCatalog,
    catalogEntry: appInCatalog ?? null,
    integrationsConfigured: integrations.length,
    integrations,
    userConnected: !!userConnection,
    userConnection: userConnection ?? null,
    diagnosis: makeDiagnosis(!!appInCatalog, integrations.length, userConnection),
  });
}

function makeDiagnosis(
  inCatalog: boolean,
  integrationsCount: number,
  userConnection: { status: string } | undefined,
): string {
  if (!inCatalog) {
    return `App slug not found in Composio catalog. Try the search bar in /apps to find the correct slug.`;
  }
  if (userConnection && userConnection.status === "ACTIVE") {
    return `App is already connected and active. No further action needed.`;
  }
  if (userConnection && userConnection.status === "INITIATED") {
    return `Connection started but not finished. Open the OAuth URL again or run /apps and click Reconnect.`;
  }
  if (integrationsCount === 0) {
    return `No integration configured at the Composio account level. Visit https://app.composio.dev → Apps → enable this app → Setup → "Use Composio Managed Auth", then retry.`;
  }
  return `Integration configured (${integrationsCount}). The connect call should now succeed — retry from /apps.`;
}
