/**
 * Managed Agent client — wraps the Anthropic SDK beta API.
 *
 * Handles agent + environment provisioning (created once, reused).
 * IDs are cached in-memory and persisted in env vars for restart resilience.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/* ─── Agent ─── */

let _agentId: string | null = process.env.MANAGED_AGENT_ID ?? null;

const HEARST_AGENT_CONFIG = {
  name: "Hearst Agent",
  model: "claude-sonnet-4-6",
  system: `Tu es Hearst — un agent autonome qui exécute des tâches pour l'utilisateur.
Tu as accès à bash, à l'écriture de fichiers, et à la recherche web.
Quand on te donne une tâche, exécute-la complètement et rapporte le résultat.
Sois concis dans tes messages. Toujours en français.`,
  tools: [{ type: "agent_toolset_20260401" as const }],
};

export async function getOrCreateAgent(): Promise<string> {
  if (_agentId) return _agentId;

  const client = getAnthropicClient();
  console.log("[ManagedAgent] Creating agent…");

  const agent = await (client.beta as unknown as {
    agents: {
      create: (params: typeof HEARST_AGENT_CONFIG) => Promise<{ id: string; version: number }>;
    };
  }).agents.create(HEARST_AGENT_CONFIG);

  _agentId = agent.id;
  console.log(`[ManagedAgent] Agent created: ${agent.id} (v${agent.version})`);
  return agent.id;
}

/* ─── Environment ─── */

let _envId: string | null = process.env.MANAGED_ENV_ID ?? null;

export async function getOrCreateEnvironment(): Promise<string> {
  if (_envId) return _envId;

  const client = getAnthropicClient();
  console.log("[ManagedAgent] Creating environment…");

  const env = await (client.beta as unknown as {
    environments: {
      create: (params: { name: string; config: { type: string; networking: { type: string } } }) => Promise<{ id: string }>;
    };
  }).environments.create({
    name: "hearst-env",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  });

  _envId = env.id;
  console.log(`[ManagedAgent] Environment created: ${env.id}`);
  return env.id;
}

/* ─── Session ─── */

export interface ManagedSession {
  id: string;
  agentId: string;
  environmentId: string;
}

export async function createSession(title?: string): Promise<ManagedSession> {
  const client = getAnthropicClient();
  const agentId = await getOrCreateAgent();
  const environmentId = await getOrCreateEnvironment();

  console.log(`[ManagedAgent] Creating session — agent=${agentId} env=${environmentId}`);

  const session = await (client.beta as unknown as {
    sessions: {
      create: (params: { agent: string; environment_id: string; title?: string }) => Promise<{ id: string }>;
    };
  }).sessions.create({
    agent: agentId,
    environment_id: environmentId,
    title: title ?? "Hearst session",
  });

  console.log(`[ManagedAgent] Session created: ${session.id}`);
  return { id: session.id, agentId, environmentId };
}
