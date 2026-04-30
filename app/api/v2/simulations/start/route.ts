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
import { randomUUID } from "crypto";
import { requireScope } from "@/lib/platform/auth/scope";
import { deepseekChat } from "@/lib/capabilities/providers/deepseek";
import { storeAsset } from "@/lib/assets/types";

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

  const prompt = `Réponds STRICTEMENT en français pour TOUS les champs (name, narrative, metrics keys, risks). Aucun mot anglais. Si le scénario contient des termes anglais, traduis-les.

Analyse ce scénario business et génère 3-5 scénarios futurs chiffrés.

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

    // Persist asset markdown — sans ça, fermer la stage perdait tout.
    // Pattern repris de generate_image (lib/tools/native/hearst-actions.ts).
    const assetId = randomUUID();
    const markdown = formatScenariosToMarkdown(
      scenario,
      variables,
      parsed.scenarios,
      result.reasoningContent ?? null,
    );
    await storeAsset({
      id: assetId,
      threadId: scope.workspaceId,
      kind: "report",
      title: scenario.slice(0, 80),
      summary: parsed.scenarios[0]?.narrative?.slice(0, 200) ?? scenario.slice(0, 200),
      contentRef: markdown,
      createdAt: Date.now(),
      provenance: {
        providerId: "system",
        userId: scope.userId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      },
    });

    return NextResponse.json({
      scenarios: parsed.scenarios,
      reasoning: result.reasoningContent ?? null,
      assetId,
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

/**
 * Sérialise les scénarios en markdown pour le `contentRef` de l'asset.
 * Format proche de ce que rend `ScenarioCard` côté UI : titre, variables,
 * scénarios (narrative + metrics + risques), puis raisonnement DeepSeek.
 */
function formatScenariosToMarkdown(
  scenario: string,
  variables: SimulationVariable[],
  scenarios: SimulationScenario[],
  reasoning: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# ${scenario}`);
  lines.push("");

  if (variables.length > 0) {
    lines.push("## Variables");
    lines.push("");
    for (const v of variables) {
      lines.push(`- **${v.key}** : ${v.value}`);
    }
    lines.push("");
  }

  lines.push("## Scénarios");
  lines.push("");
  for (const s of scenarios) {
    const probPct = Math.max(0, Math.min(100, Math.round((s.probability ?? 0) * 100)));
    lines.push(`### ${s.name} — ${probPct}%`);
    lines.push("");
    if (s.narrative) {
      lines.push(s.narrative);
      lines.push("");
    }
    const metricsEntries = Object.entries(s.metrics ?? {});
    if (metricsEntries.length > 0) {
      lines.push("**Metrics**");
      lines.push("");
      for (const [key, value] of metricsEntries) {
        lines.push(`- ${key.replace(/_/g, " ")} : ${value}`);
      }
      lines.push("");
    }
    const risks = Array.isArray(s.risks) ? s.risks : [];
    if (risks.length > 0) {
      lines.push("**Risques**");
      lines.push("");
      for (const r of risks) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
  }

  if (reasoning) {
    lines.push("## Raisonnement");
    lines.push("");
    lines.push(reasoning);
    lines.push("");
  }

  return lines.join("\n");
}
