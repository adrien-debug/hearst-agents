# Hearst Agents v1.0.0

Plateforme d'orchestration d'agents IA. Création, exécution, observation, évaluation, replay, décision.

## Stack

- **Frontend** : Next.js 16 (App Router), React 19, Tailwind CSS, Geist
- **Backend** : Next.js API Routes, Zod validation, domain layer typé
- **Database** : Supabase (PostgreSQL), types auto-générés, pgvector
- **LLM** : Multi-provider (OpenAI, Anthropic), smart routing, fallback chain, cost tracking
- **Runtime** : Trace-first, lifecycle canonique, tool governance, replay (live/stub), cost sentinel, prompt guards, output validation
- **Intelligence** : Failure classification, tool/model scoring, drift detection, feedback signals
- **Décisions** : Tool/model selection, fallback intelligent, change tracking, operator surface
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

# 4. Types (optionnel — régénérer depuis Supabase)
npx supabase gen types typescript --project-id <ref> > lib/database.types.ts

# 5. Dev
npm run dev  # http://localhost:9000

# 6. Tests
npm test     # 200 tests
```

## Architecture

```
lib/
├── database.types.ts        # Types auto-générés Supabase
├── supabase-server.ts       # Client serveur typé
├── domain/
│   ├── schemas.ts           # Validation Zod
│   ├── types.ts             # Types métier
│   ├── api-helpers.ts       # ok/err/parseBody/dbErr
│   └── slugify.ts
├── runtime/
│   ├── lifecycle.ts         # Statuses, transitions, erreurs typées, timeout, retry
│   ├── tracer.ts            # RunTracer: runs + traces + output validation auto
│   ├── tool-executor.ts     # HTTP tool execution + gouvernance complète
│   ├── workflow-engine.ts   # Versioned execution + smart tool/model selection
│   ├── memory-governor.ts   # TTL, dedup, max_entries, importance
│   ├── replay.ts            # Replay live/stub multi-step + comparaison
│   ├── cost-sentinel.ts     # Budget enforcement par run
│   ├── prompt-guard.ts      # Guards avancés + policies par agent
│   └── output-validator.ts  # Classification + trust scoring
├── integrations/
│   ├── adapter.ts           # IntegrationAdapter interface
│   ├── http-adapter.ts      # HTTP fetch (read-only)
│   ├── notion-adapter.ts    # Notion API (read-only)
│   ├── executor.ts          # Safe execution: tracer + retry + timeout + health
│   └── index.ts
├── analytics/
│   ├── failure-classifier.ts # 10 catégories d'échec déterministes
│   ├── metrics.ts            # Métriques tools + agents
│   ├── tool-ranking.ts       # Score, classement, drift detection
│   ├── feedback.ts           # Signaux d'amélioration
│   └── index.ts
├── decisions/
│   ├── tool-selector.ts      # Sélection par goal
│   ├── model-selector.ts     # Model scoring + goal-based selection
│   ├── smart-executor.ts     # Exécution avec fallback auto
│   ├── signal-manager.ts     # Lifecycle des improvement signals
│   ├── guard-advisor.ts      # Suggestion de guard_policy
│   ├── change-tracker.ts     # Audit trail: avant/après
│   └── index.ts
└── llm/
    ├── types.ts             # LLMProvider, ModelProfileConfig
    ├── router.ts            # Provider routing + smartChat/smartStreamChat
    ├── openai.ts
    └── anthropic.ts
