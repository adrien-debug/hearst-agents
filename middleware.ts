/**
 * Next.js middleware — sécurité edge.
 * Arcjet (rate limit + bot detection + shield) appliqué uniquement aux
 * routes API publiques sensibles. Si ARCJET_KEY absent → no-op.
 */

import { NextRequest, NextResponse } from "next/server";
import { aj, isArcjetEnabled } from "@/lib/security/arcjet";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (!isArcjetEnabled() || !aj) return NextResponse.next();

  const decision = await aj.protect(req, { requested: 1 });

  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    if (decision.reason.isBot()) {
      return NextResponse.json({ error: "bot_detected" }, { status: 403 });
    }
    if (decision.reason.isShield()) {
      return NextResponse.json({ error: "request_blocked" }, { status: 403 });
    }
    return NextResponse.json({ error: "denied" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/orchestrate",
    "/api/v2/jobs/:path*",
    "/api/v2/missions/:path*/run",
    "/api/auth/:path*",
  ],
};
