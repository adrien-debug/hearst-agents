import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain/api-helpers";
import { checkConnectionHealth } from "@/lib/integrations";
import { RuntimeError } from "@/lib/runtime/lifecycle";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = requireServerSupabase();

  try {
    const result = await checkConnectionHealth(sb, id);
    return ok({ data: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof RuntimeError) {
      return err(msg, 400);
    }
    console.error(`health check error connection=${id}:`, msg);
    return err(msg, 500);
  }
}
