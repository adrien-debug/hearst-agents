# Database & Migrations — Hearst Managed Agents

## Database: Supabase (PostgreSQL)

- **Instance**: Supabase hosted PostgreSQL
- **Extensions**: `pgvector` (for embeddings)
- **Auth**: Service role key (bypasses RLS) for API routes
- **RLS**: Enabled on all tables, authenticated users get full CRUD

## Migration Files

| File | Purpose |
|------|---------|
| `0001_agents.sql` | Minimal agents table (superseded by 0002) |
| `0002_full_schema.sql` | 16-table core schema, indexes, RLS, triggers |
| `0003_runtime_observability.sql` | model_profiles, runs, traces, memory_policies, datasets, skill_versions |
| `0004_core_governance.sql` | prompt_artifacts, tool governance, run lifecycle fields |
| `0005_workflow_versioning_cost_guards.sql` | workflow_versions, cost sentinel, replay_mode, output_trust |
| `0018_model_profiles_composer_gemini.sql` | Seed `model_profiles` : chaîne Composer 2 → Gemini 3 Flash |

### `model_profiles` — providers Composer / Gemini

Après `supabase db push`, deux lignes seed (si pas déjà présentes, `ON CONFLICT DO NOTHING` sur `name`) :

| `name` | `id` (fixe) | `provider` | `model` | `fallback_profile_id` |
|--------|-------------|------------|---------|------------------------|
| `gemini_3_flash_leaf` | `a1e2f3a4-b5c6-4789-a012-000000000002` | `gemini` | `gemini-3-flash-preview` | `null` |
| `composer_2_with_gemini_fallback` | `a1e2f3a4-b5c6-4789-a012-000000000001` | `composer` | `cursor-composer-2` | → UUID feuille Gemini ci-dessus |

**Usage applicatif** : côté serveur, `chatWithProfile(supabase, "a1e2f3a4-b5c6-4789-a012-000000000001", messages)` résout la chaîne via `fallback_profile_id` et appelle `getProvider("composer")` puis `getProvider("gemini")` en cas d’échec. Les clés API ne sont **pas** en base : uniquement dans l’environnement d’exécution (voir `README.md` section LLM et `.env.example`).

**Momentum (hors DB)** : pas de table dédiée ; l’UI « momentum » consomme `useRightPanel` + SSE `RunStreamProvider` (voir `README.md`).

## Table Inventory (26 tables)

### Core
| Table | PK | Key Fields |
|-------|-----|-----------|
| `agents` | uuid | slug (unique), status, version, model_profile_id, memory_policy_id, active_version_id |
| `skills` | uuid | slug (unique), category, active_version |
| `tools` | uuid | slug (unique), risk_level, kill_switch, enabled, retry_policy, rate_limit |
| `agent_skills` | (agent_id, skill_id) | priority, config |
| `agent_tools` | (agent_id, tool_id) | enabled, timeout_override_ms, max_calls_per_run, risk_accepted |

### Versioning
| Table | PK | Key Fields |
|-------|-----|-----------|
| `agent_versions` | uuid | (agent_id, version) unique, system_prompt, config_snapshot, model_profile_id |
| `skill_versions` | uuid | (skill_id, version) unique, prompt_template |
| `prompt_artifacts` | uuid | (slug, version) unique, kind, scope, content, content_hash, parent_id |
| `workflow_versions` | uuid | (workflow_id, version) unique, steps_snapshot, config_snapshot |

### Runtime
| Table | PK | Key Fields |
|-------|-----|-----------|
| `runs` | uuid | kind, status, trigger, agent_version_id, workflow_version_id, prompt_artifact_id, replay_of_run_id, replay_mode, cost_budget_usd, timeout_ms |
| `traces` | uuid | run_id (FK), kind (enum), status, output_trust, step_index, tokens, cost, latency |

### Conversations
| Table | PK | Key Fields |
|-------|-----|-----------|
| `conversations` | uuid | agent_id (FK), status |
| `messages` | uuid | conversation_id (FK), role, content |

### Memory
| Table | PK | Key Fields |
|-------|-----|-----------|
| `agent_memory` | uuid | agent_id (FK), memory_type, key, value, importance, expires_at |
| `memory_policies` | uuid | name (unique), max_entries, ttl_seconds, dedup_strategy |

### Knowledge (RAG)
| Table | PK | Key Fields |
|-------|-----|-----------|
| `knowledge_bases` | uuid | embedding_model, chunk_size |
| `knowledge_documents` | uuid | knowledge_base_id (FK), embedding (vector) |
| `agent_knowledge` | (agent_id, knowledge_base_id) | M2M link |

### Orchestration
| Table | PK | Key Fields |
|-------|-----|-----------|
| `workflows` | uuid | trigger_type, status, version, active_version_id |
| `workflow_steps` | uuid | workflow_id (FK), step_order, action_type, agent_id |
| `workflow_versions` | uuid | workflow_id (FK), version, steps_snapshot, config_snapshot |
| `workflow_runs` | uuid | workflow_id (FK), status (**legacy — to deprecate**) |

### Evaluation
| Table | PK | Key Fields |
|-------|-----|-----------|
| `datasets` | uuid | name, agent_id |
| `dataset_entries` | uuid | dataset_id (FK), input, expected_output, tags |
| `evaluations` | uuid | agent_id (FK), eval_type, score, run_id, dataset_entry_id |

### Configuration
| Table | PK | Key Fields |
|-------|-----|-----------|
| `model_profiles` | uuid | name (unique), provider, model, fallback_profile_id, cost_per_1k_in/out |

### Legacy
| Table | PK | Notes |
|-------|-----|-------|
| `usage_logs` | uuid | Superseded by `runs` + `traces`. Keep for migration compatibility. |
| `workflow_runs` | uuid | Superseded by `runs` (kind=workflow) + `workflow_version_id`. |

## Enums (PostgreSQL)

- `run_kind`: chat, workflow, evaluation, tool_test
- `run_status`: pending, running, completed, failed, cancelled, timeout
- `trace_kind`: llm_call, tool_call, memory_read, memory_write, skill_invoke, condition_eval, error, guard, custom

## Key Indexes

All foreign keys are indexed. Additional indexes:
- `idx_agents_status`, `idx_agents_slug`
- `idx_runs_agent`, `idx_runs_kind`, `idx_runs_status`, `idx_runs_created`, `idx_runs_parent`, `idx_runs_replay`
- `idx_traces_run`, `idx_traces_kind`
- `idx_prompt_artifacts_slug`, `idx_prompt_artifacts_kind`, `idx_prompt_artifacts_scope`
- `idx_workflow_versions_workflow`

## Type Generation

After any migration:
```bash
npx supabase gen types typescript --project-id <id> > lib/database.types.ts
```

## Migration Strategy

1. Migrations are additive — never drop columns in production
2. New columns use `add column if not exists` for idempotency
3. Constraint changes use `drop constraint if exists` + re-add
4. Always test migration against a staging project first
