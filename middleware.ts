import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/api/health", "/api/auth"]);

function isPublic(path: string): boolean {
  for (const p of PUBLIC_PATHS) {
    if (path === p || path.startsWith(p + "/")) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (!path.startsWith("/api/")) return NextResponse.next();
  if (isPublic(path)) return NextResponse.next();

  const apiKey = process.env.HEARST_API_KEY;
  if (!apiKey) return NextResponse.next();

  const token =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.cookies.get("next-auth.session-token")?.value ??
    req.cookies.get("__Secure-next-auth.session-token")?.value ??
    null;

  if (token === apiKey) return NextResponse.next();

  // If user has a NextAuth session cookie, let the route handler do auth
  if (
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token")
  ) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
