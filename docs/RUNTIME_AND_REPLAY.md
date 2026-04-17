# Runtime & Replay — Hearst Managed Agents

## Run Lifecycle

### Status Machine

```
         ┌──────────┐
         │ pending   │
         └─────┬─────┘
               │ startRun()
         ┌─────▼─────┐
    ┌────│ running    │────┐
    │    └─────┬─────┘    │
    │          │           │
    │    ┌─────▼─────┐    │
    │    │ completed  │    │
    │    └───────────┘    │
    │                      │
    │    ┌───────────┐    │
    ├───▶│ failed    │    │
    │    └───────────┘    │
    │                      │
    │    ┌───────────┐    │
    ├───▶│ timeout   │    │
    │    └───────────┘    │
    │                      │
    │    ┌───────────┐    │
    └───▶│ cancelled │◀───┘
         └───────────┘

  pending → running | cancelled
  running → completed | failed | cancelled | timeout
  Terminal states: completed, failed, cancelled, timeout
```

### Allowed Transitions

| From | To |
|------|----|
| `pending` | `running`, `cancelled` |
| `running` | `completed`, `failed`, `cancelled`, `timeout` |
| `completed` | (none — terminal) |
| `failed` | (none — terminal) |
| `cancelled` | (none — terminal) |
| `timeout` | (none — terminal) |

Invalid transitions throw `RuntimeError("INVALID_TRANSITION")`.

### Trace Status Machine

Same pattern but with additional `skipped` state:
- `pending → running | skipped`
- `running → completed | failed | timeout`

## Run Triggers

| Trigger | Source |
|---------|--------|
| `api` | Direct API call (default) |
| `workflow` | Triggered by workflow engine |
| `schedule` | Triggered by scheduler (future) |
| `replay` | Re-execution of a previous run |
| `eval` | Triggered by evaluation system |

## Trace Kinds

| Kind | What it records |
|------|----------------|
| `llm_call` | LLM provider API call |
| `tool_call` | External tool HTTP call |
| `memory_read` | Reading agent memory |
| `memory_write` | Writing to agent memory |
| `skill_invoke` | Skill template application |
| `condition_eval` | Workflow condition evaluation |
| `error` | Error event |
| `guard` | Guardrail check |
| `custom` | Application-specific event |

## Timeout Model

| Scope | Default | Config |
|-------|---------|--------|
| Run-level | 300s (5 min) | `runs.timeout_ms` |
| Step-level | 120s (2 min) | `TraceOptions.timeout_ms` |
| Tool-level | 30s | `tools.timeout_ms` / `agent_tools.timeout_override_ms` |
| LLM-level | 60s | `DEFAULT_TIMEOUTS.llm_timeout_ms` |

Timeout enforcement uses `withTimeout()` which wraps any Promise with a `RuntimeError("TIMEOUT")` on expiry.

## Retry Model

```typescript
interface RetryPolicy {
  max_retries: number;       // 0 = no retry
  backoff_ms: number;        // initial delay
  backoff_multiplier: number; // exponential factor
}
```

Only errors with `retryable=true` are retried. `withRetry()` enforces the policy and throws `MAX_RETRIES_EXCEEDED` when exhausted.

Retryable errors:
- HTTP 5xx from tool calls
- `PROVIDER_UNAVAILABLE`
- `STEP_FAILED` (from tool HTTP errors)

Non-retryable errors:
- All governance violations (kill switch, disabled, risk, rate limit)
- Timeouts
- Invalid inputs
- State transition errors

## Event Model

Every run emits structured events during execution:

| Event | When |
|-------|------|
| `run:started` | Run transitions to running |
| `run:completed` | Run finishes successfully |
| `run:failed` | Run finishes with error |
| `run:timeout` | Run exceeded timeout |
| `run:cancelled` | Run was cancelled |
| `trace:started` | A trace begins |
| `trace:completed` | A trace finishes successfully |
| `trace:failed` | A trace fails |
| `trace:timeout` | A trace times out |
| `retry:attempt` | A retry is attempted |
| `cost:warning` | Cost threshold approached |
| `tool:kill_switch` | Kill switch blocked execution |

Events are collected in-memory on the `RunTracer` instance and can be retrieved via `tracer.getEvents()`.

## Cost Sentinel

Runtime cost enforcement — budget is checked after every trace.

| Field | Location | Purpose |
|-------|----------|---------|
| `cost_budget_usd` | `runs` table | Per-run cost cap |
| `cost_budget_per_run` | `agents` table | Default budget per agent |
| `max_cost_per_run` | `model_profiles` table | Provider-level cap |

