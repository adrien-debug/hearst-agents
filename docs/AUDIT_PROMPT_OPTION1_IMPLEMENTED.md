# Prompt d'Audit — Option 1 Implémentée (Stubs → Réels)

**Date** : 25/04/2026  
**Scope** : Tous les stubs transformés en implémentations réelles  
**Auditeur** : Agent externe / humain  

---

## 🎯 OBJECTIF DE L'AUDIT

Vérifier que les 11 stubs précédemment identifiés ont été correctement implémentés avec :
1. **Logique métier** fonctionnelle (pas juste console.log)
2. **Gestion d'erreurs** appropriée
3. **Intégration Supabase** correcte (tables, RLS)
4. **Types TypeScript** stricts
5. **Patterns** alignés avec Architecture Finale

---

## 📁 FICHIERS À AUDITER (11 fichiers)

### 1. Admin Layer (5 fichiers)

#### `lib/admin/settings.ts`
**À vérifier** :
- [ ] Fonctions CRUD : `getSystemSettings`, `getSystemSetting`, `createSystemSetting`, `updateSystemSetting`, `deleteSystemSetting`
- [ ] `getEffectiveSetting` avec fallback tenant → global
- [ ] `upsertSystemSetting` fonctionne correctement
- [ ] Parsing JSON valeur dans `parseValue`
- [ ] Helpers feature flags : `getFeatureFlags`, `isFeatureEnabled`
- [ ] Mapping DB row → interface correct

**Validation** :
```bash
# Vérifier imports
grep -n "supabase" lib/admin/settings.ts

# Vérifier types exports
grep -n "export type\|export interface" lib/admin/settings.ts

# Vérifier gestion erreurs
grep -n "throw new Error\|console.error" lib/admin/settings.ts
```

**Table DB** : `system_settings` (migration 0020_system_settings.sql)

---

#### `lib/admin/permissions.ts`
**À vérifier** :
- [ ] 4 rôles définis : admin, editor, viewer, guest
- [ ] Matrice permissions `PERMISSION_MATRIX` cohérente
- [ ] `checkPermission` avec Supabase
- [ ] `getUserRole` fallback (tenant → global)
- [ ] `assignRole` pour tenant + global
- [ ] `requirePermission` throws `PermissionDeniedError`
- [ ] Héritage rôles : `hasHigherOrEqualRole`

**Validation** :
```bash
# Vérifier matrice
grep -A 20 "PERMISSION_MATRIX" lib/admin/permissions.ts

# Vérifier error class
grep -A 5 "class PermissionDeniedError" lib/admin/permissions.ts
```

**Note** : Table `user_roles` n'existe pas encore en DB (vérifier si nécessaire).

---

#### `lib/admin/audit.ts`
**À vérifier** :
- [ ] Enum `AuditAction` complet (20+ actions)
- [ ] `logAdminAction` insert avec toutes métadonnées
- [ ] `getAuditLogs` avec filtres (user, action, resource, date, severity)
- [ ] Pagination : limit/offset
- [ ] `exportAuditLogs` format CSV correct
- [ ] `getAuditStats` agrégations
- [ ] `createAuditLogger` factory avec contexte

**Validation** :
```bash
# Vérifier actions
grep -A 25 "export type AuditAction" lib/admin/audit.ts

# Vérifier CSV export
grep -A 10 "escapeCsv" lib/admin/audit.ts
```

**Table DB** : `audit_logs` (à créer si inexistante)

---

#### `lib/admin/connectors.ts` (déjà stub, vérifier complétude)
**À vérifier** :
- [ ] CRUD connector configs
- [ ] Types `ConnectorConfig`

---

#### `lib/admin/health.ts` (déjà stub, vérifier complétude)
**À vérifier** :
- [ ] Checks : database, storage, connectors, llm
- [ ] Latency tracking

---

### 2. Assets Cache (1 fichier)

#### `lib/engine/runtime/assets/cache/redis.ts`
**À vérifier** :
- [ ] Lazy initialization ioredis (dynamic import)
- [ ] Fallback si Redis indisponible (pas de crash)
- [ ] Opérations : get, set, delete, mget, mset
- [ ] Counters : increment, decrement
- [ ] Pattern delete (`deletePattern`)
- [ ] TTL : expire, ttl
- [ ] Health check avec latence
- [ ] Stats : keyCount, memoryUsage
- [ ] Singleton global : `getGlobalRedisCache`
- [ ] Config from env : `createRedisCacheFromEnv`

**Validation** :
```bash
# Vérifier dynamic import
grep -n "await import" lib/engine/runtime/assets/cache/redis.ts

# Vérifier env vars
grep -n "process.env.REDIS" lib/engine/runtime/assets/cache/redis.ts
```

**Note** : ioredis est optional dependency (pas dans package.json actuel).

---

### 3. Assets Cleanup (2 fichiers)

#### `lib/engine/runtime/assets/cleanup/worker.ts`
**À vérifier** :
- [ ] `runAssetCleanup` avec StorageProvider injecté
- [ ] `CleanupConfig` complet (ttl, archive, dryRun, batchSize)
- [ ] `findExpiredAssets` query Supabase correcte
- [ ] `deleteAsset` : storage puis DB (ordre idempotent)
- [ ] `findOrphanedFiles` (stub acceptable)
- [ ] `cleanupTenantAssets` scopé
- [ ] `getCleanupStats` par âge (24h, 7d, 30d, older)
- [ ] `CleanupResult` tracking par tenant

