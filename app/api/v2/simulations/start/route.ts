/**
 * POST /api/v2/simulations/start — Chambre de Simulation MVP.
 *
 * Signature 5 : DeepSeek R1 génère 3-5 scénarios chiffrés à partir d'un
 * scénario business + variables clés. Phase B suivante : E2B validera
 * les calculs, Exa enrichira les benchmarks, Letta gardera la cohérence.
 *
 * Le modèle DeepSeek-Reasoner peut prendre 30-50s pour son raisonnement,
 * d'où `maxDuration = 60` (cf. Vercel/Next.js timeout).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { deepseekChat } from "@/lib/capabilities/providers/deepseek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SimulationVariable {
  key: string;
  value: string;
}

interface SimulationScenario {
  name: string;
  narrative: string;
  metrics: Record<string, string>;
  risks: string[];
  probability: number;
}

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/simulations/start",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let body: { scenario?: string; variables?: SimulationVariable[] };
  try {
    body = (await req.json()) as { scenario?: string; variables?: SimulationVariable[] };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const scenario = body.scenario?.trim() ?? "";
  if (!scenario) {
    return NextResponse.json({ error: "scenario_required" }, { status: 400 });
  }

  const variables = Array.isArray(body.variables) ? body.variables : [];
  const variablesBlock = variables.length > 0
    ? variables.map((v) => `- ${v.key}: ${v.value}`).join("\n")
    : "(aucune variable spécifiée)";

  const prompt = `Analyse ce scénario business et génère 3-5 scénarios futurs chiffrés.

Scénario : ${scenario}

Variables clés :
${variablesBlock}

Retourne UNIQUEMENT un JSON valide, sans texte autour, au format :
{
  "scenarios": [
    {
      "name": "string court (3-5 mots)",
      "narrative": "explication 2-3 phrases",
      "metrics": { "metric_name": "valeur chiffrée" },
      "risks": ["risque 1", "risque 2"],
      "probability": 0.0-1.0
    }
  ]
}`;

  try {
    const result = await deepseekChat({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
    });

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    const rawJson = jsonMatch?.[0];
    if (!rawJson) {
      return NextResponse.json(
        { error: "invalid_simulation_output", raw: result.content },
        { status: 502 },
      );
    }

    let parsed: { scenarios?: SimulationScenario[] };
    try {
      parsed = JSON.parse(rawJson) as { scenarios?: SimulationScenario[] };
    } catch {
      return NextResponse.json(
        { error: "invalid_simulation_output", raw: result.content },
        { status: 502 },
      );
    }

    if (!Array.isArray(parsed.scenarios)) {
      return NextResponse.json(
        { error: "invalid_simulation_output", raw: result.content },
        { status: 502 },
      );
    }

    return NextResponse.json({
      scenarios: parsed.scenarios,
      reasoning: result.reasoningContent ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Simulations] DeepSeek call failed:", message);
    return NextResponse.json(
      { error: "simulation_failed", message },
      { status: 500 },
    );
  }
}
