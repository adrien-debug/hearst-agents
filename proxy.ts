import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health"];
const STATIC_RE = /^\/(_next|favicon\.ico|.*\.(?:svg|png|jpg|ico|webp|woff2?|css|js))/;

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function hasSession(req: NextRequest): boolean {
  return (
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token")
  );
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (isPublic(path) || STATIC_RE.test(path)) {
    return NextResponse.next();
  }

  // API routes: check API key OR session cookie
  if (path.startsWith("/api/")) {
    const apiKey = process.env.HEARST_API_KEY;
    const token =
      req.headers.get("x-api-key") ??
      req.headers.get("authorization")?.replace("Bearer ", "") ??
      null;

    if (apiKey && token === apiKey) return NextResponse.next();
    if (hasSession(req)) return NextResponse.next();

    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Page routes: redirect to /login if no session
  if (!hasSession(req)) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
