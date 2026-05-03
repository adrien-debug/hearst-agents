# [NOM FEATURE] — `[id]`

## Métadonnées

| Champ | Valeur |
|-------|--------|
| **id** | `feature-id` |
| **statut** | `active` / `review` / `in_progress` / `legacy` / `locked` |
| **owner** | Adrien |
| **dernière revue** | YYYY-MM-DD |
| **version spec** | 1.0 |

## Description

Une à trois phrases sur ce que la feature fait, du point de vue utilisateur.

## Surface publique

### Pages
- [route](path)

### Composants exportés
- [Component.tsx](path) — rôle, props clés

### Endpoints API
- `METHOD /path` — rôle, auth, input, output

## Architecture interne

### Stores Zustand
- `useXxxStore` — selectors utilisés

### Librairies internes
- [lib/path](lib/path) — rôle

### Dépendances externes (npm / services)
- `package@version` — usage
- Service externe — usage

## Data flow

```
[entry point]
  ↓
[step 1]
  ↓
[step 2]
```

## Invariants verrouillés

Choses qui **ne doivent pas changer** sans mise à jour de cette spec :

1. ...
2. ...

## Évolutions autorisées sans spec

Choses qui peuvent évoluer librement :

1. ...
2. ...

## Risques & modes de défaillance

| Risque | Impact | Mitigation actuelle |
|--------|--------|---------------------|
| ... | ... | ... |

## Tests

### Existants
- [path](path) — couverture

### Manquants (gap)
- ...

## Code orphelin (code-ready non câblé)

- [Composant.tsx](path) — pourquoi non câblé, plan

## Notes & historique
