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

### Architecture d'exécution

| Rôle | Responsable | Notes |
|------|-------------|-------|
| Runtime + Cron | **Railway** | Source unique d'exécution des reports |
| Frontend / UI | **Vercel** | Console opérateur et API lecture |

**Railway est le cron owner.** Pas de crons définis dans `vercel.json`.
Un seul runtime exécute les workflows pour éviter doublons et fragmentation.

### Reports actifs

| Report | Type | Cron Railway | Endpoint | Env var | Mode |
|--------|------|-------------|----------|---------|------|
| Daily Crypto Report | `crypto_daily` | 7h UTC | `/api/cron/daily-report` | `DAILY_REPORT_WORKFLOW_ID` | Scheduled |
| Market Watch Report | `market_watch` | 8h UTC | `/api/cron/market-watch` | `MARKET_WATCH_WORKFLOW_ID` | Scheduled |
| Market Alert | `market_alert` | `*/4h` UTC | `/api/cron/market-alert` | `MARKET_ALERT_WORKFLOW_ID` | Conditional |

### Authentification

**Obligatoire.** Tout appel sans `CRON_SECRET` est rejeté (401).

```bash
curl -X GET https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET"
```

Variables requises : `CRON_SECRET`, `DAILY_REPORT_WORKFLOW_ID`, `MARKET_WATCH_WORKFLOW_ID`, `MARKET_ALERT_WORKFLOW_ID`.
Variable optionnelle : `ALERT_WEBHOOK_URL` (Discord/Slack webhook pour alertes échec).

### Idempotence (reports programmés)

Un seul rapport `completed` par date UTC + type (index unique conditionnel sur `daily_reports`).
S'applique à `crypto_daily` et `market_watch`.

| Situation | Comportement |
|-----------|-------------|
| Aucun rapport pour la date | Exécution normale |
| Rapport `completed` | Skip (`already_ran`) |
| Rapport `running` | Skip |
| Rapport `failed` | Retry automatique |
| Rapport `completed` + `force: true` | Force rerun |

### Relance manuelle

```bash
# Retry du jour
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"triggered_by": "manual", "reason": "Relance après fix"}'

# Date spécifique
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/market-watch \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-04-17", "triggered_by": "manual", "reason": "Rapport manqué"}'

# Force rerun
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/daily-report \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "triggered_by": "manual", "reason": "Données corrigées"}'
```

### Market Alert — Exécution conditionnelle

Le Market Alert est différent des reports programmés :
- **Fréquence** : toutes les 4h (6x/jour)
- **Conditionnel** : ne produit un rapport que si des signaux significatifs sont détectés
- **Cooldown** : 8h entre deux reports `completed` (pas de spam)
- **No signal** : si rien de notable → `status = skipped`, `idempotency_decision = no_signal`

#### Signal types

| Signal | Condition déclenchante | Sévérité |
|--------|----------------------|----------|
| `flash_move` | Variation 24h > ±10% sur un top-50 coin | `critical` |
| `volume_spike` | Volume exchange significativement au-dessus de la normale | `warning` |
| `new_trending` | Coin trending qui n'apparaissait pas récemment | `info` |
| `defi_stress` | Variation TVL DeFi > ±8% en 24h | `warning` |

#### Sévérité

Déterminée par les signaux détectés, pas par le LLM :
- `critical` : `flash_move` présent
- `warning` : `defi_stress` ou `volume_spike` présent
- `info` : `new_trending` uniquement

#### Cooldown

- Fenêtre de 8h : pas de nouveau report `completed` ou `running` dans la fenêtre
- Si un report a été produit il y a < 8h → `cooldown_blocked`
- `force: true` permet de bypasser le cooldown

#### Test manuel

```bash
# Déclencher un scan
curl -X GET https://hearst-agents-production.up.railway.app/api/cron/market-alert \
  -H "Authorization: Bearer $CRON_SECRET"

# Force rerun (bypass cooldown)
curl -X POST https://hearst-agents-production.up.railway.app/api/cron/market-alert \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "triggered_by": "manual", "reason": "Test signal detection"}'
```

#### Webhook

L'alerting webhook est envoyé **uniquement quand un signal réel est détecté** (report `completed`).
Aucune notification pour `no_signal` ou `cooldown_blocked`.
Le message inclut la sévérité et les signal types détectés.

### Registry (`daily_reports`)

Chaque rapport est un **objet produit** séparé du run technique :

