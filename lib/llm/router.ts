import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";
import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk, ModelProfileConfig } from "./types";
import type { RunTracer } from "../runtime/tracer";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { scoreModels, selectModel, type ModelGoal, type ModelScore, type ModelSelection } from "../decisions/model-selector";

const providers: Record<string, LLMProvider> = {};

export function getProvider(providerName: string): LLMProvider {
  const key = providerName.toLowerCase();
  if (!providers[key]) {
    switch (key) {
      case "openai":
        providers[key] = new OpenAIProvider();
        break;
      case "anthropic":
        providers[key] = new AnthropicProvider();
        break;
      default:
        throw new Error(`Unknown LLM provider: ${providerName}`);
    }
  }
  return providers[key];
}

function computeCost(
  tokensIn: number,
  tokensOut: number,
  costPer1kIn: number,
  costPer1kOut: number,
): number {
  return (tokensIn / 1000) * costPer1kIn + (tokensOut / 1000) * costPer1kOut;
}

export async function resolveModelProfile(
  sb: SupabaseClient<Database>,
  profileId: string,
): Promise<ModelProfileConfig | null> {
  const { data } = await sb
    .from("model_profiles")
    .select("provider, model, temperature, max_tokens, top_p, cost_per_1k_in, cost_per_1k_out, max_cost_per_run, fallback_profile_id")
    .eq("id", profileId)
    .single();

  if (!data) return null;
  return data;
}

async function loadFallbackChain(
  sb: SupabaseClient<Database>,
  profileId: string,
  maxDepth = 3,
): Promise<ModelProfileConfig[]> {
  const chain: ModelProfileConfig[] = [];
  let currentId: string | null = profileId;
  let depth = 0;

  while (currentId && depth < maxDepth) {
    const profile = await resolveModelProfile(sb, currentId);
    if (!profile) break;
    chain.push(profile);
    currentId = profile.fallback_profile_id;
    depth++;
  }

  return chain;
}

export async function chatWithProfile(
  sb: SupabaseClient<Database>,
  profileId: string,
  messages: ChatRequest["messages"],
  overrides?: Partial<Pick<ChatRequest, "temperature" | "max_tokens" | "top_p">>,
): Promise<ChatResponse & { profile_used: string }> {
  const chain = await loadFallbackChain(sb, profileId);

  if (chain.length === 0) {
    throw new Error(`No model profile found for id: ${profileId}`);
  }

  let lastError: Error | null = null;

  for (const profile of chain) {
    try {
      const provider = getProvider(profile.provider);
      const response = await provider.chat({
        model: profile.model,
        messages,
        temperature: overrides?.temperature ?? profile.temperature,
        max_tokens: overrides?.max_tokens ?? profile.max_tokens,
        top_p: overrides?.top_p ?? profile.top_p,
      });

      response.cost_usd = computeCost(
        response.tokens_in,
        response.tokens_out,
        profile.cost_per_1k_in,
        profile.cost_per_1k_out,
      );

      if (profile.max_cost_per_run && response.cost_usd > profile.max_cost_per_run) {
        console.warn(
          `Cost limit exceeded: $${response.cost_usd.toFixed(4)} > $${profile.max_cost_per_run} for ${profile.provider}/${profile.model}`,
        );
      }

      return { ...response, profile_used: `${profile.provider}/${profile.model}` };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(
        `Provider ${profile.provider}/${profile.model} failed, trying fallback:`,
        lastError.message,
      );
    }
  }

  throw lastError ?? new Error("All providers in fallback chain failed");
}

export async function* streamChatWithProfile(
  sb: SupabaseClient<Database>,
  profileId: string,
  messages: ChatRequest["messages"],
  overrides?: Partial<Pick<ChatRequest, "temperature" | "max_tokens" | "top_p">>,
): AsyncGenerator<StreamChunk & { profile_used?: string }> {
  const chain = await loadFallbackChain(sb, profileId);

  if (chain.length === 0) {
    throw new Error(`No model profile found for id: ${profileId}`);
  }

  let lastError: Error | null = null;

  for (const profile of chain) {
    try {
      const provider = getProvider(profile.provider);
      const stream = provider.streamChat({
        model: profile.model,
        messages,
        temperature: overrides?.temperature ?? profile.temperature,
        max_tokens: overrides?.max_tokens ?? profile.max_tokens,
        top_p: overrides?.top_p ?? profile.top_p,
        stream: true,
      });

      let first = true;
      for await (const chunk of stream) {
        if (first) {
          yield { ...chunk, profile_used: `${profile.provider}/${profile.model}` };
          first = false;
        } else {
          yield chunk;
        }
      }
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(
        `Stream ${profile.provider}/${profile.model} failed, trying fallback:`,
        lastError.message,
      );
    }
  }

  throw lastError ?? new Error("All providers in fallback chain failed");
}

// ---------------------------------------------------------------------------
// Smart Model Routing — opt-in, trace-first, fallback guaranteed
// ---------------------------------------------------------------------------

export interface ModelDecision {
  selected_provider: string;
  selected_model: string;
  selected_score: number;
  selected_reliability: string;
  goal: ModelGoal;
  reason: string;
  fallback_count: number;
  fallbacks: Array<{ provider: string; model: string; score: number }>;
  scores_considered: number;
  original_provider: string;
  original_model: string;
  was_overridden: boolean;
}

export interface SmartChatOptions {
  goal?: ModelGoal;
  agent_provider: string;
  agent_model: string;
  messages: ChatRequest["messages"];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tracer?: RunTracer;
  days?: number;
}

