/**
 * GET  /api/admin/connectors — list connectors/instances (RBAC: read connectors)
 * POST /api/admin/connectors — create instance (RBAC: create connectors)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import {
  listConnectors,
  listConnectorInstances,
  createConnectorInstance,
  updateConnectorStatus,
  deleteConnectorInstance,
} from "@/lib/admin/connectors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("GET /api/admin/connectors", { resource: "connectors", action: "read" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;
  const url = new URL(req.url);
  const view = url.searchParams.get("view"); // "registry" or "instances"

  try {
    if (view === "registry") {
      const enabled = url.searchParams.get("enabled");
      const connectors = await listConnectors(db, {
        enabled: enabled !== null ? enabled === "true" : undefined,
      });
      return NextResponse.json({ connectors });
    }

    const instances = await listConnectorInstances(db, scope.tenantId);
    return NextResponse.json({ instances });
  } catch (e) {
    console.error("[Admin API] GET /connectors error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("POST /api/admin/connectors", { resource: "connectors", action: "create" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;

  try {
    const body = await req.json();
    const { provider, name } = body;

    if (!provider || !name) {
      return NextResponse.json({ error: "provider and name are required" }, { status: 400 });
    }

    const instance = await createConnectorInstance(db, {
      provider,
      name,
      tenantId: scope.tenantId,
      userId: scope.userId,
      config: body.config,
    });

    return NextResponse.json({ instance }, { status: 201 });
  } catch (e) {
    console.error("[Admin API] POST /connectors error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdmin("PATCH /api/admin/connectors", { resource: "connectors", action: "update" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;

  try {
    const { connectorId, enabled } = await req.json();

    if (!connectorId || enabled === undefined) {
      return NextResponse.json({ error: "connectorId and enabled are required" }, { status: 400 });
    }

    await updateConnectorStatus(db, connectorId, enabled, scope.userId);
    return NextResponse.json({ success: true, connectorId, enabled });
  } catch (e) {
    console.error("[Admin API] PATCH /connectors error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin("DELETE /api/admin/connectors", { resource: "connectors", action: "delete" });
  if (isError(guard)) return guard;

  const { db } = guard;

  try {
    const { instanceId } = await req.json();

    if (!instanceId) {
      return NextResponse.json({ error: "instanceId is required" }, { status: 400 });
    }

    await deleteConnectorInstance(db, instanceId);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[Admin API] DELETE /connectors error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
