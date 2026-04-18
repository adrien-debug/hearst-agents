# Reports Platform — Spec canonique

Ce document formalise le pattern "Reports Platform" de Hearst Agents.
Toute nouvelle capability report doit suivre cette spec.

## Capabilities actives

| Report | `report_type` | Mode | Fréquence | Endpoint |
|--------|--------------|------|-----------|----------|
| Daily Crypto Report | `crypto_daily` | Scheduled | 1x/jour 7h UTC | `/api/cron/daily-report` |
| Market Watch Report | `market_watch` | Scheduled | 1x/jour 8h UTC | `/api/cron/market-watch` |
| Market Alert | `market_alert` | Conditional | 6x/jour */4h UTC | `/api/cron/market-alert` |

## Modes d'exécution

### Scheduled

Rapport généré systématiquement à chaque run.
Idempotence : 1 `completed` par date UTC + type.

### Conditional

Rapport généré **uniquement** si des signaux sont détectés.
Si rien de notable : `status = skipped`, `idempotency_decision = no_signal`.
Idempotence via cooldown : fenêtre glissante en heures (pas 1/jour).

## Architecture

```
┌─────────────────────────────────────────────┐
│  Cron endpoint (app/api/cron/{name})        │
│  ~30 lignes : CONFIG + GET/POST             │
├─────────────────────────────────────────────┤
│  report-runner.ts                           │
│  authenticateCron → idempotency/cooldown    │
│  → executeWorkflow → extractReport          │
│  → NO_SIGNAL check → severity parse         │
│  → registry update → alerting               │
├─────────────────────────────────────────────┤
│  daily_reports (registry)                   │
│  1 table partagée, filtrage par report_type │
├─────────────────────────────────────────────┤
│  Operator surface                           │
│  /reports UI + /api/reports/* APIs           │
└─────────────────────────────────────────────┘
```

## `report-runner.ts` — Rôle

Module partagé qui encapsule **toute** la logique opérationnelle :

| Fonction | Rôle |
|----------|------|
| `authenticateCron` | Auth `CRON_SECRET`, rejet 401 |
| `checkIdempotency` | 1 completed/jour/type (scheduled) |
| `checkCooldown` | Fenêtre glissante (conditional) |
| `runReport` | Runner principal : idempotence → workflow → extract → registry → alert |
| `extractReport` | Parse output → content, summary, highlights |
| `parseAlertMeta` | Parse `SIGNAL_TYPES: [...]` → severity |
| `determineSeverity` | Mapping déterministe signal → severity |
| `sendAlert` | Webhook Discord/Slack pour échecs |
| `parseCronBody` | Parse body POST (date, reason, force) |

## `ReportConfig`

```typescript
interface ReportConfig {
  reportType: string;           // ex: "crypto_daily"
  label: string;                // ex: "Daily Crypto Report"
  workflowIdEnvVar: string;     // ex: "DAILY_REPORT_WORKFLOW_ID"
  workflowNamePattern: string;  // ex: "daily%report" (fallback ilike)
  missionLabel: string;         // Passé au workflow comme context
  conditionalExecution?: boolean; // true → support NO_SIGNAL
  cooldownHours?: number;       // Fenêtre cooldown (remplace idempotence daily)
}
```

## Convention `NO_SIGNAL`

Quand `conditionalExecution = true` :

1. Le workflow s'exécute normalement (tools + agent)
2. Si l'agent output contient la string `NO_SIGNAL` :
   - `status = "skipped"`
   - `idempotency_decision = "no_signal"`
   - `content_markdown = null`
   - Aucun webhook envoyé
3. Si l'agent output ne contient **pas** `NO_SIGNAL` :
   - Extraction des signaux via `SIGNAL_TYPES: [flash_move, ...]`
   - Sévérité déterminée par `determineSeverity()` (pas le LLM)
   - `status = "completed"` avec metadata enrichies
   - Webhook envoyé avec sévérité

## Signal taxonomy (Market Alert)

| Signal | Sévérité | Condition |
|--------|----------|-----------|
| `flash_move` | `critical` | Variation 24h > ±10% top-50 |
| `volume_spike` | `warning` | Volume exchange anormalement élevé |
| `defi_stress` | `warning` | TVL DeFi > ±8% en 24h |
| `new_trending` | `info` | Nouveau coin trending |

Hiérarchie : `critical` > `warning` > `info`. Le plus haut signal gagne.

## Cooldown

Pour les reports conditionnels (`cooldownHours` défini) :

- Requête les reports `completed` ou `running` du même type dans la fenêtre
- Si bloqué → response `cooldown_blocked`, aucun workflow exécuté
- `force: true` bypass le cooldown

## Registry (`daily_reports`)

Table unique partagée par toutes les capabilities.

| Champ | Valeurs |
|-------|---------|
| `status` | `pending`, `running`, `completed`, `failed`, `skipped` |
| `idempotency_decision` | `run`, `retry`, `skip`, `no_signal`, `cooldown_passed` |
| `report_type` | `crypto_daily`, `market_watch`, `market_alert` |

## Alerting

| Situation | Webhook | Log |
|-----------|---------|-----|
| Workflow failed | Oui (si configuré) | `[cron/{type}] [ALERT]` |
| Signal réel détecté | Oui (avec sévérité) | `[cron/{type}] completed` |
| No signal | Non | `[cron/{type}] no_signal` |
| Cooldown blocked | Non | `[cron/{type}] cooldown:blocked` |
| Already ran | Non | `[cron/{type}] idempotency:skip` |

## Ajouter un nouveau report

### Prérequis

1. **Agent** dédié avec system prompt spécifique → `/api/agents`
2. **Workflow** : tools → collect → template → chat → `/api/workflows` + steps
3. **Endpoint cron** : `app/api/cron/{name}/route.ts` (~30 lignes)
4. **Env var** : `{NAME}_WORKFLOW_ID` sur Railway
5. **README** : entrée dans la table "Reports actifs"
6. **UI** : ajouter dans `REPORT_TYPES` et `TYPE_STYLE` de `app/reports/page.tsx`

### Template endpoint

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
  // conditionalExecution: true,  // si event-driven
  // cooldownHours: 8,            // si cooldown
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

### Checklist de validation

- [ ] `GET /api/cron/{name}` avec auth → `completed` ou `no_signal`
- [ ] 2e appel → `already_ran` ou `cooldown_blocked`
- [ ] `GET /api/reports/today?type={type}` → rapport visible
- [ ] `GET /api/reports/health?type={type}` → streak incrémenté
- [ ] UI `/reports` → rapport avec badge type + détails

### Automatique (hérité de `report-runner.ts`)

- Auth cron
- Idempotence / cooldown
- Registry `daily_reports`
- Extraction (content, summary, highlights)
- Alerting webhook
- UI `/reports` + APIs opérateur

## Execution owner

**Railway = cron owner.** Pas de crons dans `vercel.json`.
Vercel = frontend et API lecture uniquement.

## Env vars requises (Railway)

| Variable | Obligatoire | Description |
|----------|:-----------:|-------------|
| `CRON_SECRET` | Oui | Auth Bearer pour tous les crons |
| `DAILY_REPORT_WORKFLOW_ID` | Oui | UUID workflow crypto_daily |
| `MARKET_WATCH_WORKFLOW_ID` | Oui | UUID workflow market_watch |
| `MARKET_ALERT_WORKFLOW_ID` | Oui | UUID workflow market_alert |
| `ALERT_WEBHOOK_URL` | Non | Discord/Slack webhook (échecs + alertes) |
