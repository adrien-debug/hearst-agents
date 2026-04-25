#!/usr/bin/env bash
# Démarre hearst-connect (8100), Hearst-app (3000), puis hearst-os (9000) au premier plan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

for port in 9000 8100 3000; do
  lsof -ti tcp:"$port" | xargs kill -9 2>/dev/null || true
done
sleep 1

mkdir -p .next
xattr -w com.apple.fileprovider.ignore#P 1 .next 2>/dev/null || true

if [[ -d "$ROOT/../hearst-connect" ]]; then
  echo "▶ hearst-connect → :8100 (log: /tmp/hearst-connect.log)"
  : > /tmp/hearst-connect.log
  (cd "$ROOT/../hearst-connect" && nohup npm run dev >> /tmp/hearst-connect.log 2>&1) &
else
  echo "⚠ ../hearst-connect introuvable — port 8100 ignoré"
fi

sleep 2

if [[ -d "$ROOT/../Hearst-app" ]]; then
  echo "▶ Hearst-app → :3000 (log: /tmp/hearst-app.log)"
  : > /tmp/hearst-app.log
  (cd "$ROOT/../Hearst-app" && nohup npm run dev >> /tmp/hearst-app.log 2>&1) &
else
  echo "⚠ ../Hearst-app introuvable — port 3000 ignoré"
fi

sleep 2

echo "▶ hearst-os → :9000 (ce terminal)"
exec npm run dev:solo