```

## API Routes

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/health` | GET | Health check (public) |
| `/api/agents` | GET/POST | Liste/création d'agents |
| `/api/agents/[id]` | GET/PUT/DELETE | CRUD agent |
| `/api/agents/[id]/chat` | POST | Chat streaming SSE tracé (opt-in smart routing) |
| `/api/agents/[id]/memory` | GET/POST | Mémoire agent |
| `/api/agents/[id]/memory/govern` | POST | Appliquer politique mémoire |
| `/api/agents/[id]/evaluate` | POST | Évaluation avec run tracé |
| `/api/agents/[id]/versions` | GET | Historique des versions |
| `/api/runs` | GET | Liste des runs (filtrable) |
| `/api/runs/[id]` | GET | Détail run + traces |
| `/api/runs/[id]/replay` | POST | Replay live/stub + comparaison |
| `/api/prompts` | GET/POST | Prompt artifact registry |
| `/api/prompts/[slug]` | GET | Versions d'un prompt |
| `/api/skills` | GET/POST | Catalogue skills |
| `/api/tools` | GET/POST | Catalogue tools |
| `/api/conversations` | GET/POST | Conversations |
| `/api/conversations/[id]/messages` | GET | Messages |
| `/api/workflows` | GET/POST | Workflows |
| `/api/workflows/[id]/run` | POST | Exécuter un workflow |
| `/api/workflows/[id]/publish` | POST | Publier version workflow |
| `/api/model-profiles` | GET/POST | Profils modèle |
| `/api/memory-policies` | GET/POST | Politiques mémoire |
| `/api/datasets` | GET/POST | Jeux de tests |
| `/api/datasets/[id]/entries` | GET/POST | Entrées dataset |
| `/api/datasets/[id]/evaluate` | POST | Batch eval |
| `/api/integrations` | GET/POST | Connexions + adapters |
| `/api/integrations/[id]/execute` | POST | Exécuter action (read-only) |
| `/api/integrations/[id]/health` | POST | Health check |
| `/api/analytics/tools` | GET | Métriques + ranking tools |
| `/api/analytics/agents` | GET | Métriques agents |
| `/api/analytics/models` | GET | Scoring + sélection modèles |
| `/api/analytics/generate` | POST | Générer improvement signals |
| `/api/signals` | GET | Liste signals (filtrable) |
| `/api/signals/[id]/resolve` | POST | Apply/dismiss/acknowledge + change tracking |
| `/api/changes` | GET | Audit trail des changements |
| `/api/cron/daily-report` | GET/POST | Cron daily report (auth CRON_SECRET, idempotent) |
| `/api/cron/market-watch` | GET/POST | Cron market watch (auth CRON_SECRET, idempotent) |
| `/api/reports` | GET | Liste des rapports quotidiens (filtre type, status) |
| `/api/reports/today` | GET | Statut du rapport du jour + dernier succès |
| `/api/reports/health` | GET | Health dashboard (streak, taux 14j, dernier échec) |

## Auth

API key via `HEARST_API_KEY`. Toutes les routes (sauf `/api/health`) sont protégées quand la variable est définie.

```bash
curl -H "x-api-key: YOUR_KEY" http://localhost:9000/api/agents
```

## Database (30 tables, 10 migrations)

**Core** : agents, agent_versions, skills, skill_versions, tools, agent_skills, agent_tools
**Prompts** : prompt_artifacts (versioned, checksummed)
**Knowledge** : knowledge_bases, knowledge_documents, agent_knowledge
**Runtime** : runs, traces
**Conversations** : conversations, messages
**Observability** : evaluations, datasets, dataset_entries
**Configuration** : model_profiles, memory_policies
**Workflows** : workflows, workflow_steps, workflow_versions
**Memory** : agent_memory
**Integrations** : integration_connections
**Decisions** : improvement_signals, applied_changes
**Reports** : daily_reports (registry produit, idempotent)
**Legacy** : usage_logs, workflow_runs

## Runtime

```
pending → running → completed | failed | cancelled | timeout
```

Chaque run produit des traces granulaires : `llm_call`, `tool_call`, `memory_read`, `memory_write`, `condition_eval`, `custom`.

### Cost Sentinel
Budget par run, auto-injecté depuis `agents.cost_budget_per_run`. Warning à 80%, hard stop à 100%.

### Output Validation
Classification (`valid`/`invalid`/`suspect`), trust scoring, guards composables (JSON, taille, regex, blacklist). Branché dans le tracer — automatique pour chaque LLM call.

