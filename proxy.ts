/**
 * Next.js Proxy — Global Auth Guard + Arcjet Edge Protection
 *
 * Canonical request guard for Next.js 16 / Turbopack.
 * It runs before route handlers and enforces:
 * 1. Arcjet protection (rate limit + bot detection + shield) sur routes critiques
 * 2. Authentication (session or API key)
 * 3. Public path exemptions
 * 4. Explicit dev bypass only
 *
 * Environment validation is triggered by importing lib/env.server.ts
 */

import "@/lib/env.server";
import { NextResponse, type NextRequest } from "next/server";
import { aj, isArcjetEnabled } from "@/lib/security/arcjet";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/webhooks",
  "/halo-test",
];

const STATIC_RE = /^\/(?:_next|favicon\.ico|.*\.(?:svg|png|jpg|ico|webp|woff2?|css|js))$/;

function isPublic(path: string): boolean {
  if (STATIC_RE.test(path)) return true;
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function hasSession(req: NextRequest): boolean {
  return (
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token")
  );
}

function hasValidApiKey(req: NextRequest): boolean {
  const apiKey = process.env.HEARST_API_KEY;
  if (!apiKey) return false;

  const token =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null;

  return token === apiKey;
}

function isDevBypass(): boolean {
  return process.env.HEARST_DEV_AUTH_BYPASS === "1";
}

const ARCJET_PROTECTED_PATHS = [
  "/api/orchestrate",
  "/api/v2/jobs",
  "/api/v2/missions",
  "/api/auth",
];

function isArcjetProtected(path: string): boolean {
  return ARCJET_PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

async function applyArcjet(req: NextRequest): Promise<NextResponse | null> {
  if (!isArcjetEnabled() || !aj) return null;
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
  return null;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  // 1. Arcjet check sur les routes sensibles (avant auth pour bloquer
  // les attaques sans consommer de ressources auth).
  if (isArcjetProtected(path)) {
    const denied = await applyArcjet(req);
    if (denied) return denied;
  }

  if (isPublic(path)) {
    return NextResponse.next();
  }

  if (path.startsWith("/api/")) {
    if (isDevBypass()) {
      console.log(`[Proxy] Dev bypass active — ${path}`);
      return NextResponse.next();
    }

    if (hasValidApiKey(req)) {
      return NextResponse.next();
    }

    if (hasSession(req)) {
      return NextResponse.next();
    }

    console.warn(`[Proxy] Unauthorized API access — ${path}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasSession(req)) {
    if (isDevBypass()) return NextResponse.next();
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    console.log(`[Proxy] Redirecting unauthenticated user to login — ${path}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
