# 🚀 Hearst OS Launcher

Script automatisé pour démarrer/arrêter tous les backends et frontend du projet Hearst.

## Usage Rapide

```bash
# Démarrer tous les services
npm run launch

# Arrêter tous les services
npm run stop

# Voir les logs en temps réel
tail -f /tmp/hearst-os.log        # Frontend principal (port 9000)
tail -f /tmp/hearst-connect.log   # Backend connexion (port 8100)
tail -f /tmp/hearst-app.log       # Landing page (port 3000)
```

## Ce que fait `npm run launch`

1. **Kill processus existants** sur ports 9000, 8100, 3000
2. **Nettoie les caches** `.next` de tous les projets
3. **Démarre les backends**:
   - `hearst-connect` (port 8100)
   - `Hearst-app` (port 3000)
4. **Démarre le frontend principal**:
   - `hearst-os` (port 9000)

## Services et Ports

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| **hearst-os** | 9000 | http://localhost:9000 | Frontend principal + orchestration v2 |
| **hearst-connect** | 8100 | http://localhost:8100 | Backend de connexion |
| **Hearst-app** | 3000 | http://localhost:3000 | Landing page (@openclaw/frontend) |

## Logs

Tous les logs sont écrits dans `/tmp/`:

```bash
/tmp/hearst-os.log        # Frontend principal
/tmp/hearst-connect.log   # Backend connexion
/tmp/hearst-app.log       # Landing page
```

## Troubleshooting

### Un service ne démarre pas

```bash
# Vérifier les logs
tail -100 /tmp/hearst-os.log

# Vérifier les ports
lsof -i :9000
lsof -i :8100
lsof -i :3000
```

### Redémarrer un service spécifique

```bash
# Arrêter tous les services
npm run stop

# Démarrer uniquement hearst-os
npm run dev

# Démarrer hearst-connect
cd ../hearst-connect && npm run dev

# Démarrer Hearst-app
cd ../Hearst-app && npm run dev
```

### Forcer un clean restart

```bash
# Kill manuel de tous les processus Node
pkill -9 node

# Nettoyer tous les caches
rm -rf .next ../hearst-connect/.next ../Hearst-app/packages/frontend/.next

# Relancer
npm run launch
```

## Scripts Disponibles

| Script | Commande | Description |
|--------|----------|-------------|
| Launch | `npm run launch` | 🚀 Démarre tous les services |
| Stop | `npm run stop` | 🛑 Arrête tous les services |
| Dev | `npm run dev` | Démarre uniquement hearst-os |
| Dev Fresh | `npm run dev:fresh` | Clean + démarre hearst-os |

## Architecture

```
/Users/adrienbeyondcrypto/Dev/
├── hearst-os/          (port 9000) ← Frontend principal
├── hearst-connect/     (port 8100) ← Backend connexion
└── Hearst-app/         (port 3000) ← Landing page
```

## Notes

- Le launcher vérifie que les projets `hearst-connect` et `Hearst-app` existent
- Si un projet n'existe pas, il est ignoré (pas d'erreur)
- Les services démarrent en arrière-plan (nohup)
- Les PIDs sont affichés au démarrage
- Les ports sont vérifiés après le démarrage
