import type { Database } from "../database.types";

type Tables = Database["public"]["Tables"];

export type Agent = Tables["agents"]["Row"];
export type AgentInsert = Tables["agents"]["Insert"];
export type AgentUpdate = Tables["agents"]["Update"];

export type Skill = Tables["skills"]["Row"];
export type Tool = Tables["tools"]["Row"];

export type Conversation = Tables["conversations"]["Row"];
export type Message = Tables["messages"]["Row"];
export type AgentMemory = Tables["agent_memory"]["Row"];

export type Workflow = Tables["workflows"]["Row"];
export type WorkflowStep = Tables["workflow_steps"]["Row"];
export type WorkflowRun = Tables["workflow_runs"]["Row"];

export type Evaluation = Tables["evaluations"]["Row"];
export type UsageLog = Tables["usage_logs"]["Row"];
export type AgentVersion = Tables["agent_versions"]["Row"];

export type ModelProfile = Tables["model_profiles"]["Row"];
export type Run = Tables["runs"]["Row"];
export type Trace = Tables["traces"]["Row"];
export type MemoryPolicy = Tables["memory_policies"]["Row"];
export type Dataset = Tables["datasets"]["Row"];
export type DatasetEntry = Tables["dataset_entries"]["Row"];
export type SkillVersion = Tables["skill_versions"]["Row"];
export type PromptArtifact = Tables["prompt_artifacts"]["Row"];
export type WorkflowVersion = Tables["workflow_versions"]["Row"];
export type IntegrationConnection = Tables["integration_connections"]["Row"];
export type ImprovementSignal = Tables["improvement_signals"]["Row"];
export type AppliedChange = Tables["applied_changes"]["Row"];

export type RunKind = "chat" | "workflow" | "evaluation" | "tool_test";
export type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout";
export type TraceKind =
  | "llm_call"
  | "tool_call"
  | "memory_read"
  | "memory_write"
  | "skill_invoke"
  | "condition_eval"
  | "error"
  | "guard"
  | "custom";

export type PromptKind =
  | "system_prompt"
  | "skill_prompt"
  | "workflow_instruction"
  | "tool_template"
  | "guard_prompt"
  | "eval_prompt"
  | "custom";

export type PromptScope = "global" | "agent" | "skill" | "workflow";

export interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
