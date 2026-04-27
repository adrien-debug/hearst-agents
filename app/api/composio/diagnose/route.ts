/**
 * GET /api/composio/diagnose?app=slack
 *
 * Lightweight diagnostic helper: tells the user whether Composio knows
 * about the toolkit, whether an auth config exists for it, and whether
 * the user already has an active connection. Use when "Connecter X" fails
 * — the response pinpoints the cause.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import {
  getComposio,
  isComposioConfigured,
  listConnections,
  listAvailableApps,
} from "@/lib/connectors/composio";

interface RawAuthConfig {
  id?: string;
  nanoid?: string;
  toolkit?: { slug?: string } | string;
  name?: string;
}

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

  const composio = await getComposio();
  if (!composio) {
    return NextResponse.json({ ok: false, error: "SDK not loaded" }, { status: 500 });
  }

  // 1. Toolkit catalog match.
  const apps = await listAvailableApps();
  const appInCatalog = apps.find((a) => a.key === slug);

  // 2. Has an auth config been created for this toolkit on the account?
  let authConfigs: Array<{ id: string; toolkit: string }> = [];
  try {
    const c = composio as unknown as {
      authConfigs?: { list(query?: Record<string, unknown>): Promise<{ items?: RawAuthConfig[] }> };
    };
    if (c.authConfigs?.list) {
      const raw = await c.authConfigs.list({ toolkitSlugs: [slug] });
      const items = raw.items ?? [];
      authConfigs = items
        .map((it): { id: string; toolkit: string } => {
          const toolkit =
            typeof it.toolkit === "object" && it.toolkit
              ? (it.toolkit.slug ?? "")
              : (typeof it.toolkit === "string" ? it.toolkit : "");
          return { id: it.id ?? it.nanoid ?? "", toolkit: toolkit.toLowerCase() };
        })
        .filter((it) => it.id && it.toolkit === slug);
    }
  } catch (err) {
    console.error("[Composio/Diagnose] authConfigs.list failed:", err);
  }

  // 3. Is the user already connected?
  const userConnections = await listConnections(userId, { includeInactive: true });
  const userConnection = userConnections.find((c) => c.appName === slug);

  return NextResponse.json({
    ok: true,
    configured: true,
    app: slug,
    inCatalog: !!appInCatalog,
    catalogEntry: appInCatalog ?? null,
    authConfigsConfigured: authConfigs.length,
    authConfigs,
    userConnected: !!userConnection,
    userConnection: userConnection ?? null,
    diagnosis: makeDiagnosis(!!appInCatalog, authConfigs.length, userConnection),
  });
}

function makeDiagnosis(
  inCatalog: boolean,
  authConfigsCount: number,
  userConnection: { status: string } | undefined,
): string {
  if (!inCatalog) {
    return `Toolkit slug not found in Composio catalog. Try the search bar in /apps to find the correct slug.`;
  }
  if (userConnection && userConnection.status === "ACTIVE") {
    return `Toolkit is already connected and active. No further action needed.`;
  }
  if (userConnection && userConnection.status === "INITIATED") {
    return `Connection started but not finished. Reopen the Composio Connect URL or run /apps and click Connect again.`;
  }
  if (authConfigsCount === 0) {
    return `No auth config for this toolkit on the account. Visit https://app.composio.dev → Toolkits → enable this toolkit → "Setup" → "Use Composio Managed Auth", then retry.`;
  }
  return `Auth config(s) found (${authConfigsCount}). The connect call should now succeed — retry from /apps.`;
}
