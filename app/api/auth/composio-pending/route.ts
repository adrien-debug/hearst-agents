import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  getPendingBootstraps,
  consumeBootstrap,
} from "@/lib/platform/auth/composio-bootstrap";

export const dynamic = "force-dynamic";

/**
 * Returns the list of Composio toolkits we kicked OAuth flows for at sign-in
 * but the user hasn't completed yet. Frontend walks them one by one
 * (window.location = redirectUrl) to land on Hearst with email + calendar
 * already connected.
 */
export async function GET() {
  const { scope, error } = await requireScope({
    context: "GET /api/auth/composio-pending",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  const pending = getPendingBootstraps(scope.userId);
  return NextResponse.json({ pending });
}

/**
 * Marks a single bootstrap as completed. Called by the frontend after the
 * user returns from a successful Composio OAuth flow (e.g. when the
 * bootstrap UI sees the toolkit move to ACTIVE).
 *
 * Body: { app: "gmail" | "googlecalendar" | "outlook" | "office365" }
 */
export async function POST(req: Request) {
  const { scope, error } = await requireScope({
    context: "POST /api/auth/composio-pending",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let body: { app?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.app !== "string" || !body.app) {
    return NextResponse.json({ error: "app_required" }, { status: 400 });
  }

  consumeBootstrap(scope.userId, body.app);
  return NextResponse.json({ ok: true });
}
