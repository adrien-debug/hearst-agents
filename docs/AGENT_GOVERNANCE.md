# Agent & Tool Governance — Hearst Managed Agents

## Tool Governance Model

Every tool has governance properties enforced at runtime before execution.

### Global Tool Properties

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `enabled` | boolean | true | Soft disable — tool won't execute |
| `kill_switch` | boolean | false | Hard block — immediate rejection, no override |
| `risk_level` | enum | "low" | low, medium, high, critical |
| `requires_sandbox` | boolean | false | Blocks execution without sandbox environment |
| `timeout_ms` | int | 30000 | Max execution time per call |
| `retry_policy` | jsonb | `{max_retries:0, backoff_ms:1000, backoff_multiplier:2}` | Retry on retryable failures |
| `rate_limit` | jsonb | `{max_calls_per_minute:60, max_calls_per_run:100}` | Rate limiting |

### Per-Agent Overrides (agent_tools)

| Field | Type | Purpose |
|-------|------|---------|
| `enabled` | boolean | Agent-level toggle for this tool |
| `timeout_override_ms` | int | Override the tool's default timeout |
| `max_calls_per_run` | int | Agent-specific rate limit |
| `risk_accepted` | boolean | Explicit acceptance of critical-risk tools |

### Enforcement Order

```
1. kill_switch? → REJECT (RuntimeError: TOOL_KILL_SWITCH)
2. tool.enabled? → REJECT if false (RuntimeError: TOOL_DISABLED)
3. agent_tools.enabled? → REJECT if false (RuntimeError: TOOL_DISABLED)
4. risk_level == critical && !risk_accepted? → REJECT (RuntimeError: TOOL_RISK_NOT_ACCEPTED)
5. requires_sandbox? → REJECT (RuntimeError: TOOL_SANDBOX_REQUIRED)
6. rate_limit exceeded? → REJECT (RuntimeError: TOOL_RATE_LIMITED)
7. Execute with retry_policy
8. Timeout enforcement via timeout_ms (or override)
```

### Risk Levels

| Level | Meaning | Requires |
|-------|---------|----------|
| `low` | Read-only or idempotent | Nothing special |
| `medium` | May modify external state | Agent assignment |
| `high` | Modifies external state, may cost money | Agent assignment + monitoring |
| `critical` | Destructive or irreversible | Explicit `risk_accepted=true` on agent_tools |

## Agent Lifecycle

### Statuses
- `active`: Accepting requests
- `paused`: Temporarily disabled
- `archived`: Soft-deleted, preserved for history

### Versioning
Every agent update automatically:
1. Snapshots current config → `agent_versions`
2. Increments `agents.version`
3. Updates `agents.active_version_id`

Versions capture: `system_prompt`, `config_snapshot` (model params), `model_profile_id`.

## Prompt Governance

### Prompt Artifacts
All critical prompts are stored as immutable, versioned artifacts in `prompt_artifacts`.

- **Dedup**: Content hash prevents creating identical versions
- **Lineage**: `parent_id` links to the previous version
- **Scope**: Global, agent-scoped, skill-scoped, or workflow-scoped
- **Audit**: `created_by` field for attribution

### Prompt Types
| Kind | Usage |
|------|-------|
| `system_prompt` | Agent system instructions |
| `skill_prompt` | Skill prompt templates |
| `workflow_instruction` | Step-level instructions |
| `tool_template` | Tool-use formatting |
| `guard_prompt` | Safety/guardrail prompts |
| `eval_prompt` | Evaluation criteria prompts |
| `custom` | User-defined |

## Memory Governance

Memory policies control the lifecycle of agent memory entries.

| Policy Field | Purpose |
|-------------|---------|
| `max_entries` | Cap total memories per agent |
| `ttl_seconds` | Auto-expire by age |
| `min_importance` | Purge below threshold |
| `auto_expire` | Enable TTL + expires_at enforcement |
| `auto_summarize` | (Reserved) Auto-summarize before eviction |
| `dedup_strategy` | latest, highest_importance, merge |

### Enforcement
Memory policy is enforced via `enforceMemoryPolicy()`:
1. Expire by TTL (last_accessed_at)
2. Expire by explicit expires_at
3. Remove below min_importance
4. Deduplicate by key
5. Trim to max_entries (lowest importance first)

## Cost Governance

### Per-Run Budget

