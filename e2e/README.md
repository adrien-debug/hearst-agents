# E2E Tests — Playwright

**Prérequis** : L'application doit être en cours d'exécution avant de lancer les tests E2E.

## Installation

```bash
npm install
npx playwright install chromium
```

## Lancer l'application

Terminal 1 :
```bash
npm run dev
```

Attendre que le serveur soit prêt sur `http://localhost:9000`.

## Lancer les tests E2E

Terminal 2 :
```bash
npm run test:e2e
```

## Mode UI (debug visuel)

```bash
npm run test:e2e:ui
```

## Structure des tests

| Fichier | Description | Auth requise |
|---------|-------------|--------------|
| `smoke.spec.ts` | Health, login FR, responsive | ❌ Non (login page) |
| `happy-path.spec.ts` | Flow complet, mobile, toasts | ✅ Oui (session) |
| `analytics.spec.ts` | Events API validation | ❌ Non (API direct) |

## Configuration

Multi-device :
- Desktop Chrome (1280×800)
- iPhone 12 (390×844)
- Pixel 5 (393×851)

## Variables d'environnement

```bash
# URL personnalisée
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## Notes

- Les tests `happy-path.spec.ts` nécessitent une session authentifiée
- Utiliser `HEARST_DEV_AUTH_BYPASS=1` en dev pour contourner l'auth
- En CI, configurer des credentials de test ou mocker l'OAuth
