#!/bin/bash
# Hearst OS - Stopper tous les services

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Arrêt de tous les services Hearst...${NC}"
echo ""

# Kill ports
for port in 9000 8100 3000; do
  if lsof -ti tcp:$port >/dev/null 2>&1; then
    echo -e "  ${RED}✗${NC} Arrêt du port $port..."
    lsof -ti tcp:$port | xargs kill -9 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} Port $port libéré"
  else
    echo -e "  ${GREEN}✓${NC} Port $port déjà libre"
  fi
done

echo ""
echo -e "${GREEN}✓ Tous les services sont arrêtés${NC}"
echo ""