| Source | Field | Location |
|--------|-------|----------|
| Explicit | `cost_budget_usd` | `runs` table (set at run creation) |
| Agent default | `cost_budget_per_run` | `agents` table |
| Provider cap | `max_cost_per_run` | `model_profiles` table |

### Enforcement

`enforceCostBudget()` is called after every trace in `RunTracer`:
1. Accumulates cost from all traces
2. Emits `cost:warning` event at 80% utilization
3. Throws `COST_LIMIT_EXCEEDED` at 100% — run is halted

### Auto-Injection

`agents.cost_budget_per_run` is automatically injected into `startRun` in:
- `app/api/agents/[id]/chat/route.ts`
- `app/api/datasets/[id]/evaluate/route.ts`
- Workflow runs accept `cost_budget_usd` via request body

### Best Practices

- Set `cost_budget_per_run` on agents as a safety net
- Use `cost_budget_usd` on replay/eval runs to limit experiment cost
- Stub replays always cost $0

## Prompt Governance

### Artifact Validation

`validatePromptArtifact()` checks before any prompt is used:
- Artifact exists in DB
- Content is non-empty
- Returns slug, version, and content_hash for traceability

### Output Trust

Every trace can carry an `output_trust` level:
| Level | Meaning |
|-------|---------|
| `verified` | Externally validated output |
| `tool_backed` | Output derived from tool/API data |
| `unverified` | Raw LLM output |
| `guard_failed` | Failed post-check |
| `stubbed` | Replay stub, no real execution |

### Guard System

#### Basic Guards (`checkOutputBasicGuards`)
- Rejects empty outputs
- Rejects outputs > 500k chars (runaway generation)

#### JSON Structure Guard (`checkJsonStructure`)
- Validates output is parseable JSON

#### Size Guard (`checkOutputSize`)
- Configurable min/max char limits

#### Regex Guard (`checkOutputRegex`)
- `mustMatch` patterns — required patterns in output
- `mustNotMatch` patterns — forbidden patterns in output

#### Blacklist Guard (`checkOutputBlacklist`)
- Case-insensitive term matching against forbidden word list

#### Agent Guard Policy (`applyAgentGuardPolicy`)
Composable per-agent policy applying all guards:

```typescript
interface AgentGuardPolicy {
  expect_json?: boolean;
  min_output_chars?: number;
  max_output_chars?: number;
  must_match?: string[];       // regex patterns
  must_not_match?: string[];   // regex patterns
  blacklist?: string[];
}
```

### Output Validation Layer

`validateOutput()` runs all applicable guards and returns:

| Field | Type | Description |
|-------|------|-------------|
| `classification` | valid/invalid/suspect | Overall verdict |
| `trust` | OutputTrust | Trust level |
| `score` | 0-1 | Ratio of passed checks |
| `failed_guards` | string[] | Names of failed guards |
| `policy_result` | PolicyCheckResult | Detailed per-guard results |

## Runtime Error Codes

| Code | Meaning | Retryable |
|------|---------|-----------|
| `INVALID_TRANSITION` | Illegal status change | No |
| `RUN_NOT_STARTED` | Trace attempted before startRun | No |
| `RUN_ALREADY_FINISHED` | Trace attempted after endRun | No |
| `TIMEOUT` | Operation exceeded time limit | No |
| `MAX_RETRIES_EXCEEDED` | Retry policy exhausted | No |
| `TOOL_DISABLED` | Tool or agent-tool is disabled | No |
| `TOOL_KILL_SWITCH` | Kill switch is active | No |
| `TOOL_RISK_NOT_ACCEPTED` | Critical tool without acceptance | No |
| `TOOL_RATE_LIMITED` | Rate limit exceeded | No |
| `TOOL_SANDBOX_REQUIRED` | Sandbox required but unavailable | No |
| `PROVIDER_UNAVAILABLE` | LLM provider unreachable | Yes |
| `COST_LIMIT_EXCEEDED` | Cost cap reached | No |
| `INVALID_INPUT` | Bad input data | No |
| `AGENT_NOT_FOUND` | Agent ID not found | No |
| `WORKFLOW_NOT_FOUND` | Workflow ID not found | No |
| `STEP_FAILED` | A workflow/tool step failed | Maybe |
| `REPLAY_SOURCE_NOT_FOUND` | Original run not found for replay | No |
