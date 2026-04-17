# Hearst Agents

Plateforme d'orchestration d'agents IA. Création, exécution, observation, évaluation, replay.

## Stack

- **Frontend** : Next.js 16 (App Router), React 19, Tailwind CSS, Geist
- **Backend** : Next.js API Routes, Zod validation, domain layer typé
- **Database** : Supabase (PostgreSQL), types auto-générés, pgvector
- **LLM** : Multi-provider (OpenAI, Anthropic), fallback chain, cost tracking
- **Runtime** : Trace-first execution, canonical lifecycle, tool governance, replay (live/stub), cost sentinel, prompt guards
- **Deploy** : Vercel (frontend + API), Railway (Docker), standalone output

## Setup

```bash
# 1. Install
npm install

# 2. Config
cp .env.example .env.local
# Remplir : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY

# 3. Database
npx supabase db push

# 4. Types
npx supabase gen types typescript --project-id <ref> > lib/database.types.ts

# 5. Dev
npm run dev  # http://localhost:9000
```

## Architecture

```
lib/
├── database.types.ts      # Types auto-générés Supabase
├── supabase-server.ts     # Client serveur typé
├── domain/
│   ├── schemas.ts         # Validation Zod (agents, skills, tools, chat, workflows...)
│   ├── types.ts           # Types métier exportés
│   ├── api-helpers.ts     # ok/err/parseBody/dbErr
│   └── slugify.ts
├── runtime/
│   ├── lifecycle.ts       # Statuses, transitions, erreurs typées, timeout, retry
│   ├── tracer.ts          # RunTracer: runs + traces avec lifecycle
│   ├── tool-executor.ts   # HTTP tool execution + gouvernance complète
│   ├── workflow-engine.ts # Versioned execution, condition/loop/tool/transform
│   ├── memory-governor.ts # TTL, dedup, max_entries, importance
│   ├── replay.ts          # Replay live/stub multi-step + comparaison
│   ├── cost-sentinel.ts   # Budget enforcement par run (auto-injecté)
│   ├── prompt-guard.ts    # Validation prompt + guards avancés + policies
│   └── output-validator.ts# Classification output + trust scoring (auto-branché dans tracer)
├── integrations/
│   ├── adapter.ts         # IntegrationAdapter interface + types
│   ├── http-adapter.ts    # HTTP fetch (read-only GET)
│   ├── notion-adapter.ts  # Notion API read page (read-only)
│   ├── executor.ts        # Safe execution: tracer + retry + timeout + health
│   └── index.ts           # Barrel exports
├── analytics/
│   ├── failure-classifier.ts # Catégorisation déterministe des échecs (10 catégories)
│   ├── metrics.ts          # Métriques tools + agents (succès, latence, coût, fréquence)
│   ├── tool-ranking.ts     # Score, classement, détection instabilité, drift
│   ├── feedback.ts         # Signaux d'amélioration (agents, tools, policies)
│   └── index.ts
├── decisions/
│   ├── tool-selector.ts    # Sélection déterministe par goal (reliability/speed/cost/balanced)
│   ├── model-selector.ts   # Model routing: scoring, goal-based selection, fallback
│   ├── smart-executor.ts   # Exécution avec fallback automatique
│   ├── signal-manager.ts   # Persistence, dedup, lifecycle des improvement signals
│   ├── guard-advisor.ts    # Suggestion de guard_policy basée sur analytics
│   ├── change-tracker.ts   # Audit trail: avant/après, acteur, signal source
│   └── index.ts
└── llm/
    ├── types.ts           # LLMProvider interface, ModelProfileConfig
    ├── router.ts          # Provider routing, fallback chain, cost tracking
    ├── openai.ts
    └── anthropic.ts
```

## Documentation fondatrice

| Document | Contenu |
|----------|---------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture, structure, principes |
| [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) | Entités, relations, invariants |
| [`docs/DB_AND_MIGRATIONS.md`](docs/DB_AND_MIGRATIONS.md) | Tables, migrations, types, indexes |
| [`docs/AGENT_GOVERNANCE.md`](docs/AGENT_GOVERNANCE.md) | Gouvernance tools, agents, prompts, mémoire |
| [`docs/RUNTIME_AND_REPLAY.md`](docs/RUNTIME_AND_REPLAY.md) | Lifecycle, replay, timeout, retry, events |

