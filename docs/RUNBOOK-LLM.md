# Runbook LLM — Hearst OS

Ce runbook documente les procédures d'incident pour la stack LLM (Anthropic, OpenAI, Gemini, Cursor Composer). Il s'adresse à l'opérateur on-call ou au développeur qui débogue un comportement anormal en prod ou en local.

> **Source de vérité** : les modules `lib/llm/*` ([circuit-breaker](../lib/llm/circuit-breaker.ts), [rate-limiter](../lib/llm/rate-limiter.ts), [router](../lib/llm/router.ts), [metrics](../lib/llm/metrics.ts), [timeout](../lib/llm/timeout.ts)). Si ce doc diverge du code, le code gagne.

---

## 1. Tableau de bord live

Endpoint protégé NextAuth (RBAC `settings:read`) :

```bash
curl -H "Cookie: next-auth.session-token=..." \
  https://<host>/api/admin/llm-metrics
```

Retour : snapshot JSON avec, par provider :

- `latency.p50 / p95 / p99` (rolling window 100 derniers calls)
- `cost.totalUsd` cumulé depuis le démarrage du process
- `tokens.cacheHitRate` (Anthropic)
- `errorRate` + `errorsByCode`
- Compteurs globaux : `circuitBreakerTrips`, `rateLimitHits`, `toolLoopsDetected`

Les métriques sont **process-local** (pas de Redis ni DB). Reset au reload Next.js. Pour observabilité long-terme, brancher OTel/Datadog en plus.

---

## 2. Diagnostiquer un circuit breaker OPEN

### Symptômes

- Logs : `Circuit open for <provider>, skipping`
- Réponse client : fallback chain épuisée → `All providers in fallback chain failed`
- Snapshot `/api/admin/llm-metrics` : `counters.circuitBreakerTrips` augmente

### Logique du breaker

Voir [`lib/llm/circuit-breaker.ts`](../lib/llm/circuit-breaker.ts) :

| État | Transition |
|------|-----------|
| `CLOSED` → `OPEN` | 5 échecs consécutifs (`failureThreshold = 5`) |
| `OPEN` → `HALF_OPEN` | 60 s écoulées (`resetWindowMs = 60_000`) |
| `HALF_OPEN` → `CLOSED` | 1 succès |
| `HALF_OPEN` → `OPEN` | 1 échec → re-OPEN immédiat |

### Logs à chercher

```bash
# Heroku / Vercel / docker logs
grep -E "Circuit open|Provider .* failed" logs.txt
grep "circuit_breaker_trip" logs.txt
```

### Forcer un reset

Le breaker se reset automatiquement après 60 s. Pour reset immédiat :

1. **Reload du process Next.js** (le plus simple — état en mémoire)
   ```bash
   # Local
   pkill -f "next dev" && npm run dev

   # Vercel : redéployer
   ```

2. **Reset programmatique** (si endpoint custom dédié) — non exposé pour l'instant. Si nécessaire ajouter un POST `/api/admin/llm-metrics/reset-circuit` derrière `requireAdmin`.

### Cause racine probable

| Trip provider | Investigation |
|---------------|---------------|
| `anthropic` | Vérifier statut `https://status.anthropic.com`, valider `ANTHROPIC_API_KEY`, regarder `errorsByCode` (429 = rate limit côté Anthropic, 529 = surcharge globale) |
| `openai` | Statut `https://status.openai.com`, key valide, quota mensuel atteint ? |
| `gemini` | Statut `https://status.cloud.google.com`, quotas Google AI Studio |
| `composer` | Valider `COMPOSER_API_KEY` + `COMPOSER_API_BASE_URL` |

Si tous les fallbacks claquent → vérifier connectivité réseau outbound, DNS, proxy d'entreprise.

---

## 3. Diagnostiquer un rate limit

### Symptômes

- Réponse client : `RateLimitExceededError` avec `code: RATE_LIMIT_EXCEEDED`
- Logs : message `Rate limit exceeded for user <id>: calls per minute` (ou `tokens per hour`)
- Snapshot : `counters.rateLimitHits` augmente

### Limites par défaut

Voir [`lib/llm/rate-limiter.ts`](../lib/llm/rate-limiter.ts) :