### Tool Governance
`kill_switch`, `risk_level`, `retry_policy`, `rate_limit`, `requires_sandbox`, per-agent overrides via `agent_tools`.

### Replay
Live (re-exécution réelle) ou stub (zero cost, outputs originaux). Config figée : agent_version, model_profile, prompt_artifact, workflow_version.

## Smart Routing (opt-in)

### Tool Selection
```bash
# Workflow avec smart tool fallback
POST /api/workflows/{id}/run
{ "input": {...}, "smart_tool_selection": true }
```

### Model Selection
```bash
# Chat avec smart model routing
POST /api/agents/{id}/chat
{ "message": "...", "smart_routing": true, "model_goal": "reliability" }
```

Goals : `reliability` | `speed` | `cost` | `balanced`

Chaque décision est tracée : `model_selection` (score, reason, was_overridden), `model_fallback` (erreur source, fallback_to). Le modèle original de l'agent est toujours en dernier recours.

## Operator Surface

- **`/signals`** : console de signaux filtrable (priorité, status, type), acknowledge/apply/dismiss
- **`/changes`** : audit trail des décisions appliquées, diff avant/après

## Tests

```bash
npm test  # 200 tests, 17 fichiers
```

Couverture : lifecycle, cost sentinel, prompt guards, output validator, tracer integration, adapters, executor, failure classifier, tool ranking, feedback, tool selector, signal manager, model selector, change tracker, smart router, 6 scénarios end-to-end.

### Scénarios end-to-end

| Scénario | Vérifie |
|----------|---------|
| Tool failure + fallback | Détection, classification, fallback tracé, signal généré |
| Cost limit hard stop | Warning 80%, COST_LIMIT_EXCEEDED, classification critical |
| Guard failure strict | Blacklist + taille, trust guard_failed, no crash |
| Model routing + fallback | Sélection, was_overridden, traces decision + fallback |
| Full workflow E2E | Multi-step, cost accumulation, stub replay zero cost |
| Drift detection | success_rate drop, latency spike, signal tool_replacement |

## Report Capabilities (Cron Production)

Infrastructure partagée (`lib/runtime/report-runner.ts`) pour toutes les capabilities de reporting.

### Reports actifs

| Report | Type | Cron | Endpoint | Env var |
|--------|------|------|----------|---------|
| Daily Crypto Report | `crypto_daily` | 7h UTC | `/api/cron/daily-report` | `DAILY_REPORT_WORKFLOW_ID` |
| Market Watch Report | `market_watch` | 8h UTC | `/api/cron/market-watch` | `MARKET_WATCH_WORKFLOW_ID` |

### Déclenchement

Vercel cron appelle `GET /api/cron/{type}` chaque jour.
Chaque report a son workflow dédié et son `report_type` dans le registry partagé `daily_reports`.

### Authentification

**Obligatoire.** Tout appel sans `CRON_SECRET` est rejeté (401).
Si `CRON_SECRET` n'est pas configuré, toutes les requêtes sont rejetées.

```bash
# Lancement cron (Vercel/Railway)
curl -X GET https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET"
```

Variables requises : `CRON_SECRET`, `DAILY_REPORT_WORKFLOW_ID`.
Variable optionnelle : `ALERT_WEBHOOK_URL` (Discord/Slack webhook pour alertes échec).

### Idempotence

Un seul rapport `completed` par date UTC + type (index unique conditionnel).

| Situation | Comportement |
|-----------|-------------|
| Aucun rapport pour la date | Exécution normale |
| Rapport `completed` | Skip → `already_ran` |
| Rapport `running` | Skip |
| Rapport `failed` | Retry automatique |
| Rapport `completed` + `force: true` | Force rerun |

Chaque décision est enregistrée dans `idempotency_decision`.

### Relance manuelle opérateur