## API Routes

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check (public) |
| `/api/agents` | GET/POST | Liste/création d'agents |
| `/api/agents/[id]` | GET/PUT/DELETE | CRUD agent |
| `/api/agents/[id]/chat` | POST | Chat streaming SSE tracé |
| `/api/agents/[id]/memory` | GET/POST | Mémoire agent |
| `/api/agents/[id]/memory/govern` | POST | Appliquer la politique mémoire |
| `/api/agents/[id]/evaluate` | POST | Évaluation avec run tracé |
| `/api/agents/[id]/versions` | GET | Historique des versions |
| `/api/runs` | GET | Liste des runs (filtrable) |
| `/api/runs/[id]` | GET | Détail run + traces |
| `/api/runs/[id]/replay` | POST | Replay live/stub + comparaison |
| `/api/prompts` | GET/POST | Prompt artifact registry |
| `/api/prompts/[slug]` | GET | Versions d'un prompt (par slug) |
| `/api/skills` | GET/POST | Catalogue skills |
| `/api/tools` | GET/POST | Catalogue tools |
| `/api/conversations` | GET/POST | Conversations |
| `/api/conversations/[id]/messages` | GET | Messages |
| `/api/workflows` | GET/POST | Workflows |
| `/api/workflows/[id]/run` | POST | Exécuter un workflow (versionné) |
| `/api/workflows/[id]/publish` | POST | Publier une version de workflow |
| `/api/model-profiles` | GET/POST | Profils modèle |
| `/api/memory-policies` | GET/POST | Politiques mémoire |
| `/api/datasets` | GET/POST | Jeux de tests |
| `/api/datasets/[id]/entries` | GET/POST | Entrées d'un dataset |
| `/api/datasets/[id]/evaluate` | POST | Batch eval sur dataset |

## Auth

Toutes les routes API (sauf `/api/health`) sont protégées par API key si `HEARST_API_KEY` est défini.

```bash
curl -H "x-api-key: YOUR_KEY" http://localhost:9000/api/agents
```

## Integrations

Architecture tool-first : chaque intégration externe est un tool traçable, replayable, avec governance complète.

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/integrations` | GET | Liste connexions + adapters disponibles |
| `/api/integrations` | POST | Créer une connexion |
| `/api/integrations/[id]/execute` | POST | Exécuter une action (read-only) |
| `/api/integrations/[id]/health` | POST | Health check connexion |

**Phase 1 (read-only)** :
- `http.fetch` — GET HTTP arbitraire, réponse tronquée à 100k chars
- `notion.read_page` — lecture page Notion + blocs enfants

**Safety** : tracer intégré, retry, timeout, rate limit, credentials jamais exposés, read-only enforced.

## Database (29 tables)

**Core** : agents, agent_versions, skills, skill_versions, tools, agent_skills, agent_tools
**Prompts** : prompt_artifacts (versioned, checksummed)
**Knowledge** : knowledge_bases, knowledge_documents, agent_knowledge
**Runtime** : runs (cost_budget, replay_mode, workflow_version_id), traces (output_trust)
**Conversations** : conversations, messages
**Observability** : evaluations, datasets, dataset_entries
**Configuration** : model_profiles, memory_policies
**Workflows** : workflows, workflow_steps, workflow_versions
**Memory** : agent_memory
**Integrations** : integration_connections (provider, auth, health, scopes)
**Decisions** : improvement_signals (kind, priority, status, lifecycle), applied_changes (audit trail)
**Legacy** : usage_logs, workflow_runs (à déprécier)

## Runtime Lifecycle

```
pending → running → completed | failed | cancelled | timeout
```

Transitions vérifiées par `assertRunTransition()`. Erreurs typées via `RuntimeError`.

## Tool Governance

- `kill_switch` : blocage immédiat
- `risk_level` : low | medium | high | critical
- `retry_policy` : max_retries, backoff, multiplier
- `rate_limit` : par minute, par run
- `requires_sandbox` : exécution sandbox requise
- Per-agent overrides via `agent_tools`

## Replay (Live / Stub)

```bash
# Live replay — re-execute against real provider
curl -X POST -H "x-api-key: KEY" -d '{"mode":"live"}' http://localhost:9000/api/runs/{run_id}/replay

