/**
 * Nango Connections — List and manage user connections
 */

import { NextResponse } from "next/server";
import { listActiveConnections, removeConnection } from "@/lib/connectors/nango";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const connections = await listActiveConnections(userId);
    return NextResponse.json({ connections });
  } catch (error) {
    console.error("[NangoConnections] Failed to list:", error);
    return NextResponse.json(
      { error: "database_error", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
