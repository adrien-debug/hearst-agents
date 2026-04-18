import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/api/health"];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (!path.startsWith("/api/")) return NextResponse.next();
  if (PUBLIC_PATHS.includes(path)) return NextResponse.next();

  const expected = process.env.HEARST_API_KEY;
  if (!expected) return NextResponse.next();

  const token =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    null;

  if (!token || token !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
