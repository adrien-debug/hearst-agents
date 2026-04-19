import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/api/health", "/api/auth"];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (!path.startsWith("/api/")) return NextResponse.next();
  if (isPublic(path)) return NextResponse.next();

  const apiKey = process.env.HEARST_API_KEY;
  if (!apiKey) return NextResponse.next();

  const token =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null;

  if (token === apiKey) return NextResponse.next();

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
