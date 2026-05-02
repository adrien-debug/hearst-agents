/**
 * GET /api/workflows/templates?vertical=hospitality
 *
 * Retourne les templates workflow (code-as-data) pour un vertical donné.
 * Pour vertical=hospitality, retourne les 2 templates définis dans
 * lib/workflows/templates/hospitality/* :
 *  - guest-arrival-prep
 *  - service-request-dispatch
 *
 * Sans param vertical, retourne []. Code-as-data : pas de stockage DB,
 * pas de mutation possible (pour partage public, voir marketplace).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { guestArrivalPrepTemplate } from "@/lib/workflows/templates/hospitality/guest-arrival-prep";
import { serviceRequestDispatchTemplate } from "@/lib/workflows/templates/hospitality/service-request-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WorkflowTemplate {
  id: string;
  vertical: string;
  name: string;
  description: string;
  graph: ReturnType<typeof guestArrivalPrepTemplate>;
}

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/workflows/templates",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const vertical = searchParams.get("vertical");

  if (vertical !== "hospitality") {
    return NextResponse.json({ templates: [] });
  }

  const templates: WorkflowTemplate[] = [
    {
      id: "hospitality-guest-arrival-prep",
      vertical: "hospitality",
      name: "Préparation arrivées guests",
      description:
        "Cron 10h → fetch arrivées PMS → filtre VIP → welcome notes Claude → approval → Slack frontdesk",
      graph: guestArrivalPrepTemplate(),
    },
    {
      id: "hospitality-service-request-dispatch",
      vertical: "hospitality",
      name: "Dispatch service requests",
      description:
        "Webhook service request → classify priority Haiku → branche urgent/normal → Slack alert + PMS update",
      graph: serviceRequestDispatchTemplate(),
    },
  ];

  return NextResponse.json({ templates });
}