export async function smartChat(
  sb: SupabaseClient<Database>,
  opts: SmartChatOptions,
): Promise<ChatResponse & { decision: ModelDecision }> {
  const goal = opts.goal ?? "balanced";
  const scores = await scoreModels(sb, { days: opts.days ?? 14 });
  const selection = selectModel(scores, goal);

  const decision = buildDecision(selection, scores, goal, opts.agent_provider, opts.agent_model);

  if (opts.tracer) {
    await traceDecision(opts.tracer, decision);
  }

  const chain = buildSmartChain(decision);

  let lastError: Error | null = null;
  let attemptIndex = 0;

  for (const attempt of chain) {
    try {
      const provider = getProvider(attempt.provider);
      const response = await provider.chat({
        model: attempt.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        top_p: opts.top_p,
      });

      if (attemptIndex > 0 && opts.tracer) {
        await traceFallback(opts.tracer, attempt, attemptIndex, chain[0], lastError?.message);
      }

      return { ...response, decision };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(
        `smart-chat: ${attempt.provider}/${attempt.model} failed (attempt ${attemptIndex + 1}):`,
        lastError.message,
      );
      attemptIndex++;
    }
  }

  throw lastError ?? new Error("All models in smart chain failed");
}

export async function* smartStreamChat(
  sb: SupabaseClient<Database>,
  opts: SmartChatOptions,
): AsyncGenerator<StreamChunk & { decision?: ModelDecision; profile_used?: string }> {
  const goal = opts.goal ?? "balanced";
  const scores = await scoreModels(sb, { days: opts.days ?? 14 });
  const selection = selectModel(scores, goal);

  const decision = buildDecision(selection, scores, goal, opts.agent_provider, opts.agent_model);

  if (opts.tracer) {
    await traceDecision(opts.tracer, decision);
  }

  const chain = buildSmartChain(decision);

  let lastError: Error | null = null;
  let attemptIndex = 0;

  for (const attempt of chain) {
    try {
      const provider = getProvider(attempt.provider);
      const stream = provider.streamChat({
        model: attempt.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        top_p: opts.top_p,
        stream: true,
      });

      if (attemptIndex > 0 && opts.tracer) {
        await traceFallback(opts.tracer, attempt, attemptIndex, chain[0], lastError?.message);
      }

      let first = true;
      for await (const chunk of stream) {
        if (first) {
          yield { ...chunk, decision, profile_used: `${attempt.provider}/${attempt.model}` };
          first = false;
        } else {
          yield chunk;
        }
      }
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.error(
        `smart-stream: ${attempt.provider}/${attempt.model} failed (attempt ${attemptIndex + 1}):`,
        lastError.message,
      );
      attemptIndex++;
    }
  }

  throw lastError ?? new Error("All models in smart chain failed");
}

function buildDecision(
  selection: ModelSelection,
  scores: ModelScore[],
  goal: ModelGoal,
  originalProvider: string,
  originalModel: string,
): ModelDecision {
  const selected = selection.selected;
  const selectedProvider = selected?.provider ?? originalProvider;
  const selectedModel = selected?.model ?? originalModel;

  return {
    selected_provider: selectedProvider,
    selected_model: selectedModel,
    selected_score: selected?.score ?? 0,
    selected_reliability: selected?.reliability ?? "unknown",
    goal,
    reason: selection.reason,
    fallback_count: selection.fallbacks.length,
    fallbacks: selection.fallbacks.map((f) => ({
      provider: f.provider,
      model: f.model,
      score: f.score,
    })),
    scores_considered: scores.length,
    original_provider: originalProvider,
    original_model: originalModel,
    was_overridden: selected
      ? selectedProvider !== originalProvider.toLowerCase() || selectedModel !== originalModel
      : false,
  };
}

function buildSmartChain(
  decision: ModelDecision,
): Array<{ provider: string; model: string }> {
  const chain: Array<{ provider: string; model: string }> = [];

  chain.push({ provider: decision.selected_provider, model: decision.selected_model });

  for (const fb of decision.fallbacks) {
    const key = `${fb.provider}/${fb.model}`;
    if (key !== `${decision.selected_provider}/${decision.selected_model}`) {
      chain.push({ provider: fb.provider, model: fb.model });
    }
  }

  const origKey = `${decision.original_provider}/${decision.original_model}`;
  if (!chain.some((c) => `${c.provider}/${c.model}` === origKey)) {
    chain.push({ provider: decision.original_provider, model: decision.original_model });
  }

  return chain;
}

async function traceDecision(tracer: RunTracer, decision: ModelDecision) {
  await tracer.trace({
    kind: "custom",
    name: "model_selection",
    input: {
      goal: decision.goal,
      original: `${decision.original_provider}/${decision.original_model}`,
      scores_considered: decision.scores_considered,
    },
    fn: async () => ({
      output: {
        selected: `${decision.selected_provider}/${decision.selected_model}`,
        score: decision.selected_score,
        reliability: decision.selected_reliability,
        was_overridden: decision.was_overridden,
        reason: decision.reason,
        fallback_count: decision.fallback_count,
        fallbacks: decision.fallbacks.map((f) => `${f.provider}/${f.model}`),
      } as Record<string, Json>,
    }),
  });
}

async function traceFallback(
  tracer: RunTracer,
  attempt: { provider: string; model: string },
  attemptIndex: number,
  primary: { provider: string; model: string },
  previousError?: string,
) {
  await tracer.trace({
    kind: "custom",
    name: "model_fallback",
    input: {
      failed_model: `${primary.provider}/${primary.model}`,
      attempt_index: attemptIndex,
      error: previousError ?? "unknown",
    },
    fn: async () => ({
      output: {
        fallback_to: `${attempt.provider}/${attempt.model}`,
        reason: `Primary ${primary.provider}/${primary.model} failed, falling back to attempt #${attemptIndex + 1}`,
      } as Record<string, Json>,
    }),
  });
}
