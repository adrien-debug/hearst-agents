#!/bin/bash
# Hearst OS - Launcher
# Kill et redémarre tous les backends + frontend

set -e

echo "🚀 Hearst OS Launcher"
echo "===================="
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 1. Kill processus existants
echo -e "${YELLOW}1. Arrêt des processus existants...${NC}"
echo ""

# Port 9000 (hearst-os)
if lsof -ti tcp:9000 >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Port 9000 occupé, kill en cours..."
  lsof -ti tcp:9000 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo -e "  ${GREEN}✓${NC} Port 9000 libéré"
else
  echo -e "  ${GREEN}✓${NC} Port 9000 libre"
fi

# Port 8100 (hearst-connect)
if lsof -ti tcp:8100 >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Port 8100 occupé, kill en cours..."
  lsof -ti tcp:8100 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo -e "  ${GREEN}✓${NC} Port 8100 libéré"
else
  echo -e "  ${GREEN}✓${NC} Port 8100 libre"
fi

# Port 3000 (Hearst-app)
if lsof -ti tcp:3000 >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Port 3000 occupé, kill en cours..."
  lsof -ti tcp:3000 | xargs kill -9 2>/dev/null || true
  sleep 1
  echo -e "  ${GREEN}✓${NC} Port 3000 libéré"
else
  echo -e "  ${GREEN}✓${NC} Port 3000 libre"
fi

echo ""

# 2. Nettoyage caches
echo -e "${YELLOW}2. Nettoyage des caches Next.js...${NC}"
echo ""

# hearst-os
if [ -d ".next" ]; then
  rm -rf .next
  echo -e "  ${GREEN}✓${NC} hearst-os/.next supprimé"
fi

# hearst-connect
if [ -d "../hearst-connect/.next" ]; then
  rm -rf ../hearst-connect/.next
  echo -e "  ${GREEN}✓${NC} hearst-connect/.next supprimé"
fi

# Hearst-app
if [ -d "../Hearst-app/packages/frontend/.next" ]; then
  rm -rf ../Hearst-app/packages/frontend/.next
  echo -e "  ${GREEN}✓${NC} Hearst-app/.next supprimé"
fi

echo ""
sleep 1

# 3. Démarrage des backends
echo -e "${YELLOW}3. Démarrage des backends...${NC}"
echo ""

# Backend 1: hearst-connect (port 8100)
if [ -d "../hearst-connect" ]; then
  echo -e "  ${CYAN}▶${NC} hearst-connect (port 8100)..."
  cd ../hearst-connect
  nohup npm run dev > /tmp/hearst-connect.log 2>&1 &
  CONNECT_PID=$!
  echo -e "  ${GREEN}✓${NC} PID: $CONNECT_PID"
  cd - >/dev/null
else
  echo -e "  ${RED}✗${NC} hearst-connect non trouvé"
fi

sleep 3

# Backend 2: Hearst-app (port 3000)
if [ -d "../Hearst-app" ]; then
  echo -e "  ${CYAN}▶${NC} Hearst-app landing (port 3000)..."
  cd ../Hearst-app
  nohup npm run dev > /tmp/hearst-app.log 2>&1 &
  APP_PID=$!
  echo -e "  ${GREEN}✓${NC} PID: $APP_PID"
  cd - >/dev/null
else
  echo -e "  ${RED}✗${NC} Hearst-app non trouvé"
fi

sleep 3

echo ""

# 4. Démarrage du frontend principal (hearst-os)
echo -e "${YELLOW}4. Démarrage du frontend principal (hearst-os)...${NC}"
echo ""

echo -e "  ${CYAN}▶${NC} hearst-os (port 9000)..."
mkdir -p .next
xattr -w com.apple.fileprovider.ignore#P 1 .next 2>/dev/null || true

# Démarrage en arrière-plan
nohup npm run dev:solo > /tmp/hearst-os.log 2>&1 &
OS_PID=$!
echo -e "  ${GREEN}✓${NC} PID: $OS_PID"

sleep 5

echo ""
echo -e "${GREEN}===================="
echo -e "✓ Tous les services sont démarrés${NC}"
echo ""
echo -e "${CYAN}Services actifs:${NC}"
echo ""

# Vérification des ports
for port in 3000 8100 9000; do
  if lsof -ti tcp:$port >/dev/null 2>&1; then
    pid=$(lsof -ti tcp:$port)
    case $port in
      3000) name="Hearst-app (landing)" ;;
      8100) name="hearst-connect" ;;
      9000) name="hearst-os (main)" ;;
    esac
    echo -e "  ${GREEN}✓${NC} Port $port: $name (PID: $pid)"
  else
    echo -e "  ${RED}✗${NC} Port $port: Non actif"
  fi
done

echo ""
echo -e "${CYAN}URLs:${NC}"
echo ""
echo -e "  🌐 hearst-os:      ${GREEN}http://localhost:9000${NC}"
echo -e "  🌐 hearst-connect: ${GREEN}http://localhost:8100${NC}"
echo -e "  🌐 Hearst-app:     ${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${CYAN}Logs:${NC}"
echo ""
echo -e "  📄 hearst-os:      tail -f /tmp/hearst-os.log"
echo -e "  📄 hearst-connect: tail -f /tmp/hearst-connect.log"
echo -e "  📄 Hearst-app:     tail -f /tmp/hearst-app.log"
echo ""
echo -e "${YELLOW}Pour arrêter tous les services:${NC}"
echo -e "  ./launch.sh stop"
echo ""
