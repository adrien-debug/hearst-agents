/**
 * Nango OAuth Callback — Not typically used
 *
 * Nango handles OAuth callbacks internally and redirects to the configured
 * success/callback URL. This route is for custom handling if needed.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const connectionId = searchParams.get("connectionId");
  const provider = searchParams.get("provider");
  const error = searchParams.get("error");

  if (error) {
    console.error("[NangoCallback] OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/admin/integrations?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!connectionId || !provider) {
    return NextResponse.redirect(
      new URL("/admin/integrations?error=missing_params", req.url)
    );
  }

  // Redirect to admin with success
  return NextResponse.redirect(
    new URL(`/admin/integrations?connected=${provider}`, req.url)
  );
}
