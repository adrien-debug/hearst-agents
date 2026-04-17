import { z } from "zod";

const jsonField = z.record(z.string(), z.any()).default({});

// ── Agents ──────────────────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).optional(),
  model_provider: z.enum(["openai", "anthropic"]).default("openai"),
  model_name: z.string().min(1).default("gpt-4o"),
  system_prompt: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).max(200000).default(4096),
  top_p: z.number().min(0).max(1).default(1.0),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  model_profile_id: z.string().uuid().optional(),
  memory_policy_id: z.string().uuid().optional(),
  metadata: jsonField,
});

export const updateAgentSchema = createAgentSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, "At least one field required");

// ── Skills ──────────────────────────────────────────────

export const createSkillSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  category: z.string().max(100).default("general"),
  description: z.string().max(2000).optional(),
  prompt_template: z.string().default(""),
  input_schema: jsonField,
  output_schema: jsonField,
});

// ── Tools ───────────────────────────────────────────────

export const createToolSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().max(2000).optional(),
  endpoint_url: z.string().url().optional(),
  http_method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
  input_schema: jsonField,
  output_schema: jsonField,
  auth_type: z.enum(["none", "api_key", "oauth"]).default("none"),
  auth_config: jsonField,
  timeout_ms: z.number().int().min(100).max(300000).default(30000),
});

// ── Chat ────────────────────────────────────────────────

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(100000),
  conversation_id: z.string().uuid().optional(),
  smart_routing: z.boolean().optional(),
  model_goal: z.enum(["reliability", "speed", "cost", "balanced"]).optional(),
});

// ── Memory ──────────────────────────────────────────────

export const createMemorySchema = z.object({
  memory_type: z.enum(["fact", "preference", "context", "learned"]).default("fact"),
  key: z.string().min(1).max(500),
  value: z.string().min(1).max(50000),
  importance: z.number().min(0).max(1).default(0.5),
  expires_at: z.string().datetime().optional(),
});

// ── Evaluate ────────────────────────────────────────────

export const evaluateSchema = z.object({
  test_input: z.string().min(1),
  expected_output: z.string().min(1),
  eval_type: z.enum(["accuracy", "speed", "relevance", "helpfulness"]).default("accuracy"),
});

// ── Workflows ───────────────────────────────────────────

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  trigger_type: z.enum(["manual", "schedule", "webhook"]).default("manual"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
});

// ── Conversations ───────────────────────────────────────

export const createConversationSchema = z.object({
  agent_id: z.string().uuid(),
  title: z.string().max(200).default("Nouvelle conversation"),
  user_identifier: z.string().max(500).optional(),
});

// ── Model Profiles ──────────────────────────────────────

export const createModelProfileSchema = z.object({
  name: z.string().min(1).max(200),
  provider: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(1).default(4096),
  top_p: z.number().min(0).max(1).default(1.0),
  fallback_profile_id: z.string().uuid().optional(),
  cost_per_1k_in: z.number().min(0).default(0),
  cost_per_1k_out: z.number().min(0).default(0),
  max_cost_per_run: z.number().min(0).optional(),
  is_default: z.boolean().default(false),
  metadata: jsonField,
});