| Champ | Description |
|-------|-------------|
| `report_date` | Date UTC du rapport |
| `report_type` | `crypto_daily` / `market_watch` / `market_alert` |
| `run_id` | Lien vers le run source |
| `status` | `pending` / `running` / `completed` / `failed` / `skipped` |
| `content_markdown` | Rapport complet (null si `skipped`) |
| `summary` | Résumé (préfixé `[SEVERITY]` pour alertes) |
| `highlights` | Points clés + métadonnées (`severity: X`, `signal_types: Y`) |
| `error_message` | Cause d'échec / raison rerun |
| `triggered_by` | `cron` / `manual` |
| `idempotency_decision` | `run` / `retry` / `skip` / `no_signal` / `cooldown_passed` |

### Alerting

**Échecs** : Log structuré `[cron/{type}] [ALERT]` + webhook si configuré.
**Alertes marché** : Webhook avec sévérité + signaux détectés (uniquement si signal réel).
Aucune notification pour `no_signal`.

### Visibilité opérateur

| Endpoint | Description |
|----------|-------------|
| `GET /api/reports?type=X` | Liste paginée (filtre `type`, `status`) |
| `GET /api/reports/today?type=X` | Statut du jour + dernier succès |
| `GET /api/reports/health?type=X` | Dashboard santé (streak, taux 14j, dernier échec) |
| `/reports` | Console opérateur (health multi-type, filtre, détails) |

### Investigation d'un échec

| Étape | Action |
|-------|--------|
| 1 | `GET /api/reports/today?type=X` → `status` + `error_message` |
| 2 | `GET /api/reports/health?type=X` → streak cassé ? taux en baisse ? |
| 3 | `GET /api/runs/{run_id}` → traces (tool calls, LLM, erreurs) |
| 4 | Logs Railway → chercher `[cron/{type}]` |
| 5 | Relancer → `POST /api/cron/{name}` avec auth + reason |

### Ajouter un nouveau type de report (spec canonique)

Toute nouvelle capability doit suivre ce pattern exact. Un 3e report est **un fichier de ~30 lignes**.

**Prérequis obligatoires** :

| Élément | Obligatoire | Fourni par |
|---------|:-----------:|------------|
| Agent dédié (system prompt spécifique) | Oui | Créer via `/api/agents` |
| Workflow (tools → collect → template → chat) | Oui | Créer via `/api/workflows` + steps Supabase |
| Endpoint cron `app/api/cron/{name}/route.ts` | Oui | ~30 lignes, wrapper `report-runner.ts` |
| `ReportConfig` dans l'endpoint | Oui | `reportType`, `label`, `workflowIdEnvVar`, `workflowNamePattern`, `missionLabel` |
| Env var `{NAME}_WORKFLOW_ID` sur Railway | Oui | Dashboard Railway |
| Entrée dans le README (table "Reports actifs") | Oui | Manuel |

**Ce qui est automatique** (hérité de `report-runner.ts`) :
- Auth cron (`CRON_SECRET`)
- Idempotence quotidienne (registry `daily_reports`)
- Alerting webhook
- Report extraction (content, summary, highlights)
- Visibilité opérateur (APIs + UI `/reports`)

**Checklist de validation** :

1. `GET /api/cron/{name}` avec auth → `completed`
2. 2e appel → `already_ran` (idempotence)
3. `GET /api/reports/today?type={type}` → rapport visible
4. `GET /api/reports/health?type={type}` → streak = 1
5. UI `/reports` → rapport visible avec badge type + détails

**Template endpoint cron** :

```typescript
import { NextRequest } from "next/server";
import { err } from "@/lib/domain";
import { authenticateCron, runReport, parseCronBody, type ReportConfig } from "@/lib/runtime/report-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONFIG: ReportConfig = {
  reportType: "your_type",
  label: "Your Report Label",
  workflowIdEnvVar: "YOUR_TYPE_WORKFLOW_ID",
  workflowNamePattern: "your%pattern",
  missionLabel: "Your Mission Label",
};

export async function GET(req: NextRequest) {
  const auth = authenticateCron(req.headers.get("authorization"), `cron/${CONFIG.reportType}`, req.headers.get("x-forwarded-for") ?? "unknown");
  if (!auth.ok) return err(auth.reason, 401);
  return runReport(CONFIG, "cron");
}

export async function POST(req: NextRequest) {
  const auth = authenticateCron(req.headers.get("authorization"), `cron/${CONFIG.reportType}`, req.headers.get("x-forwarded-for") ?? "unknown");
  if (!auth.ok) return err(auth.reason, 401);
  let body: unknown = null;
  try { body = await req.json(); } catch { /* ok */ }
  const p = body ? parseCronBody(body) : { triggeredBy: "manual", forceRerun: false };
  return runReport(CONFIG, p.triggeredBy, p.dateOverride, p.rerunReason, p.forceRerun);
}
```

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
