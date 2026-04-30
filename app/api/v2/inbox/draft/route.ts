/**
 * POST /api/v2/inbox/draft
 *
 * Génère un brouillon de réponse via Claude Haiku pour un email Gmail.
 * Body : { messageId: string, sender?: string, subject?: string, instruction?: string }
 *
 * Pas d'envoi automatique — retourne le draft pour review côté UI. Le user
 * peut ensuite copier/envoyer manuellement, ou trigger un GMAIL_SEND_EMAIL.
 *
 * Return : { ok, draft: { subject, body }, source }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const bodySchema = z.object({
  messageId: z.string().min(1),
  sender: z.string().optional(),
  subject: z.string().optional(),
  instruction: z.string().optional(),
  /** Contexte extrait de l'item inbox (summary). */
  context: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "POST /api/v2/inbox/draft" });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "anthropic_unavailable", message: "ANTHROPIC_API_KEY non configuré." },
      { status: 503 },
    );
  }

  const { sender, subject, instruction, context } = parsed.data;

  const anthropic = new Anthropic({ apiKey });
  try {
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content:
            `Rédige un brouillon de réponse en français pour ce mail.\n\n` +
            `De: ${sender ?? "(inconnu)"}\n` +
            `Sujet: ${subject ?? "(sans sujet)"}\n` +
            `Contexte/extrait: ${context ?? "(non disponible)"}\n\n` +
            `Instruction du founder : ${instruction ?? "Réponse standard, ton direct, pro mais cordial."}\n\n` +
            `Réponds UNIQUEMENT avec un JSON :\n` +
            `{ "subject": "Re: ...", "body": "..." }`,
        },
      ],
    });

    const block = res.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { ok: false, error: "no_draft", raw: text.slice(0, 200) },
        { status: 500 },
      );
    }
    const draft = JSON.parse(match[0]) as { subject?: string; body?: string };
    return NextResponse.json({
      ok: true,
      draft: {
        subject: draft.subject ?? `Re: ${subject ?? ""}`,
        body: draft.body ?? "",
      },
      source: "haiku",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/v2/inbox/draft] failed:", message);
    return NextResponse.json({ ok: false, error: "haiku_failed", message }, { status: 500 });
  }
}