# Stub replay — zero cost, uses original trace outputs
curl -X POST -H "x-api-key: KEY" -d '{"mode":"stub"}' http://localhost:9000/api/runs/{run_id}/replay
```

Config figée : agent_version, model_profile, prompt_artifact, workflow_version. Comparaison automatique tokens/coût/latence.

## Cost Sentinel

Budget par run (`cost_budget_usd`), auto-injecté depuis `agents.cost_budget_per_run`. Vérification après chaque trace. `cost:warning` à 80%, `COST_LIMIT_EXCEEDED` à 100%.

## Output Validation

Classification : `valid` | `invalid` | `suspect`. Guards composables par agent : JSON, taille, regex, blacklist. Trust score 0-1.
Branché directement dans `RunTracer.trace()` — tout output LLM est validé automatiquement, `output_trust` persisté en DB.

## Analytics & Intelligence

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/analytics/tools` | GET | Métriques, scores, ranking, feedback tools |
| `/api/analytics/agents` | GET | Métriques agents, signaux d'amélioration |

**Failure Classification** : 10 catégories (`tool_failure`, `timeout`, `cost_exceeded`, `guard_failure`, `invalid_output`, `provider_error`, `rate_limited`, `auth_error`, `network_error`, `unknown`). Sévérité + retryable flag.

**Tool Ranking** : score composite (success 50%, latency 20%, cost 15%, volume 15%), fiabilité (`stable`/`degraded`/`unstable`/`unknown`), détection de drift.

**Feedback Loop** : signaux structurés par type (`agent_config`, `prompt_tuning`, `guard_policy`, `tool_replacement`, `cost_optimization`, `reliability_alert`), priorité, suggestion actionnable.

## Decision Layer

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/signals` | GET | Liste improvement signals (filtrable status/kind/target/priority) |
| `/api/signals/[id]/resolve` | POST | Apply, dismiss ou acknowledge un signal (+ change tracking) |
| `/api/analytics/generate` | POST | Génère et persiste les signals depuis les métriques récentes |
| `/api/analytics/models` | GET | Scoring, ranking et sélection de modèles |
| `/api/changes` | GET | Historique des changements appliqués (audit trail) |

**Tool Selection** : sélection par goal (`reliability`, `speed`, `cost`, `balanced`), fallback chain automatique, exclusion tools instables. Branché dans le workflow engine (`smart_tool_selection: true`).

**Model Selection** : scoring déterministe (success 45%, latency 25%, cost 20%, volume 10%), goal-based selection, fallback chain. Branché opt-in dans chat (`smart_routing: true`) et workflow (`smart_model_routing: true`).

**Smart Executor** : `executeToolWithFallback()` — tente le meilleur tool, puis descend la fallback chain. Tout tracé.

**Improvement Signals** : lifecycle `open → acknowledged → applied | dismissed | expired`. Déduplication automatique.

**Applied Change Tracking** : chaque décision appliquée est tracée (signal source, avant/après, acteur, timestamp, cible). Table `applied_changes`.

**Guard Advisor** : analyse les traces LLM, suggère des ajustements de `guard_policy`. Validation manuelle obligatoire. Change tracking automatique.

## Operator Surface

- **`/signals`** : console de signaux filtrable (priorité, status, type), acknowledge/apply/dismiss, vue détaillée suggestion + data
- **`/changes`** : historique des changements appliqués, filtrable par type, diff avant/après

## Guard Policy Persistence

Colonne `guard_policy jsonb` sur `agents`. Chargée au démarrage du run, appliquée automatiquement à chaque trace LLM. Versionnable avec les agents.

## Tests

```bash
npm test  # 194 tests — lifecycle, cost sentinel, prompt guards, output validator, tracer integration, adapters, executor, failure classifier, tool ranking, feedback, tool selector, signal manager, model selector, change tracker, smart router, runtime scenarios (6 end-to-end)
```

## Deploy

```bash
# Vercel
vercel --prod

# Docker / Railway
docker build -t hearst-agents .
docker run -p 9000:3000 --env-file .env.local hearst-agents
```
