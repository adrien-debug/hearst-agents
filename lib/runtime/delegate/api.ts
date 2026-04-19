/**
 * delegate() — Dispatches work to Capability Agents via real LLM calls.
 *
 * Phase 1: everything runs synchronously inline.
 * Phase 2 will introduce per-agent specialised loops and async queue.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RunEngine } from "../engine";
import type { DelegateInput, DelegateResult } from "./types";
import type { StepActor } from "../engine/types";

export async function delegate(
  engine: RunEngine,
  input: DelegateInput,
): Promise<DelegateResult> {
  const step = await engine.steps.create({
    run_id: engine.id,
    parent_step_id: input.parent_step_id ?? null,
    type: "delegate",
    actor: input.agent as StepActor,
    title: input.task.slice(0, 120),
    input: {
      task: input.task,
      context: input.context,
      expected_output: input.expected_output,
      retrieval_mode: input.retrieval_mode,
      artifacts_in: input.artifacts_in,
    },
  });

  await engine.steps.transition(step.id, "running");
  engine.events.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: step.id,
    agent: input.agent as StepActor,
    title: input.task.slice(0, 120),
  });

  try {
    const result = await executeAgentSync(engine, step.id, input);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Agent execution failed";
    await engine.steps.fail(step.id, {
      code: "AGENT_FAILED",
      message: msg,
      retryable: false,
    });
    engine.events.emit({
      type: "step_failed",
      run_id: engine.id,
      step_id: step.id,
      error: msg,
    });
    return {
      status: "error",
      step_id: step.id,
      error: { code: "AGENT_FAILED", message: msg, retryable: false },
    };
  }
}

const AGENTS_WITH_WEB_SEARCH = new Set(["KnowledgeRetriever", "Analyst", "DocBuilder"]);

async function executeAgentSync(
  engine: RunEngine,
  stepId: string,
  input: DelegateInput,
): Promise<DelegateResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const systemPrompt = buildAgentPrompt(input.agent, input.expected_output);

  const contextSummary = Object.entries(input.context)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("\n");

  const userContent = contextSummary
    ? `${input.task}\n\n--- Context ---\n${contextSummary}`
    : input.task;

  const useWebSearch = AGENTS_WITH_WEB_SEARCH.has(input.agent);
  console.log(`[Delegate] agent=${input.agent} web_search=${useWebSearch}`);

  let text: string;
  let usageTokens = { input_tokens: 0, output_tokens: 0 };

  if (useWebSearch) {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    });

    text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.Beta.BetaTextBlock).text)
      .join("\n");

    usageTokens = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  } else {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    usageTokens = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
  }

  await engine.cost.track({
    input_tokens: usageTokens.input_tokens,
    output_tokens: usageTokens.output_tokens,
    tool_calls: 0,
    latency_ms: 0,
  });

  await engine.steps.complete(stepId, { output: { content: text } });

  engine.events.emit({
    type: "text_delta",
    run_id: engine.id,
    delta: text,
  });
  engine.events.emit({
    type: "step_completed",
    run_id: engine.id,
    step_id: stepId,
    agent: input.agent as StepActor,
  });

  return {
    status: "success",
    step_id: stepId,
    data: { content: text, agent: input.agent },
    usage: usageTokens,
  };
}

function buildAgentPrompt(agent: string, expectedOutput: string): string {
  const base: Record<string, string> = {
    KnowledgeRetriever:
      "Tu es un agent de recherche d'information. Analyse la demande et fournis une réponse synthétique, factuelle et structurée. Cite les sources si possible.",
    Analyst:
      "Tu es un analyste. Structure les données, identifie les patterns, produis des insights clairs et actionnables.",
    DocBuilder:
      "Tu es un rédacteur de documents. Produis un contenu complet, structuré avec des titres et sections, prêt à être exploité.",
    Communicator:
      "Tu es un rédacteur de communications. Rédige un message clair, professionnel et adapté au contexte.",
    Operator:
      "Tu es un exécuteur d'actions. Décris précisément les actions à réaliser et leurs résultats attendus.",
    Planner:
      "Tu es un planificateur. Produis un plan structuré avec des étapes claires, des dépendances et des priorités.",
  };

  const agentPrompt = base[agent] ?? `Tu es l'agent ${agent}. Réponds de façon structurée et complète.`;

  return `${agentPrompt}\n\nFormat de sortie attendu : ${expectedOutput}.\nRéponds en français sauf si la demande est en anglais.`;
}