**Validation** :
```bash
# Vérifier table assets
grep -n "from(\"assets\")" lib/engine/runtime/assets/cleanup/worker.ts

# Vérifier dryRun
grep -n "dryRun" lib/engine/runtime/assets/cleanup/worker.ts
```

---

#### `lib/engine/runtime/assets/cleanup/scheduler.ts`
**À vérifier** :
- [ ] Intégration avec `worker.ts` (StorageProvider requis)
- [ ] `runNow` appelle `runAssetCleanup` avec config
- [ ] Cron expression (stub acceptable)

**Validation** :
```bash
# Vérifier import worker
grep -n "runAssetCleanup" lib/engine/runtime/assets/cleanup/scheduler.ts
```

---

### 4. Assets API (3 fichiers)

#### `lib/engine/runtime/assets/api/download.ts`
**À vérifier** :
- [ ] `generateDownloadUrl` avec vérification asset + permissions
- [ ] `verifyAssetAccess` query Supabase
- [ ] `storage.getSignedUrl` appel correct (signature : key, "read", options)
- [ ] Content-Disposition : attachment vs inline
- [ ] `generateBatchDownloadUrls` batch
- [ ] `logDownloadAccess` intégration audit
- [ ] `DownloadError` custom avec statusCode
- [ ] `refreshDownloadUrl` si expiration proche
- [ ] MIME type detection from filename

**Validation** :
```bash
# Vérifier storage call
grep -n "getSignedUrl" lib/engine/runtime/assets/api/download.ts

# Vérifier audit integration
grep -n "createAuditLogger\|logAdminAction" lib/engine/runtime/assets/api/download.ts
```

---

#### `lib/engine/runtime/assets/api/list.ts` (vérifier implémentation vs stub)
**À vérifier** :
- [ ] Pagination limit/offset
- [ ] Filtres : type, runId, tenantId
- [ ] Total count

---

#### `lib/engine/runtime/assets/api/upload.ts` (vérifier implémentation vs stub)
**À vérifier** :
- [ ] `initiateUpload` avec presigned URL
- [ ] Multipart support

---

## 🔧 COMMANDES DE VALIDATION

### Build & Tests
```bash
# Build TypeScript
cd /Users/adrienbeyondcrypto/Dev/hearst-os
npx next build

# Tests
npx vitest run --reporter=verbose

# Type checking strict
npx tsc --noEmit --strict 2>&1 | head -30
```

### Linting & Quality
```bash
# ESLint
npx eslint lib/admin/ lib/engine/runtime/assets/cache/ lib/engine/runtime/assets/cleanup/ lib/engine/runtime/assets/api/ --ext .ts

# Circular deps
npx madge --circular lib/admin/index.ts
npx madge --circular lib/engine/runtime/assets/cache/index.ts
```

### Inspection Manuelle
```bash
# Lignes de code par fichier
wc -l lib/admin/*.ts lib/engine/runtime/assets/cache/*.ts lib/engine/runtime/assets/cleanup/*.ts lib/engine/runtime/assets/api/*.ts

# Complexité (fonctions > 20 lignes)
grep -n "^export async function\|^async function\|^function" lib/admin/settings.ts lib/admin/permissions.ts lib/admin/audit.ts
```

---

## 📊 CRITÈRES DE SUCCÈS

| Critère | Minimum | Cible |
|---------|---------|-------|
| Build TypeScript | 0 erreurs | 0 erreurs, 0 warnings critiques |
| Tests Vitest | 400+ pass | 404 pass (maintien) |
| Couverture types | 80% | 90%+ strict |
| Gestion erreurs | try/catch dans toutes les fonctions async | Erreurs métier custom |
| Documentation JSDoc | Headers présents | Exemples d'usage |

---

## 🚨 ÉCARTS COMMUNS À VÉRIFIER

1. **Missing RLS policies** : Vérifier que les queries Supabase respectent RLS
2. **Type any** : Vérifier pas de `any` implicites (sauf cas justifiés)
3. **Missing awaits** : Vérifier que tous les Promises sont awaited
4. **Resource leaks** : Vérifier Redis disconnect, pas de connexion ouverte infinie
5. **Error handling** : Vérifier que les erreurs Supabase sont transformées, pas propagées raw

---

## 📝 TEMPLATE DE RAPPORT

```markdown
## Audit Option 1 — [Nom Auditeur]

### Fichiers audités
- [ ] lib/admin/settings.ts — [OK/NOK] — [Notes]
- [ ] lib/admin/permissions.ts — [OK/NOK] — [Notes]
- [ ] lib/admin/audit.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/cache/redis.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/cleanup/worker.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/cleanup/scheduler.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/api/download.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/api/list.ts — [OK/NOK] — [Notes]
- [ ] lib/engine/runtime/assets/api/upload.ts — [OK/NOK] — [Notes]

### Métriques
- Build : [0 erreurs / X erreurs]
- Tests : [X pass / X fail]
- Lignes de code ajoutées : [X]
- Bugs critiques trouvés : [X]

### Recommandations
1. [Action corrective si nécessaire]
2. [Amélioration suggérée]

### Verdict
[APPROVED / NEEDS_FIX / REJECTED]
```

---

**Référence** : Implémentation réalisée 25/04/2026 14:00-17:30 UTC+4  
**Prochaine phase** : Option 2 (Connector Packs) si audit OK
