/**
 * @deprecated Legacy connector status (OAuth tokens only).
 * Still used by use-connected-services.ts for lightweight service detection.
 * Canonical reconciled view: /api/v2/connectors/unified
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface ConnectorStatus {
  provider: string;
  connected: boolean;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("user_tokens")
      .select("provider, revoked_at, access_token_enc")
      .eq("user_id", userId);

    if (error) {
      console.error("[ConnectorStatus] DB error:", error.message);
      return NextResponse.json({ connectors: [] });
    }

    const connectors: ConnectorStatus[] = (data ?? []).map((row) => ({
      provider: row.provider as string,
      connected: !!row.access_token_enc && !row.revoked_at,
    }));

    return NextResponse.json({ connectors });
  } catch (err) {
    console.error("[ConnectorStatus] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ connectors: [] });
  }
}
