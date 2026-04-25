#!/usr/bin/env bash
# Attend que le port principal réponde, puis ouvre les 3 URLs dans Google Chrome (macOS).
set -u

[[ "${HEARST_OPEN_CHROME:-1}" == "0" ]] && exit 0

CHROME_APP="Google Chrome"

wait_tcp() {
  local port=$1
  local max=${2:-120}
  local i=0
  while [[ $i -lt $max ]]; do
    if nc -z 127.0.0.1 "$port" 2>/dev/null; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# Next bind le port avant le message "Ready" — marge pour 3000/8100
wait_tcp 9000 120 || true
sleep 2

for url in "http://localhost:3000/" "http://localhost:8100/" "http://localhost:9000/"; do
  if ! open -a "$CHROME_APP" "$url" 2>/dev/null; then
    open "$url" 2>/dev/null || true
  fi
  sleep 0.35
done
