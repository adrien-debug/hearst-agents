# Domain Model — Hearst Managed Agents

## Entity Map

```
Agent ──┬── AgentVersion (immutable snapshots)
        ├── AgentSkill ── Skill ── SkillVersion
        ├── AgentTool ─── Tool (governed)
        ├── AgentMemory
        ├── Conversation ── Message
        ├── ModelProfile (fallback chain)
        └── MemoryPolicy

Workflow ── WorkflowStep ── Agent (per step)
         ├── WorkflowVersion (immutable snapshot with steps)
         └── WorkflowRun (legacy — to deprecate)

Run ────── Trace (1:N, ordered, with output_trust)
        ├── replay_of_run_id → Run (self-ref)
        ├── workflow_version_id → WorkflowVersion
        ├── prompt_artifact_id → PromptArtifact
        ├── cost_budget_usd (runtime enforcement)
        └── replay_mode: live | stub

PromptArtifact (versioned, checksummed)
        ├── agent_id, skill_id, workflow_id (scope links)
        └── parent_id (version chain)

Dataset ── DatasetEntry
Evaluation ── Run + DatasetEntry
```

## Core Entities

### Agent
The central entity. Has a name, slug, model config, system prompt, version counter.
- **Versioning**: Every update auto-creates an `AgentVersion` snapshot
- **Links**: model_profile, memory_policy, skills (M2M), tools (M2M), knowledge bases (M2M)
- **Statuses**: `active` | `paused` | `archived`

### AgentVersion
Immutable snapshot of agent config at a point in time.
- Fields: `system_prompt`, `config_snapshot` (JSONB), `model_profile_id`, `changelog`
- Created automatically on agent update
- Referenced by `runs.agent_version_id` for exact replay

### Skill / SkillVersion
Reusable prompt-based capabilities assigned to agents.
- Versioned via `skill_versions` table
- `active_version` on skills table points to current version

### Tool
External HTTP-callable capability with full governance:
- `risk_level`: low | medium | high | critical
- `retry_policy`: {max_retries, backoff_ms, backoff_multiplier}
- `rate_limit`: {max_calls_per_minute, max_calls_per_run}
- `kill_switch`: boolean — immediately blocks all execution
- `enabled`: boolean — soft disable
- `requires_sandbox`: boolean — blocks execution if no sandbox available
- `auth_type`: none | api_key | oauth

### AgentTool (M2M)
Per-agent tool assignment with governance overrides:
- `enabled`: per-agent toggle
- `timeout_override_ms`: override tool default
- `max_calls_per_run`: per-agent rate limit
- `risk_accepted`: explicit acceptance of critical-risk tools

### PromptArtifact
Immutable, versioned, checksummed prompt storage.
- `slug` + `version`: unique identifier
- `kind`: system_prompt | skill_prompt | workflow_instruction | tool_template | guard_prompt | eval_prompt | custom
- `scope`: global | agent | skill | workflow
- `content_hash`: SHA-256 prefix for dedup detection
- `parent_id`: links to previous version of same slug
- Scope links: `agent_id`, `skill_id`, `workflow_id`

### ModelProfile
Named LLM configuration: provider + model + params + cost tracking.
- `fallback_profile_id`: creates fallback chains
- `cost_per_1k_in/out`: for cost computation
- `max_cost_per_run`: cost guardrail
- `is_default`: designates the default profile

### Run
Top-level execution record. Every chat, workflow, eval, or tool_test creates a run.
- `kind`: chat | workflow | evaluation | tool_test
- `status`: pending → running → completed | failed | cancelled | timeout
- `trigger`: api | workflow | schedule | replay | eval
- `replay_of_run_id`: links replay to original
- `replay_mode`: live | stub — how the replay was executed
- `prompt_artifact_id`: exact prompt used
- `agent_version_id`: exact agent config used
- `workflow_version_id`: exact workflow version used
- `cost_budget_usd`: runtime cost limit (enforced by cost sentinel)
- Aggregated: tokens_in, tokens_out, cost_usd, latency_ms

### Trace
Granular record of a single operation within a run.
- `kind`: llm_call | tool_call | memory_read | memory_write | skill_invoke | condition_eval | error | guard | custom
- `status`: pending | running | completed | failed | skipped | timeout
- `output_trust`: verified | tool_backed | unverified | guard_failed | stubbed
- Per-trace: input, output, error, tokens, cost, latency, model_used

### Workflow / WorkflowStep / WorkflowVersion
Sequential execution pipeline. Steps execute in order.
- Step types: chat | tool_call | condition | loop | transform
- Each step can reference an agent and a config object
- `on_success_step_id` / `on_failure_step_id` for branching
- **WorkflowVersion**: immutable snapshot at publication time
  - `steps_snapshot`: JSON array of step definitions frozen at publish
  - `config_snapshot`: workflow metadata at time of publish
  - Published via `POST /api/workflows/{id}/publish`
  - Workflow execution uses `active_version_id` if available, fallback to live steps

### MemoryPolicy
Governance rules for agent memory lifecycle:
- `max_entries`, `ttl_seconds`, `min_importance`
- `auto_expire`, `auto_summarize`
- `dedup_strategy`: latest | highest_importance | merge

### Dataset / DatasetEntry
Structured test sets for batch evaluation:
- Entries have `input`, `expected_output`, `tags`
- Evaluations link to both `run_id` and `dataset_entry_id`

## Invariants

1. Agent versions are **immutable** — never updated after creation
2. Prompt artifacts are **immutable** — new version = new row
3. Workflow versions are **immutable** — steps_snapshot never modified
4. Runs can only transition forward (see RUNTIME_AND_REPLAY.md)
5. Tools with `kill_switch=true` cannot be called under any circumstance
6. Critical-risk tools require explicit `risk_accepted=true` on agent_tools
7. `content_hash` on prompt_artifacts prevents duplicate versions
8. Runs exceeding `cost_budget_usd` are halted with `COST_LIMIT_EXCEEDED`
9. Stub replays produce zero real cost — output_trust = "stubbed"

## Legacy / Deprecation

| Entity | Status | Replacement |
|--------|--------|-------------|
| `usage_logs` | **Deprecated** | `runs` + `traces` |
| `workflow_runs` | **Deprecated** | `runs` (kind=workflow) + `workflow_version_id` |
