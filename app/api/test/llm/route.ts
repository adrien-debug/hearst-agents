import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const results: Record<string, { status: string; env?: string }> = {};
  const providers = ["openai", "anthropic", "gemini", "composer"];

  for (const name of providers) {
    let envKey = "NOT_SET";
    switch (name) {
      case "openai":
        envKey = process.env.OPENAI_API_KEY ? "SET" : "NOT_SET";
        break;
      case "anthropic":
        envKey = process.env.ANTHROPIC_API_KEY ? "SET" : "NOT_SET";
        break;
      case "gemini":
        envKey = process.env.GEMINI_API_KEY ? "SET" : "NOT_SET";
        break;
      case "composer":
        envKey = process.env.COMPOSER_API_KEY ? "SET" : "NOT_SET";
        break;
    }
    results[name] = { status: envKey === "SET" ? "ready" : "missing_key", env: envKey };
  }

  return NextResponse.json({
    providers: results,
    available: Object.entries(results).filter(([_, v]) => v.status === "ready").map(([k]) => k),
    total: providers.length,
    ready: Object.values(results).filter(v => v.status === "ready").length,
  });
}
