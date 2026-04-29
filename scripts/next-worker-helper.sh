#!/usr/bin/env bash
# Audit des workers Next (jest-worker) pour ce dépôt + option pour tuer uniquement les orphelins (PPID 1).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Correspond au chemin absolu du worker compilé Next pour ce clone.
WORKER_SUBPATH="node_modules/next/dist/compiled/jest-worker/processChild.js"
MATCH="${ROOT}/${WORKER_SUBPATH}"

usage() {
  echo "Usage: $(basename "$0") [audit|--kill-orphans]" >&2
  echo "  audit (défaut)  : liste PID, PPID, CPU, parent — marque ORPHELIN si PPID=1" >&2
  echo "  --kill-orphans  : SIGKILL uniquement sur les workers ORPHELIN (ne touche pas à next build actif)" >&2
}

audit_one() {
  local pid="$1"
  local ppid cpu etime comm parent_line
  ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
  cpu="$(ps -p "$pid" -o %cpu= 2>/dev/null | tr -d ' ' || echo "?")"
  etime="$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ' || echo "?")"
  comm="$(ps -p "$pid" -o command= 2>/dev/null | head -c 100 || true)"
  if [[ -z "$ppid" ]]; then
    echo "  $pid  (processus introuvable)"
    return
  fi
  if [[ "$ppid" == "1" ]]; then
    echo "  $pid  PPID=1  ORPHELIN  CPU=${cpu}%  ELAPSED=${etime}"
    echo "       ${comm}"
  else
    parent_line="$(ps -p "$ppid" -o command= 2>/dev/null | head -c 120 || echo "(parent inconnu)")"
    echo "  $pid  PPID=${ppid}  CPU=${cpu}%  ELAPSED=${etime}"
    echo "       worker: ${comm}"
    echo "       parent: ${parent_line}"
  fi
}

cmd_audit() {
  echo "=== Workers Next (jest-worker) — ${ROOT} ==="
  local pids
  pids="$(pgrep -f "$MATCH" 2>/dev/null || true)"
  if [[ -z "${pids// }" ]]; then
    echo "Aucun processus trouvé pour :"
    echo "  $MATCH"
  else
    for pid in $pids; do
      audit_one "$pid"
      echo "---"
    done
  fi
  echo "Load / uptime:"
  uptime
}

cmd_kill_orphans() {
  local pids pid ppid killed=0
  pids="$(pgrep -f "$MATCH" 2>/dev/null || true)"
  if [[ -z "${pids// }" ]]; then
    echo "Aucun worker à traiter."
    exit 0
  fi
  for pid in $pids; do
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    if [[ "$ppid" == "1" ]]; then
      echo "SIGKILL orphelin PID=$pid"
      kill -9 "$pid" 2>/dev/null || true
      killed=$((killed + 1))
    fi
  done
  if [[ "$killed" -eq 0 ]]; then
    echo "Aucun orphelin (PPID=1) — rien tué. Un next build en cours a des workers avec parent vivant."
  else
    echo "Terminé : $killed orphelin(s) tué(s)."
  fi
}

case "${1:-audit}" in
  -h|--help|help) usage; exit 0 ;;
  audit|'') cmd_audit ;;
  --kill-orphans) cmd_kill_orphans ;;
  *) usage; exit 1 ;;
esac
