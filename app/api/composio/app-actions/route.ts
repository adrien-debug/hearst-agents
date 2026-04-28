/**
 * GET /api/composio/app-actions?app=stripe
 *
 * Liste les actions LLM-callable d'UN toolkit Composio, indépendamment
 * de l'état de connexion de l'utilisateur. Utilisé par le drawer /apps
 * pour décrire "ce que ton agent pourra faire" AVANT la connexion.
 *
 * Différence avec /api/composio/tools : ce dernier ne renvoie que les
 * tools des toolkits ACTIVE (filtrage runtime). Ici on veut le catalogue
 * complet, prêt à montrer à l'utilisateur en mode discovery.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/platform/auth/get-user-id";
import {
  getToolsForApp,
  isComposioConfigured,
  getComposio,
  getComposioInitError,
} from "@/lib/connectors/composio";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!isComposioConfigured()) {
    return NextResponse.json(
      { ok: false, error: "composio_not_configured", message: "COMPOSIO_API_KEY not set" },
      { status: 503 },
    );
  }
  const client = await getComposio();
  if (!client) {
    const err = getComposioInitError();
    return NextResponse.json(
      {
        ok: false,
        error: err?.code ?? "composio_unavailable",
        message: err?.message ?? "Composio SDK could not be loaded",
      },
      { status: 503 },
    );
  }

  const app = req.nextUrl.searchParams.get("app");
  if (!app) {
    return NextResponse.json(
      { ok: false, error: "missing_app", message: "Query param `app` is required" },
      { status: 400 },
    );
  }

  const tools = await getToolsForApp(userId, app);
  return NextResponse.json({ ok: true, tools });
}
