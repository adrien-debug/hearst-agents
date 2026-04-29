/**
 * POST /api/settings/alerting/test — envoie un signal de test sur le canal choisi.
 *
 * Body :
 *   { channel: "webhook" | "slack" | "email", targetIndex?: number }
 *
 * - webhook : POST vers prefs.webhooks[targetIndex] (défaut 0)
 * - slack   : POST vers prefs.slack.webhookUrl
 * - email   : stub — log uniquement (pas de vrai provider)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { loadAlertingPreferences } from "@/lib/notifications/alert-dispatcher";
import {
  dispatchWebhook,
  dispatchSlack,
  dispatchEmail,
} from "@/lib/notifications/channels";
import type { AlertContext } from "@/lib/notifications/channels";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const testBodySchema = z.object({
  channel: z.enum(["webhook", "slack", "email"]),
  /** Index du webhook dans prefs.webhooks[] (défaut 0). */
  targetIndex: z.number().int().min(0).optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "settings/alerting/test POST" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const parsed = testBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres invalides", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { channel, targetIndex = 0 } = parsed.data;

  const db = requireServerSupabase();
  const prefs = await loadAlertingPreferences(db, scope.tenantId);

  /** Contexte factice pour le test. */
  const ctx: AlertContext = {
    tenantId: scope.tenantId,
    signal: {
      type: "mrr_drop",
      severity: "critical",
      message: "Signal de test Hearst OS — alerting configuré correctement.",
    },
    report: {
      id: "test-report",
      title: "Test Alerting",
    },
    emittedAt: Date.now(),
  };

  switch (channel) {
    case "webhook": {
      const hook = prefs.webhooks[targetIndex];
      if (!hook) {
        return NextResponse.json(
          { error: `Webhook index ${targetIndex} introuvable` },
          { status: 404 },
        );
      }
      // On force signalTypes à ["*"] pour que le test passe sans filtre
      const result = await dispatchWebhook(
        { ...hook, signalTypes: ["*"] },
        ctx,
      );
      return NextResponse.json({ ok: result?.ok ?? false, result });
    }

    case "slack": {
      if (!prefs.slack) {
        return NextResponse.json(
          { error: "Aucune config Slack configurée" },
          { status: 404 },
        );
      }
      const result = await dispatchSlack(
        { ...prefs.slack, signalTypes: ["*"] },
        ctx,
      );
      return NextResponse.json({ ok: result?.ok ?? false, result });
    }

    case "email": {
      if (!prefs.email) {
        return NextResponse.json(
          { error: "Aucune config email configurée" },
          { status: 404 },
        );
      }
      const result = await dispatchEmail(
        { ...prefs.email, signalTypes: ["*"] },
        ctx,
      );
      return NextResponse.json({ ok: result?.ok ?? false, result });
    }
  }
}
