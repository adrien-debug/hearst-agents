import { NextRequest, NextResponse } from "next/server";

const HEADER = "x-api-key";
const BEARER_PREFIX = "Bearer ";

function getApiKey(): string | null {
  return process.env.HEARST_API_KEY ?? null;
}

function extractToken(req: NextRequest): string | null {
  const header = req.headers.get(HEADER);
  if (header) return header;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith(BEARER_PREFIX)) return auth.slice(BEARER_PREFIX.length);

  return null;
}

export function requireAuth(req: NextRequest): NextResponse | null {
  const expected = getApiKey();

  // Auth disabled if no key configured (dev mode)
  if (!expected) return null;

  const token = extractToken(req);
  if (!token || token !== expected) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  return null;
}
