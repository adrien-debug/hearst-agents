#!/usr/bin/env bash
# launch-hearst.sh — Lance Hearst OS en mode dev Electron.
#
# 1. Kill tout process sur le port 9001
# 2. Démarre Next.js en arrière-plan
# 3. Attend que le serveur soit prêt (polling /api/health)
# 4. Lance Electron (fenêtre app)
# 5. À la fermeture d'Electron, kill Next.js proprement

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

PORT=9001

# ── Kill tous les serveurs Next.js existants ────────────────────────────────
echo "🔄  Arrêt des serveurs Next.js existants..."
# Kill par port (9001 + 9000 legacy)
lsof -ti tcp:9001 | xargs kill -9 2>/dev/null || true
lsof -ti tcp:9000 | xargs kill -9 2>/dev/null || true
# Kill tous les processus next-server / next dev résiduels
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1

# ── Démarrer Next.js ─────────────────────────────────────────────────────────
echo "🚀  Démarrage Next.js sur le port $PORT..."
unset ELECTRON_RUN_AS_NODE
npm run dev > /tmp/hearst-next.log 2>&1 &
NEXT_PID=$!

# ── Attendre que le serveur soit prêt ────────────────────────────────────────
echo "⏳  Attente du serveur..."
MAX_WAIT=60
WAITED=0
until curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; do
  # Vérifier que Next.js est toujours vivant
  if ! kill -0 $NEXT_PID 2>/dev/null; then
    echo "❌  Next.js s'est arrêté de façon inattendue"
    echo "    Dernières lignes du log :"
    tail -20 /tmp/hearst-next.log
    exit 1
  fi
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "❌  Timeout — Next.js n'a pas démarré en ${MAX_WAIT}s"
    echo "    Log : /tmp/hearst-next.log"
    kill $NEXT_PID 2>/dev/null || true
    exit 1
  fi
  sleep 0.5
  WAITED=$((WAITED + 1))
done
echo "✅  Hearst OS prêt sur http://localhost:$PORT"

# ── Lancer Electron ──────────────────────────────────────────────────────────
npm run electron:compile > /dev/null 2>&1
unset ELECTRON_RUN_AS_NODE
"$(npm bin)/electron" . || true

# ── Nettoyage ────────────────────────────────────────────────────────────────
echo "🛑  Arrêt de Next.js (pid $NEXT_PID)..."
kill $NEXT_PID 2>/dev/null || true
lsof -ti tcp:$PORT | xargs kill -9 2>/dev/null || true
echo "✓  Hearst OS arrêté."