| Var | Défaut | Description |
|-----|--------|-------------|
| `LLM_RATE_LIMIT_RPM` | 60 | Calls par minute par user |
| `LLM_RATE_LIMIT_TPH` | 1 000 000 | Tokens par heure par user |
| `LLM_RATE_LIMIT_MAX_USERS` | 10 000 | Cap mémoire (LRU) |

### Cleanup

- **Auto** : toutes les 60 s — purge des users avec `lastActivity > 2h` ET 0 timestamp/token actifs ; purge des users avec `createdAt > 24h` (TTL absolu)
- **LRU** : si `userStates.size >= MAX_USERS`, le user `lastActivity` le plus ancien est évincé (log `[RateLimiter] LRU evicted user X`)
- **Manuel** : reload du process Next.js (état in-memory)

### Ajustement temporaire

```bash
# .env.local — relâcher la limite RPM pendant un load test
LLM_RATE_LIMIT_RPM=120
LLM_RATE_LIMIT_TPH=2000000
```

> Ces vars sont lues au load du module. Reload nécessaire après modification.

### Si un user spécifique sature

Soit il fait du fan-out légitime (recheck `userId` propagation dans `chatWithProfile` / `smartChat`), soit il y a une boucle qui n'est pas attrapée par la détection tool-loop. Voir section 5.

---

## 4. Ajuster les timeouts

### Vars

Voir [`lib/llm/timeout.ts`](../lib/llm/timeout.ts) :

| Var | Défaut | Usage |
|-----|--------|-------|
| `LLM_CHAT_TIMEOUT_MS` | 30 000 | `provider.chat()` (one-shot) |
| `LLM_STREAM_TIMEOUT_MS` | 60 000 | `provider.streamChat()` |

L'override par call passe par `ChatRequest.timeoutMs` ou `SmartChatOptions.timeoutMs`.

### Quand augmenter

- Snapshot `/api/admin/llm-metrics` : p95 latency > 80 % du timeout
- Logs : `LLMTimeoutError` avec `provider != "unknown"` répétés
- Workload : génération longue (rapport complet, JSON volumineux)

Recommandé : `timeoutMs = p99 * 1.5`. Si p99 dérape (> 60 s sur chat one-shot), c'est probablement un signe que la requête est trop grosse — split avant de gonfler le timeout.

### Quand baisser

- Pour le chat interactif (UX) : 15 000 ms suffit en général. Au-delà l'utilisateur abandonne.
- Pour des tool-calls determinist en background : 10 000 ms. Le timeout court force des fallbacks rapides.

---

## 5. Lire les logs cache metrics Anthropic

Voir [`lib/llm/anthropic.ts`](../lib/llm/anthropic.ts) — log émis quand `cache_read_tokens > 0` ou `cache_creation_tokens > 0` :

```
[Anthropic] Cache metrics - read: 4521, created: 0, model: claude-sonnet-4-20250514
```

### Interprétation

| Cas | Signification |
|-----|---------------|
| `read > 0, created = 0` | Cache hit — économies ~90 % sur les input tokens lus |
| `read = 0, created > 0` | Cache write — premier appel sur ce prefix, le suivant doit hit |
| `read = 0, created = 0` | Pas de cache — soit prompt < 1024 tokens (Sonnet/Haiku) ou < 2048 (Opus), soit `cache_control` non posé |
| `read > 0, created > 0` | Cache partiel hit + extension du prefix |

### Cache hit rate global

Snapshot `/api/admin/llm-metrics` → `providers[anthropic].tokens.cacheHitRate`.

Cible : > 0.5 sur les flows long-context (rapports, agents) pour amortir le coût de cache creation. Si < 0.2, vérifier que le system prompt est stable entre les turns (pas de timestamp variable, pas de userId dans le prefix avant le `cache_control`).

---

## 6. Procédure de rollback (nouveau provider casse)

Si un déploiement ajoute un provider (ou change un model) et fait flamber le taux d'erreur :

### Étape 1 — Confirmer la régression

```bash
curl /api/admin/llm-metrics | jq '.providers[] | {provider, errorRate, errorsByCode}'
```

Comparer avec snapshot pré-déploiement (capturer en routine via cron / monitoring externe).

### Étape 2 — Désactiver le provider en runtime

Le routing passe par `model_profiles` (DB). Pour désactiver sans redéployer :

