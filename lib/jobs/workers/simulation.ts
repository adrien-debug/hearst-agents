/**
 * Worker simulation — Sprint 2.2.
 *
 * Pipeline :
 *  1. UPDATE simulation_runs status='streaming'
 *  2. Call DeepSeek R1 (non-streamé pour MVP — streaming SSE peut être
 *     ajouté ultérieurement, le worker reste simple en MVP)
 *  3. Parse JSON, validate Zod (SimulationOutputSchema)
 *  4. Persist asset markdown (kind='report')
 *  5. UPDATE simulation_runs status='completed' avec scenarios+asset_id
 *
 * Sur erreur : status='failed' avec error_message + raw output dans
 * reasoning pour debug.
 */

import { randomUUID } from "node:crypto";
import { startWorker, type WorkerHandler } from "@/lib/jobs/worker-base";
import { storeAsset } from "@/lib/assets/types";
import { deepseekChat } from "@/lib/capabilities/providers/deepseek";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { simulationOutputSchema, type SimulationOutput } from "@/lib/simulations/schemas";
import type { JobResult, SimulationInput } from "@/lib/jobs/types";

const SIMULATION_PROMPT = [
  "Tu es un analyste business expert. L'utilisateur soumet un scénario, tu retournes 3 à 5 scénarios contrastés.",
  "",
  "FORMAT STRICT (JSON valide uniquement, pas de markdown fence) :",
  "{",
  '  "summary": "1-2 phrases — synthèse globale (optionnel)",',
  '  "scenarios": [',
  '    {',
  '      "name": "Nom court (max 80 chars)",',
  '      "narrative": "Description détaillée (3-6 phrases)",',
  '      "metrics": { "revenue": "$5M", "timeline": "12 months", ... },',
  '      "risks": ["risque 1", "risque 2"],',
  '      "probability": 0.35  // 0..1',
  "    }",
  "  ]",
  "}",
  "",
  "RÈGLES :",
  "- 3-5 scénarios MAX, contrastés (un base case + un upside + un downside au minimum).",
  "- probability strictement entre 0 et 1, sum DOIT s'approcher de 1.0 (à ±0.1).",
  "- metrics : 2-5 KPIs chiffrés par scénario (numbers ou strings courtes).",
  "- risks : 1-5 risques bullet points.",
  "- Pas de markdown dans les champs — texte brut uniquement.",
].join("\n");

async function processSimulation(payload: SimulationInput): Promise<JobResult> {
  const sb = requireServerSupabase();

  // 1. Mark streaming
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("simulation_runs" as any) as any)
    .update({ status: "streaming" })
    .eq("id", payload.simulationId);

  // 2. Build prompt
  const variablesText = (payload.variables ?? [])
    .map((v) => `${v.key}: ${v.value}`)
    .join("\n");
  const userMessage = [
    `Scénario : ${payload.scenario}`,
    "",
    variablesText ? `Variables :\n${variablesText}` : "Pas de variables fournies.",
    "",
    "Génère le JSON maintenant.",
  ].join("\n");

  let raw: { content: string; reasoningContent?: string };
  try {
    raw = await deepseekChat({
      messages: [
        { role: "system", content: SIMULATION_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.6,
      maxTokens: 8192,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("simulation_runs" as any) as any)
      .update({
        status: "failed",
        error_message: `DeepSeek error: ${message}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", payload.simulationId);
    throw err;
  }

  // 3. Parse JSON + validate Zod
  let parsed: SimulationOutput;
  try {
    const jsonMatch = raw.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in DeepSeek output");
    const candidate = JSON.parse(jsonMatch[0]);
    parsed = simulationOutputSchema.parse(candidate);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("simulation_runs" as any) as any)
      .update({
        status: "failed",
        reasoning: raw.reasoningContent ?? raw.content.slice(0, 5000),
        error_message: `Validation: ${message}. Raw output preserved in reasoning.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", payload.simulationId);
    throw err;
  }

  // 4. Persist asset markdown
  const assetId = randomUUID();
  const markdown = formatScenariosMarkdown(parsed, payload.scenario);
  await storeAsset({
    id: assetId,
    threadId: `simulation:${payload.userId}`,
    kind: "report",
    title: `Simulation : ${payload.scenario.slice(0, 80)}`,
    summary: `${parsed.scenarios.length} scénarios DeepSeek R1`,
    contentRef: JSON.stringify({ markdown, scenarios: parsed.scenarios, summary: parsed.summary }),
    createdAt: Date.now(),
    provenance: {
      providerId: "system",
      userId: payload.userId,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
    },
  });

  // 5. Mark completed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("simulation_runs" as any) as any)
    .update({
      status: "completed",
      reasoning: raw.reasoningContent ?? null,
      scenarios: parsed.scenarios,
      asset_id: assetId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", payload.simulationId);

  console.log(
    `[Simulation/Worker] user=${payload.userId.slice(0, 8)} sim=${payload.simulationId.slice(0, 8)} scenarios=${parsed.scenarios.length}`,
  );

  return {
    assetId,
    actualCostUsd: 0.05,
    providerUsed: "deepseek-reasoner",
    modelUsed: "deepseek-reasoner",
    metadata: {
      simulationId: payload.simulationId,
      scenarioCount: parsed.scenarios.length,
    },
  };
}

function formatScenariosMarkdown(output: SimulationOutput, scenarioInput: string): string {
  const lines: string[] = [
    `# Simulation : ${scenarioInput}`,
    "",
  ];
  if (output.summary) {
    lines.push(`> ${output.summary}`, "");
  }
  for (const [idx, sc] of output.scenarios.entries()) {
    lines.push(`## ${idx + 1}. ${sc.name} (${(sc.probability * 100).toFixed(0)}%)`);
    lines.push("");
    lines.push(sc.narrative);
    lines.push("");
    if (Object.keys(sc.metrics).length > 0) {
      lines.push("**Metrics**");
      for (const [k, v] of Object.entries(sc.metrics)) {
        lines.push(`- ${k} : ${v}`);
      }
      lines.push("");
    }
    if (sc.risks.length > 0) {
      lines.push("**Risques**");
      for (const r of sc.risks) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

const handler: WorkerHandler<SimulationInput> = {
  kind: "simulation",
  validateInput(payload) {
    if (!payload.scenario || !payload.simulationId) {
      throw new Error("simulation: scenario + simulationId requis");
    }
  },
  process: async (ctx) => processSimulation(ctx.payload),
};

export function startSimulationWorker() {
  console.log("[Simulation] worker started");
  return startWorker(handler);
}