```bash
# Relancer le rapport du jour (retry si failed, skip si completed)
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"triggered_by": "manual", "reason": "Relance après fix CoinGecko"}'

# Relancer pour une date spécifique
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-04-17", "triggered_by": "manual", "reason": "Rapport manqué"}'

# Forcer un rerun même si completed
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "triggered_by": "manual", "reason": "Données corrigées"}'
```

### Registry (`daily_reports`)

Chaque rapport est un **objet produit** séparé du run technique :

| Champ | Description |
|-------|-------------|
| `report_date` | Date UTC du rapport |
| `report_type` | `crypto_daily` |
| `run_id` | Lien vers le run source |
| `status` | `pending` / `running` / `completed` / `failed` |
| `content_markdown` | Rapport complet |
| `summary` | Résumé 500 chars |
| `highlights` | Points clés (JSON array) |
| `error_message` | Cause d'échec / raison rerun |
| `triggered_by` | `cron` / `manual` |
| `idempotency_decision` | `run` / `retry` / `skip` |

### Alerting

En cas d'échec :
1. Log structuré `[cron/daily-report] [ALERT]` avec report_id, run_id, date, cause
2. Webhook POST vers `ALERT_WEBHOOK_URL` si configuré (auto-détecte Discord vs Slack)

### Visibilité opérateur

| Endpoint | Description |
|----------|-------------|
| `GET /api/reports` | Liste paginée (filtre `type`, `status`) |
| `GET /api/reports/today` | Statut du rapport du jour + dernier succès |
| `GET /api/reports/health` | Dashboard santé (streak, taux 14j, dernier échec) |
| `/reports` | Console opérateur (UI avec health dashboard) |

### Investigation d'un échec

| Étape | Action |
|-------|--------|
| 1 | `GET /api/reports/today` → voir `status` et `error_message` |
| 2 | `GET /api/reports/health` → streak cassé ? taux en baisse ? |
| 3 | `GET /api/runs/{run_id}` → traces complètes (tool calls, LLM, erreurs) |
| 4 | Logs Railway/Vercel → chercher `[cron/daily-report]` |
| 5 | Relancer → `POST /api/cron/daily-report` avec auth + reason |

### Vérification rapide de l'état

```bash
# Daily Crypto — rapport du jour
curl -s https://hearst-agents-production.up.railway.app/api/reports/today?type=crypto_daily \
  -H "x-api-key: $HEARST_API_KEY" | jq '{exists, status: .report.status}'

# Market Watch — rapport du jour
curl -s https://hearst-agents-production.up.railway.app/api/reports/today?type=market_watch \
  -H "x-api-key: $HEARST_API_KEY" | jq '{exists, status: .report.status}'

# Santé d'un type de report
curl -s https://hearst-agents-production.up.railway.app/api/reports/health?type=market_watch \
  -H "x-api-key: $HEARST_API_KEY" | jq '{today: .today.status, streak: .streak_consecutive_success, rate: .recent_14d.success_rate}'

# Relance manuelle Market Watch
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/market-watch \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"triggered_by": "manual", "reason": "Test initial"}'
```

### Ajouter un nouveau type de report

1. Créer un agent dédié (via API ou UI)
2. Créer un workflow avec les tools nécessaires + collect + template + chat
3. Créer un endpoint cron dans `app/api/cron/{name}/route.ts` avec `ReportConfig`
4. Ajouter le cron dans `vercel.json`
5. Configurer `{NAME}_WORKFLOW_ID` sur Railway/Vercel
6. Le registry, l'idempotence, l'alerting et la surface opérateur sont automatiques

## Deploy

```bash
# Vercel
vercel --prod

# Docker / Railway
docker build -t hearst-agents .
docker run -p 9000:3000 --env-file .env.local hearst-agents
```

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur dev (port 9000) |
| `npm run build` | Build production |
| `npm start` | Serveur production |
| `npm run lint` | ESLint |
| `npm test` | Tests (vitest) |
| `npm run test:watch` | Tests en watch mode |
