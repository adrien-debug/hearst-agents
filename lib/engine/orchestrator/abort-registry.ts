/**
 * Abort registry — single in-process Map<runId, AbortController> que
 * l'endpoint POST /api/orchestrate/abort/[runId] consulte pour couper
 * un run côté serveur (et pas seulement côté client comme avant).
 *
 * Le registry vit dans le scope du module — partagé entre les routes
 * Next.js qui tournent dans le même worker. Multi-instance : pas de
 * partage cross-worker, mais Vercel route les abort vers une instance
 * proche statistiquement (et un orphan finit par s'auto-destroy via
 * heartbeat 20s + timeout 300s côté route).
 */

const registry = new Map<string, AbortController>();

export function registerRun(runId: string, controller: AbortController): void {
  registry.set(runId, controller);
}

export function unregisterRun(runId: string): void {
  registry.delete(runId);
}

export function abortRun(runId: string): boolean {
  const ctrl = registry.get(runId);
  if (!ctrl) return false;
  if (!ctrl.signal.aborted) ctrl.abort();
  registry.delete(runId);
  return true;
}

export function isRunRegistered(runId: string): boolean {
  return registry.has(runId);
}