### Enforcement Flow

1. After each trace, `enforceCostBudget()` is called
2. If cost >= 80% of budget → `cost:warning` event emitted
3. If cost >= budget → `RuntimeError("COST_LIMIT_EXCEEDED")` thrown → run fails

### Zero-Cost Mode

Stub replays produce `cost_usd = 0` — they never call real providers.

## Replay System

### Replay Modes

| Mode | Behavior | Cost | Side Effects |
|------|----------|------|-------------|
| `live` | Re-executes against real LLM provider | Real cost | Possible |
| `stub` | Uses original trace outputs as responses | Zero | None |

### What Replay Freezes

- Agent version (via `agent_version_id`)
- Model profile (via `model_profile_id`)
- Prompt (via `prompt_artifact_id` or `agent_versions.system_prompt`)
- Workflow version (via `workflow_version_id`)
- Input (or overridable via `override_input`)

### Replay API

```
POST /api/runs/{run_id}/replay

Body (optional):
{
  "mode": "stub",
  "override_input": { "message": "alternative input" },
  "cost_budget_usd": 0.10
}

Response:
{
  "ok": true,
  "replay_run_id": "...",
  "original_run_id": "...",
  "replay_mode": "stub",
  "status": "completed",
  "stubs_used": 1,
  "output": { ... },
  "comparison": { ... }
}
```

### Stub Mode Details (Multi-Step)

- Loads **all** original traces ordered by `started_at`
- Iterates through every trace (LLM, tool, memory, condition, custom)
- For each trace: returns the exact original output with zero cost
- Skipped traces (status=skipped) are not replayed
- Empty original outputs trigger a fallback marker: `{ _stub_fallback: true }`
- `output_trust = "stubbed"` is set on all stub traces
- Refuses if no traces exist on original run
- Returns `stub_details[]` with per-trace mapping:
  - `original_name`, `original_kind`, `replay_trace_id`, `stubbed`, `fallback_used`

### Side Effects Strategy

- `stub` mode: **zero side effects** — no external calls whatsoever
- `live` mode: tool governance still applies (kill switch, risk, sandbox)
- Tools with `requires_sandbox=true` are blocked in both modes
- Tools with `risk_level=critical` require `risk_accepted`

### What Cannot Be Replayed

- Runs in non-terminal status (pending, running)
- Runs without determinable model configuration (live mode)
- Stub mode without original traces

## Workflow Execution

### Step Types

| Type | Behavior |
|------|----------|
| `chat` | LLM call using step's assigned agent |
| `tool_call` | HTTP call to tool referenced in `config.tool_id` |
| `condition` | Evaluate field against value, optionally branch |
| `loop` | Iterate over array, apply agent to each item |
| `transform` | Data transformation (extract_field, to_json, to_string, merge) |

### Context Flow

```
input → step_1.output → step_2.output → ... → final output
```

Each step receives `ctx.current` (previous step's output) and can read `ctx.steps` (all previous outputs) and `ctx.input` (original workflow input).

### Workflow Versioning

- `POST /api/workflows/{id}/publish` snapshots the current steps and config
- Creates an immutable `workflow_versions` row (steps_snapshot + config_snapshot)
- Sets `workflows.active_version_id` and increments `workflows.version`
- At execution time: if `active_version_id` exists, steps are loaded from the snapshot
- Fallback: if no published version, live `workflow_steps` are used directly
- Replay uses the exact `workflow_version_id` from the original run

### Workflow Run Recording

Each workflow execution creates:
1. A `runs` record (kind="workflow", workflow_version_id=...)
2. Per-step `traces` records (with output_trust)
3. A legacy `workflow_runs` record (for backwards compatibility — to deprecate)

## Prompt Guards

### Pre-Check (at prompt load)

`validatePromptArtifact()` verifies:
- Artifact exists in DB
- Content is non-empty
- Returns validation result with slug, version, content_hash

### Post-Check (after LLM output)

`checkOutputBasicGuards()` checks:
- Output is non-empty
- Output < 500k chars (runaway detection)

### Output Trust Levels

| Level | Meaning |
|-------|---------|
| `verified` | Output validated by external check |
| `tool_backed` | Output derived from tool data |
| `unverified` | Raw LLM output, no validation |
| `guard_failed` | Failed post-check or guard |
| `stubbed` | Replay stub, not a real execution |

Trust is stored per-trace in `traces.output_trust`.