```sql
UPDATE model_profiles
SET fallback_profile_id = '<safe-profile-id>'
WHERE provider = '<broken-provider>';
```

Ou plus radical :

```sql
DELETE FROM model_profiles WHERE provider = '<broken-provider>';
```

> Attention : si une mission scheduled référence ce profile, elle plantera à `loadFallbackChain`. Préférer le `UPDATE` qui réoriente.

### Étape 3 — Rollback Git si feature défectueuse

```bash
git revert <commit-sha>
git push origin main
# Vercel/Heroku redéploie auto
```

### Étape 4 — Vérifier post-rollback

- `/api/admin/llm-metrics` : `errorRate` redescendu sous 0.05
- Aucun trip de circuit breaker dans les 10 minutes suivantes
- Reload du process pour purger l'état du circuit breaker (sinon il reste OPEN 60 s)

---

## 7. Référence — Variables d'environnement LLM

| Var | Défaut | Recommandé prod | Effet |
|-----|--------|-----------------|-------|
| `ANTHROPIC_API_KEY` | — | requis | Auth Anthropic |
| `OPENAI_API_KEY` | — | requis | Auth OpenAI |
| `GEMINI_API_KEY` | — | optionnel | Auth Google AI |
| `COMPOSER_API_KEY` | — | optionnel | Auth Cursor Composer |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com` | défaut | Override host Google |
| `COMPOSER_API_BASE_URL` | `https://api.cursor.com/v1` | défaut | Override host Cursor |
| `COMPOSER_AUTH_MODE` | `bearer` | `bearer` | `bearer` ou `basic` |
| `LLM_CHAT_TIMEOUT_MS` | 30 000 | 30 000 | Timeout chat one-shot |
| `LLM_STREAM_TIMEOUT_MS` | 60 000 | 60 000 | Timeout streaming |
| `LLM_RATE_LIMIT_RPM` | 60 | 60–120 | Calls/min/user |
| `LLM_RATE_LIMIT_TPH` | 1 000 000 | 1M–5M | Tokens/heure/user |
| `LLM_RATE_LIMIT_MAX_USERS` | 10 000 | 10 000 | Cap LRU mémoire |
| `MEMORY_BUFFER_MAX_CONVERSATIONS` | 1000 | 1000 | LRU cache conversations |
| `MEMORY_BUFFER_MAX_STRUCTURED` | 500 | 500 | LRU cache structuré |

### Seuils internes (constantes — non env-overridable)

| Constante | Valeur | Fichier |
|-----------|--------|---------|
| `failureThreshold` (circuit breaker) | 5 | `lib/llm/circuit-breaker.ts` |
| `resetWindowMs` (circuit breaker) | 60 000 | `lib/llm/circuit-breaker.ts` |
| `cleanupIntervalMs` (rate limiter) | 60 000 | `lib/llm/rate-limiter.ts` |
| `MAX_USER_TTL_MS` (rate limiter) | 24 h | `lib/llm/rate-limiter.ts` |
| `LOOP_WARNING_THRESHOLD` | 2 | `lib/engine/orchestrator/ai-pipeline.ts` |
| `LOOP_ABORT_THRESHOLD` | 3 | `lib/engine/orchestrator/ai-pipeline.ts` |
| `MAX_STREAMING_TOKENS` | 10 000 | `lib/engine/orchestrator/ai-pipeline.ts` |
| `LATENCY_WINDOW_SIZE` (metrics) | 100 | `lib/llm/metrics.ts` |

Si une de ces constantes doit devenir env-overridable, ouvrir un ticket — le passage par env doit toujours respecter `Number(process.env.X ?? "<default>")` pour éviter les NaN silencieux.

---

## 8. Tests de régression

À lancer avant tout merge qui touche `lib/llm/*` ou l'orchestrator :

```bash
npm test          # vitest — 950+ tests dont les LLM/metrics
npm run lint      # eslint + lint-visual
```

Les tests dédiés stabilité :

- `__tests__/llm/circuit-breaker.test.ts`
- `__tests__/llm/rate-limiter.test.ts`
- `__tests__/llm/timeout.test.ts`
- `__tests__/llm/errors.test.ts`
- `lib/llm/__tests__/metrics.test.ts`

---

**Dernière mise à jour** : 2026-04-30
