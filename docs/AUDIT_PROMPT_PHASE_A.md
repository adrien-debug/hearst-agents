# Prompt d'Audit — Phase A : Connector Router

## Mission

Auditer l'implémentation du **Connector Router** (Phase A) qui établit le routing Pack-first avec fallback Nango pour les connecteurs.

---

## Fichiers créés/modifiés

| Fichier | Description | Lignes |
|---------|-------------|--------|
| `lib/connectors/router.ts` | **Nouveau** — Router principal avec routing Pack → Nango → Legacy | 406 |
| `lib/engine/runtime/delegate/connectors.ts` | **Nouveau** — Wrappers legacy pour appels via Router | 80 |
| `lib/engine/runtime/delegate/api.ts` | Modifié — Intégration wrappers Router | 180 |
| `lib/engine/runtime/engine/index.ts` | Modifié — Getters exposés (db, runId, userId) pour Router | 278 |
| `app/api/test/connector/route.ts` | Modifié — Phase A status endpoint | 50 |

---

## Architecture à valider

```
┌─────────────────────────────────────────────────────────────────┐
│                        Connector Router                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Input: { provider, action, input, credentials }               │
│                           │                                     │
│                           ▼                                     │
│              ┌──────────────────────┐                          │
│              │  1. Check Router     │                          │
│              │     Routing Table    │                          │
│              └──────────┬───────────┘                          │
│                         │                                       │
│              ┌──────────┴───────────┐                          │
│              │                      │                          │
│      ┌───────▼──────┐      ┌────────▼────────┐                │
│      │ Pack-first   │      │ Nango fallback   │                │
│      │ (Stripe...)  │      │ (OAuth providers)│                │
│      └───────┬──────┘      └────────┬────────┘                │
│              │                      │                          │
│              ▼                      ▼                          │
│      ┌───────────────┐    ┌─────────────────┐                │
│      │ executeStripe │    │ executeNango    │                │
│      │ Operation     │    │ Operation       │                │
│      └───────────────┘    └─────────────────┘                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Points de contrôle obligatoires

### 1. Routing Table

**Critère**: Chaque connecteur doit avoir une source définie.

| Source | Connecteurs | Validation |
|--------|-------------|------------|
| `pack` | stripe | Schema validé, manifest OK |
| `nango` | gmail, slack, github, notion, jira, gitlab, discord, asana, trello, linear, hubspot | Fallback correct |

**Code à vérifier**:
```typescript
// lib/connectors/router.ts L56-72
const ROUTING_TABLE: Record<string, { source: "pack" | "nango" | "legacy"; packId?: string; connectorId?: string }>
```

### 2. Pack-first Execution (Stripe)

**Critère**: Les opérations Stripe doivent passer par le finance-pack natif.

**Opérations supportées**:
- `getCustomers` → `services/api.ts:getCustomers()`
- `getCharges` → `services/api.ts:getCharges()`
- `getInvoices` → `services/api.ts:getInvoices()`
- `getSubscriptions` → `services/api.ts:getSubscriptions()`
- `getBalance` → `services/api.ts:getBalance()`
- `health` → Validation credentials + ping

**Code à vérifier**:
```typescript
// lib/connectors/router.ts L168-206
async function executeStripeOperation(...)
```

### 3. Nango Fallback

**Critère**: Si Pack échoue ou n'existe pas, fallback vers Nango.

**Validation**:
- Mapping action → endpoint Nango correct
- Paramètres transformés correctement
- Erreurs propagées avec `via: "nango"`

**Code à vérifier**:
```typescript
// lib/connectors/router.ts L262-307
async function executeNangoOperation(...)
```

### 4. Type Safety

**Critère**: Tous les types doivent être valides.

**Vérifications**:
```bash
npm run build  # Doit compiler sans erreur
npx tsc --noEmit  # Pas d'erreur type
```

### 5. Tests

**Critère**: Tous les tests existants doivent passer.

```bash
npm test -- --run  # 404 passed | 6 skipped attendu
```

---

## Checklist audit

### Code Quality

- [ ] Pas de `console.log` en dehors de gestion d'erreurs
- [ ] Pas de types `any` implicites
- [ ] JSDoc sur fonctions publiques
- [ ] Nommage cohérent (camelCase, verbes d'action)

### Error Handling

- [ ] Tous les chemins d'erreur retournent `ConnectorResult` cohérent
- [ ] Messages d'erreur sans données sensibles
- [ ] Logging structuré sur erreurs

### Architecture

- [ ] Router exposé via barrel export `lib/connectors/router.ts`
- [ ] Pas de dépendance circulaire engine ↔ router
- [ ] Getters RunEngine fonctionnent correctement

### Sécurité

- [ ] Credentials jamais loggés
- [ ] Credentials passés via headers (pas query params)
- [ ] Pas de hardcoded secrets

---

## Commandes de validation

```bash
# Build
cd /Users/adrienbeyondcrypto/Dev/hearst-os && npm run build

# Tests
cd /Users/adrienbeyondcrypto/Dev/hearst-os && npm test -- --run

# Lint
cd /Users/adrienbeyondcrypto/Dev/hearst-os && npm run lint 2>/dev/null || echo "No lint script"

# Type check
cd /Users/adrienbeyondcrypto/Dev/hearst-os && npx tsc --noEmit
```

---

## Critères de succès

| Critère | Attendu | Statut |
|---------|---------|--------|
| Build | ✅ 0 erreur | ⬜ |
| Tests | 404 passed | ⬜ |
| Router exposé | `routeConnectorRequest` exporté | ⬜ |
| Stats exposées | `getRouterStats` fonctionnel | ⬜ |
| Health checks | `checkConnectorHealth` pour Pack + Nango | ⬜ |

---

## Prochaine étape après audit

**Phase B — Finance Agent Stripe** :
- Créer `agents/finance/stripe/` avec Agent spécialisé
- Brancher Router au Runtime via `delegate/api.ts`
- Test E2E end-to-end (chat → Agent → Router → Stripe → Focal)

---

## Informations commit

```
Commit: 4f3f48b
Date: 2026-04-25
Auteur: Agent Phase A
Message: feat(connector): Phase A — Connector Router (Pack-first routing)
```
