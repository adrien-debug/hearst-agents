/**
 * POST /api/v2/personas/ab-test
 *
 * Body : { message: string, personaIdA: string, personaIdB: string }
 * Lance 2 appels LLM en parallèle avec deux personas différentes pour
 * comparer la voix produite. Pas d'historique, pas d'outils — la valeur
 * comparée est la voix sur un message simple.
 *
 * Fail-soft : si Anthropic n'est pas configuré, on renvoie 503.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getPersonaById } from "@/lib/personas/store";
import { buildPersonaAddonOrNull } from "@/lib/personas/system-prompt-addon";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;

interface Payload {
  message?: unknown;
  personaIdA?: unknown;
  personaIdB?: unknown;
}

async function runOne(opts: {
  client: Anthropic;
  systemPrompt: string;
  message: string;
}): Promise<{ text: string; latencyMs: number }> {
  const t0 = Date.now();
  const res = await opts.client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: opts.systemPrompt,
    messages: [{ role: "user", content: opts.message }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return { text, latencyMs: Date.now() - t0 };
}

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/personas/ab-test",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message =
    typeof payload.message === "string" && payload.message.trim().length > 0
      ? payload.message.trim()
      : null;
  const personaIdA =
    typeof payload.personaIdA === "string" ? payload.personaIdA : null;
  const personaIdB =
    typeof payload.personaIdB === "string" ? payload.personaIdB : null;

  if (!message || !personaIdA || !personaIdB) {
    return NextResponse.json(
      { error: "missing_fields", required: ["message", "personaIdA", "personaIdB"] },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "llm_unavailable", message: "ANTHROPIC_API_KEY non configuré." },
      { status: 503 },
    );
  }

  const [pA, pB] = await Promise.all([
    getPersonaById(personaIdA, {
      userId: scope.userId,
      tenantId: scope.tenantId,
    }),
    getPersonaById(personaIdB, {
      userId: scope.userId,
      tenantId: scope.tenantId,
    }),
  ]);

  if (!pA) {
    return NextResponse.json(
      { error: "persona_not_found", which: "A", id: personaIdA },
      { status: 404 },
    );
  }
  if (!pB) {
    return NextResponse.json(
      { error: "persona_not_found", which: "B", id: personaIdB },
      { status: 404 },
    );
  }

  const baseSystem =
    "Tu es Hearst, assistant exécutif. Réponds en français, format scannable. " +
    "Pas d'emoji.";
  const addonA = buildPersonaAddonOrNull(pA);
  const addonB = buildPersonaAddonOrNull(pB);
  const sysA = addonA ? `${baseSystem}\n\n${addonA}` : baseSystem;
  const sysB = addonB ? `${baseSystem}\n\n${addonB}` : baseSystem;

  const client = new Anthropic({ apiKey });
  try {
    const [resA, resB] = await Promise.all([
      runOne({ client, systemPrompt: sysA, message }),
      runOne({ client, systemPrompt: sysB, message }),
    ]);

    return NextResponse.json({
      message,
      a: { persona: pA, response: resA.text, latencyMs: resA.latencyMs },
      b: { persona: pB, response: resB.text, latencyMs: resB.latencyMs },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ab_test_failed";
    console.warn("[ab-test] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
