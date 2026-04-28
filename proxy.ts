/**
 * Next.js Proxy — Global Auth Guard
 *
 * Canonical request guard for Next.js 16 / Turbopack.
 * It runs before route handlers and enforces:
 * 1. Authentication (session or API key)
 * 2. Public path exemptions
 * 3. Explicit dev bypass only
 *
 * Environment validation is triggered by importing lib/env.server.ts
 */

import "@/lib/env.server";
import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(req: NextRequest): NextResponse {
  const path = req.nextUrl.pathname;

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
