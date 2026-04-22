/**
 * Nango Proxy API — Make authenticated API calls through Nango
 *
 * Generic proxy for calling any connected provider's API.
 */

import { NextRequest, NextResponse } from "next/server";
import { nangoProxy } from "@/lib/connectors/nango";
import { getUserId } from "@/lib/get-user-id";
import { z } from "zod";

const requestSchema = z.object({
  provider: z.string(),
  endpoint: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  data: z.any().optional(),
  params: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error }, { status: 400 });
  }

  const { provider, endpoint, method, data, params } = parsed.data;

  try {
    const tenantId = "default"; // Extract from session/context

    const response = await nangoProxy(
      {
        provider,
        endpoint,
        method,
        data,
        params,
      },
      { userId, tenantId }
    );

    return NextResponse.json({
      success: true,
      data: response.data,
      status: response.status,
    });
  } catch (error) {
    console.error("[NangoProxy] Request failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Proxy failed",
      },
      { status: 502 }
    );
  }
}
